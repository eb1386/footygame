// Ingest international tournament squads (World Cups, Euros, Copa America) from
// English Wikipedia "<tournament> squads" articles.
//
// Source:  https://en.wikipedia.org  (content licensed CC BY-SA 4.0)
// Output:  data/raw/tournaments.json
//
// These pages use the {{nat fs g player}} / {{nat fs player}} templates, which carry
// shirt number, position, player name, date of birth, caps, international goals and
// club — everything the draft needs.
import { fetchWikitext, findTemplates, cleanText, linkTarget, parseBirthDate, writeRaw, log } from './lib/wiki.mjs';

const WORLD_CUPS = [
  1930, 1934, 1938, 1950, 1954, 1958, 1962, 1966, 1970, 1974, 1978, 1982, 1986, 1990, 1994, 1998,
  2002, 2006, 2010, 2014, 2018, 2022, 2026,
];
const EUROS = [1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024];
const COPAS = [1987, 1993, 1997, 2001, 2004, 2007, 2011, 2015, 2016, 2019, 2021, 2024];

const PAGES = [
  ...WORLD_CUPS.map((y) => ({ competition: 'world-cup', year: y, title: `${y} FIFA World Cup squads` })),
  ...EUROS.map((y) => ({ competition: 'euros', year: y, title: `UEFA Euro ${y} squads` })),
  ...COPAS.map((y) => ({ competition: 'copa-america', year: y, title: `${y} Copa América squads` })),
];

const SQUAD_TEMPLATES = ['nat fs g player', 'nat fs player', 'nat fs r player', 'nat fs break'];

/** Section headings mark which national team the following players belong to. */
function sectionIndex(wikitext) {
  const marks = [];
  const re = /^(={2,4})\s*([^=\n][^=\n]*?)\s*\1\s*$/gm;
  let m;
  while ((m = re.exec(wikitext))) {
    marks.push({ level: m[1].length, title: cleanText(m[2]), at: m.index });
  }
  return marks;
}

const NON_TEAM_HEADINGS = new Set([
  'contents', 'notes', 'references', 'external links', 'statistics', 'see also',
  'player representation by club', 'player representation by league',
  'player representation by club confederation', 'coach representation by country',
  'age', 'squads', 'group a', 'group b', 'group c', 'group d', 'group e', 'group f',
  'group g', 'group h', 'group i', 'group j', 'group k', 'group l',
]);

function teamForOffset(marks, offset) {
  let best = null;
  for (const mk of marks) {
    if (mk.at > offset) break;
    if (NON_TEAM_HEADINGS.has(mk.title.toLowerCase())) continue;
    if (mk.level >= 3) best = mk;
    else if (mk.level === 2 && !/group/i.test(mk.title)) best = mk;
  }
  return best ? best.title : null;
}

function normalisePosition(raw) {
  const p = (raw || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (p.startsWith('GK')) return 'GK';
  if (p.startsWith('DF')) return 'DF';
  if (p.startsWith('MF')) return 'MF';
  if (p.startsWith('FW')) return 'FW';
  return null;
}

async function ingestPage(page) {
  const res = await fetchWikitext(page.title);
  if (!res) {
    log(`  MISS ${page.title}`);
    return null;
  }
  const { wikitext } = res;
  const marks = sectionIndex(wikitext);
  const templates = findTemplates(wikitext, SQUAD_TEMPLATES);
  const squads = new Map();
  for (const t of templates) {
    const name = cleanText(t.params.name);
    if (!name) continue;
    const team = teamForOffset(marks, t.start);
    if (!team) continue;
    if (!squads.has(team)) squads.set(team, []);
    squads.get(team).push({
      name,
      wikiTitle: linkTarget(t.params.name),
      shirt: t.params.no ? Number(String(t.params.no).replace(/\D/g, '')) || null : null,
      position: normalisePosition(t.params.pos),
      birthDate: parseBirthDate(t.params.age || t.params.dob || ''),
      caps: t.params.caps ? Number(String(t.params.caps).replace(/\D/g, '')) : null,
      intlGoals: t.params.goals ? Number(String(t.params.goals).replace(/\D/g, '')) : null,
      club: cleanText(t.params.club) || null,
      clubNat: (t.params.clubnat || '').trim().toUpperCase() || null,
    });
  }
  const teams = [...squads.entries()]
    .filter(([, players]) => players.length >= 10)
    .map(([team, players]) => ({ team, players }));
  if (!teams.length) {
    log(`  EMPTY ${page.title} (templates=${templates.length})`);
    return null;
  }
  const total = teams.reduce((n, t) => n + t.players.length, 0);
  log(`  OK   ${page.title}: ${teams.length} squads, ${total} players`);
  return { ...page, sourceTitle: res.title, teams };
}

async function main() {
  log(`Ingesting ${PAGES.length} tournament squad pages from Wikipedia...`);
  const out = [];
  for (const page of PAGES) {
    const r = await ingestPage(page);
    if (r) out.push(r);
  }
  const squadCount = out.reduce((n, t) => n + t.teams.length, 0);
  const playerCount = out.reduce((n, t) => n + t.teams.reduce((m, s) => m + s.players.length, 0), 0);
  log(`Done: ${out.length} tournaments, ${squadCount} squads, ${playerCount} player records.`);
  writeRaw('tournaments.json', { fetchedAt: new Date().toISOString(), source: 'en.wikipedia.org (CC BY-SA 4.0)', tournaments: out });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
