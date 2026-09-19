// Shared helpers for the Wikipedia / Wikidata ingestion scripts.
// All requests are polite: identified UA, sequential with a small delay.
import fs from 'node:fs';
import path from 'node:path';

export const UA = 'ElNipGame-DataPipeline/1.0 (open-source football draft game; contact: via repo issues)';
export const RAW_DIR = path.join(process.cwd(), 'data', 'raw');
export const DIST_DIR = path.join(process.cwd(), 'data', 'dist');

export function ensureDirs() {
  for (const d of [RAW_DIR, DIST_DIR]) fs.mkdirSync(d, { recursive: true });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function writeRaw(name, obj) {
  ensureDirs();
  fs.writeFileSync(path.join(RAW_DIR, name), JSON.stringify(obj, null, 0));
}

export function readRaw(name) {
  const p = path.join(RAW_DIR, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function writeDist(name, obj) {
  ensureDirs();
  fs.writeFileSync(path.join(DIST_DIR, name), JSON.stringify(obj));
}

// Wikimedia throttles anonymous API clients aggressively, so every request goes through a
// single paced queue with exponential backoff, and every successful response is cached on
// disk. That makes the whole pipeline resumable: re-running only fetches what is missing.
const CACHE_DIR = path.join(RAW_DIR, 'cache');
const MIN_GAP_MS = Number(process.env.INGEST_GAP_MS || 1100);

function cacheKey(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h * 33) ^ url.charCodeAt(i)) >>> 0;
  return h.toString(36) + '-' + url.length.toString(36);
}

function readCache(url) {
  const p = path.join(CACHE_DIR, cacheKey(url) + '.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(url, value) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey(url) + '.json'), JSON.stringify(value));
}

let lastCall = 0;
let queue = Promise.resolve();

async function requestJson(url, retries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const gap = Date.now() - lastCall;
    if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
    lastCall = Date.now();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Encoding': 'gzip' },
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500 || !text.trimStart().startsWith('{')) {
        throw new Error('throttled/http ' + res.status);
      }
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, json: JSON.parse(text) };
    } catch (err) {
      if (attempt === retries) return { ok: false, error: String(err) };
      await sleep(1500 * 2 ** attempt + Math.random() * 500);
    }
  }
  return { ok: false };
}

/** Serialise every outbound call so the pacing above actually holds. */
function throttled(url, { retries = 4, cache = true } = {}) {
  if (cache) {
    const hit = readCache(url);
    if (hit) return Promise.resolve(hit);
  }
  const run = queue.then(async () => {
    const r = await requestJson(url, retries);
    if (cache && r.ok) writeCache(url, r);
    return r;
  });
  queue = run.catch(() => {});
  return run;
}

/** Fetch raw wikitext for an English Wikipedia page. Returns null when missing. */
export async function fetchWikitext(title) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&redirects=1&prop=wikitext&page=' +
    encodeURIComponent(title);
  const r = await throttled(url);
  if (!r.ok || !r.json || r.json.error) return null;
  return { title: r.json.parse.title, wikitext: r.json.parse.wikitext };
}

/** Batch Wikidata entity lookup by enwiki page titles (max 50 per call). */
export async function fetchWikidataByTitles(titles) {
  const url =
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&formatversion=2&sites=enwiki&languages=en' +
    '&props=claims|sitelinks|labels&titles=' +
    encodeURIComponent(titles.join('|'));
  const r = await throttled(url);
  if (!r.ok || !r.json || r.json.error) return null;
  return r.json.entities || null;
}

// ---------------------------------------------------------------------------
// Wikitext parsing
// ---------------------------------------------------------------------------

/** Split "{{tpl|a=1|b={{x|y}}}}" into its top-level parameters. */
export function parseTemplateParams(body) {
  const params = {};
  let depth = 0;
  let buf = '';
  const parts = [];
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      buf += two;
      i++;
      continue;
    }
    if (two === '}}' || two === ']]') {
      depth--;
      buf += two;
      i++;
      continue;
    }
    if (body[i] === '|' && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += body[i];
  }
  parts.push(buf);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (!key || /[{}\[\]]/.test(key)) continue;
    params[key] = part.slice(eq + 1).trim();
  }
  return params;
}

/**
 * Find every occurrence of {{name|...}} (case-insensitive) and return parsed params.
 *
 * Note: we search with a regex rather than lowercasing the haystack. Some characters
 * (Turkish "İ", for one) change length under toLowerCase, which would shift every
 * subsequent index and silently truncate the results.
 */
export function findTemplates(wikitext, names) {
  const out = [];
  for (const name of names) {
    const pattern = new RegExp('\\{\\{\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ _]') + '\\s*(?=[|}])', 'gi');
    let m;
    while ((m = pattern.exec(wikitext))) {
      const at = m.index;
      pattern.lastIndex = at + 2;
      // Scan to the matching close brace. Bounded, because a single malformed template
      // on a page must not swallow everything after it.
      const limit = Math.min(wikitext.length - 1, at + 6000);
      let depth = 0;
      let end = -1;
      for (let i = at; i < limit; i++) {
        const pair = wikitext[i] + wikitext[i + 1];
        if (pair === '{{') {
          depth++;
          i++;
        } else if (pair === '}}') {
          depth--;
          i++;
          if (depth <= 0) {
            end = i + 1;
            break;
          }
        }
      }
      if (end === -1) continue;
      const inner = wikitext.slice(at + 2, end - 2);
      const pipe = inner.indexOf('|');
      if (pipe === -1) continue;
      out.push({ name, start: at, end, params: parseTemplateParams(inner.slice(pipe + 1)) });
      pattern.lastIndex = end;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Turn "[[Target|Label]]" / "[[Page]]" / plain text into readable plain text. */
export function cleanText(raw) {
  if (!raw) return '';
  let s = raw;
  s = s.replace(/<ref[^>]*\/>/g, '');
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/\{\{sortname\|([^|}]+)\|([^|}]+)[^}]*\}\}/gi, '$1 $2');
  s = s.replace(/\{\{nowrap\|([^}]*)\}\}/gi, '$1');
  s = s.replace(/\{\{[^{}]*\}\}/g, '');
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1');
  s = s.replace(/'''?/g, '');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Extract the wiki page title a link points at, for Wikidata enrichment. */
export function linkTarget(raw) {
  if (!raw) return null;
  const m = raw.match(/\[\[([^\]|#]+)/);
  if (!m) return null;
  const t = m[1].trim();
  if (!t || t.startsWith('File:') || t.startsWith('Image:')) return null;
  return t.replace(/_/g, ' ');
}

/** Pull a birth date out of {{birth date and age2|df=y|2022|11|20|1986|10|16}} and friends. */
export function parseBirthDate(raw) {
  if (!raw) return null;
  const nums = raw.match(/\{\{\s*birth[^}]*\}\}/i);
  if (!nums) {
    const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    return iso ? iso[0] : null;
  }
  const digits = [...nums[0].matchAll(/\|\s*(\d{1,4})\s*(?=[|}])/g)].map((m) => Number(m[1]));
  // "birth date and age2" carries the reference date first, then the birth date.
  const groups = [];
  for (let i = 0; i + 2 < digits.length; i++) {
    if (digits[i] > 1200 && digits[i] < 2100 && digits[i + 1] >= 1 && digits[i + 1] <= 12 && digits[i + 2] >= 1 && digits[i + 2] <= 31) {
      groups.push([digits[i], digits[i + 1], digits[i + 2]]);
      i += 2;
    }
  }
  if (!groups.length) return null;
  const chosen = /age2/i.test(nums[0]) && groups.length > 1 ? groups[1] : groups[0];
  const [y, m, d] = chosen;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

export function log(...args) {
  process.stdout.write(args.join(' ') + '\n');
}
