// Ingest club squads from English Wikipedia.
//
//  * Current squads come from the {{Fs player}} template on each club's main article.
//  * Historical squads come from "<season> <club> season" articles, which use either
//    {{Fs player}} or a squad-statistics wikitable.
//
// Source:  https://en.wikipedia.org  (content licensed CC BY-SA 4.0)
// Output:  data/raw/clubs.json
import { fetchWikitext, findTemplates, cleanText, linkTarget, writeRaw, readRaw, log } from './lib/wiki.mjs';
import { allCurrentClubs, HISTORICAL_CLUB_SEASONS } from './clubs.config.mjs';

const CURRENT_SEASON = '2025-26';

function normalisePosition(raw) {
  const p = (raw || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (p.startsWith('GK')) return 'GK';
  if (p.startsWith('DF')) return 'DF';
  if (p.startsWith('MF')) return 'MF';
  if (p.startsWith('FW')) return 'FW';
  return null;
}

/** Slice out the "Current squad" section so we don't pick up the reserves / academy lists. */
function currentSquadSlice(wikitext) {
  const lower = wikitext.toLowerCase();
  const startMarkers = ['==current squad', '===current squad', '==first-team squad', '===first-team squad', '==players', '===players'];
  let start = -1;
  for (const m of startMarkers) {
    const at = lower.indexOf(m);
    if (at !== -1 && (start === -1 || at < start)) start = at;
  }
  if (start === -1) return wikitext;
  const endMarkers = ['out on loan', 'reserve', 'academy', 'former players', 'club officials', 'retired number', 'notable player'];
  let end = wikitext.length;
  for (const m of endMarkers) {
    const at = lower.indexOf(m, start + 40);
    if (at !== -1 && at < end) end = at;
  }
  return wikitext.slice(start, end);
}

function parseFsPlayers(wikitext) {
  const templates = findTemplates(wikitext, ['fs player']);
  const players = [];
  const seen = new Set();
  for (const t of templates) {
    const name = cleanText(t.params.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    players.push({
      name,
      wikiTitle: linkTarget(t.params.name),
      shirt: t.params.no ? Number(String(t.params.no).replace(/\D/g, '')) || null : null,
      position: normalisePosition(t.params.pos),
      nationality: (t.params.nat || '').trim().toUpperCase() || null,
      note: cleanText(t.params.other) || null,
    });
  }
  return players;
}

/**
 * Historical season articles often list the squad as a wikitable whose rows look like
 * `| 7 || {{flagicon|POR}} || FW || [[Cristiano Ronaldo]] || ...`
 */
function parseSquadTable(wikitext) {
  const players = [];
  const seen = new Set();
  const rowRe = /^\|\s*(\d{1,2})?\s*\|\|([\s\S]*?)$/gm;
  let m;
  while ((m = rowRe.exec(wikitext))) {
    const rest = m[2];
    const posMatch = rest.match(/\|\|\s*\{?\{?[^|]*?\b(GK|DF|MF|FW|CB|LB|RB|DM|CM|AM|LW|RW|ST|CF)\b/i);
    const linkMatch = rest.match(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/);
    if (!posMatch || !linkMatch) continue;
    const name = cleanText(linkMatch[2] || linkMatch[1]);
    if (!name || name.length < 3 || seen.has(name)) continue;
    const natMatch = rest.match(/\{\{\s*(?:flagicon|fb|flagg)\s*\|(?:[a-z]+\|)?([A-Za-z ]{3,})\s*[|}]/i);
    seen.add(name);
    players.push({
      name,
      wikiTitle: linkMatch[1].replace(/_/g, ' '),
      shirt: m[1] ? Number(m[1]) : null,
      position: normalisePosition(posMatch[1]) || mapDetailedPosition(posMatch[1]),
      nationality: natMatch ? natMatch[1].trim().toUpperCase().slice(0, 3) : null,
      note: null,
    });
  }
  return players;
}

function mapDetailedPosition(p) {
  const u = p.toUpperCase();
  if (['CB', 'LB', 'RB'].includes(u)) return 'DF';
  if (['DM', 'CM', 'AM'].includes(u)) return 'MF';
  if (['LW', 'RW', 'ST', 'CF'].includes(u)) return 'FW';
  return null;
}

async function ingestCurrent() {
  const clubs = allCurrentClubs();
  log(`Fetching ${clubs.length} current club squads...`);
  const out = [];
  for (const club of clubs) {
    const res = await fetchWikitext(club.wiki);
    if (!res) {
      log(`  MISS ${club.name}`);
      continue;
    }
    const slice = currentSquadSlice(res.wikitext);
    let players = parseFsPlayers(slice);
    if (players.length < 11) players = parseFsPlayers(res.wikitext);
    if (players.length < 11) {
      log(`  THIN ${club.name} (${players.length})`);
      if (players.length < 8) continue;
    }
    out.push({ ...club, season: CURRENT_SEASON, sourceTitle: res.title, players });
    log(`  OK   ${club.name}: ${players.length}`);
  }
  return out;
}

async function ingestHistorical() {
  log(`Fetching ${HISTORICAL_CLUB_SEASONS.length} historical club seasons...`);
  const out = [];
  let ok = 0;
  for (const entry of HISTORICAL_CLUB_SEASONS) {
    const res = await fetchWikitext(entry.wiki);
    if (!res) continue;
    let players = parseFsPlayers(res.wikitext);
    if (players.length < 14) {
      const table = parseSquadTable(res.wikitext);
      if (table.length > players.length) players = table;
    }
    if (players.length < 14) continue;
    out.push({ ...entry, sourceTitle: res.title, players: players.slice(0, 40) });
    ok++;
    if (ok % 25 === 0) log(`  ...${ok} historical squads so far`);
  }
  log(`  historical squads parsed: ${ok}/${HISTORICAL_CLUB_SEASONS.length}`);
  return out;
}

async function main() {
  const only = process.argv[2];
  const existing = readRaw('clubs.json') || {};
  const current = only === '--historical' ? existing.current || [] : await ingestCurrent();
  const historical = only === '--current' ? existing.historical || [] : await ingestHistorical();
  writeRaw('clubs.json', {
    fetchedAt: new Date().toISOString(),
    source: 'en.wikipedia.org (CC BY-SA 4.0)',
    current,
    historical,
  });
  log(`Done: ${current.length} current squads, ${historical.length} historical squads.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
