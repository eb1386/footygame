// Normalise every raw source into the game's internal schema and write data/dist.
//
// Inputs:  data/raw/{fpl,clubs,tournaments,wikidata}.json
// Outputs: data/dist/{players,squads,teams,competitions,manifest}.json
//
// Imports are idempotent: running this again over the same raw files produces byte-identical
// output, and ids are derived from the content rather than from insertion order.
import { readRaw, writeDist, slug, log } from './lib/wiki.mjs';
import { PREMIER_LEAGUE_2025_26, LA_LIGA_2025_26, CHAMPIONS_LEAGUE_2025_26, allCurrentClubs } from './clubs.config.mjs';

// The rating model lives in the app so gameplay and the pipeline can never drift apart.
// Node strips the TypeScript types natively, so we import the real module directly.
import { computeRatings, refinePosition, squadStrengthFrom } from '../../src/lib/core/ratings.ts';

// ---------------------------------------------------------------------------

const wikidata = readRaw('wikidata.json') || { players: {}, nationalities: {} };
const NATIONALITY = wikidata.nationalities || {};

function wdFor(title) {
  if (!title) return null;
  const rec = wikidata.players?.[title];
  if (!rec || rec.missing) return null;
  return rec;
}

function nationalityOf(rec, fallback) {
  if (rec?.nationalityIds?.length) {
    const label = NATIONALITY[rec.nationalityIds[0]];
    if (label) return label;
  }
  return fallback || null;
}

function ageAt(birthDate, year) {
  if (!birthDate) return null;
  const y = Number(String(birthDate).slice(0, 4));
  if (!y || y < 1850) return null;
  return year - y;
}

function eraFor(year) {
  if (year < 1970) return 'pre-1970';
  if (year < 1980) return '1970s';
  if (year < 1990) return '1980s';
  if (year < 2000) return '1990s';
  if (year < 2010) return '2000s';
  if (year < 2020) return '2010s';
  return 'modern';
}

/** Stable identity for a footballer across squads and seasons. */
function personIdFor(name, wikiTitle) {
  return 'p_' + slug(wikiTitle || name);
}

// ---------------------------------------------------------------------------
// Output accumulators
// ---------------------------------------------------------------------------

const players = new Map(); // id -> PlayerSeason
const squads = new Map(); // id -> Squad
const teams = new Map(); // id -> Team
const competitions = new Map();

function registerTeam(team) {
  if (!teams.has(team.id)) teams.set(team.id, team);
  return teams.get(team.id);
}

function registerCompetition(comp) {
  if (!competitions.has(comp.id)) competitions.set(comp.id, { ...comp, squadIds: [] });
  return competitions.get(comp.id);
}

const PALETTE = [
  ['#e2231a', '#ffffff', '#ffffff'], ['#0b2c5e', '#ffffff', '#ffffff'],
  ['#0a7d33', '#ffffff', '#ffffff'], ['#f5b301', '#111111', '#111111'],
  ['#5b21b6', '#ffffff', '#ffffff'], ['#0d9488', '#ffffff', '#ffffff'],
  ['#c2410c', '#ffffff', '#ffffff'], ['#111827', '#f5b301', '#ffffff'],
  ['#be123c', '#ffffff', '#ffffff'], ['#1d4ed8', '#ffffff', '#ffffff'],
];
function colorsFor(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const [primary, secondary, text] = PALETTE[h % PALETTE.length];
  return { primary, secondary, text };
}

/** Add one squad and its players. */
function addSquad({ teamId, teamName, teamCode, kind, country, season, year, competitionId, competitionName, source, rawPlayers, baseStrength }) {
  const squadId = `${competitionId}_${slug(teamName)}_${slug(season)}`;
  if (squads.has(squadId)) return squads.get(squadId);

  registerTeam({
    id: teamId,
    name: teamName,
    code: teamCode,
    kind,
    country,
    badge: kind === 'nation' ? `flag:${slug(country || teamName)}` : `crest:${slug(teamName)}`,
    colors: colorsFor(teamName),
  });

  // First pass: build every player with a provisional squad strength, then recompute the
  // squad strength from the results and re-rate. Two passes converge quickly and keep the
  // relationship between squad quality and player quality honest.
  const build = (strength) =>
    rawPlayers.map((rp) => {
      const wd = wdFor(rp.wikiTitle);
      const birthDate = rp.birthDate || wd?.birthDate || null;
      const hint = rp.positionHint || wd?.positions?.[0] || null;
      const { position, secondary } = refinePosition(rp.position, rp.shirt ?? null, hint);
      const ratings = computeRatings({
        position,
        squadStrength: strength,
        sitelinks: wd?.sitelinks ?? null,
        shirt: rp.shirt ?? null,
        starter: rp.starter,
        age: ageAt(birthDate, year),
        caps: rp.caps ?? null,
        intlGoals: rp.intlGoals ?? null,
        performance: rp.performance ?? null,
        valuation: rp.valuation ?? null,
        year,
      });
      return {
        id: `${squadId}:${slug(rp.name)}`,
        personId: personIdFor(rp.name, rp.wikiTitle),
        name: rp.name,
        squadId,
        nationality: nationalityOf(wd, rp.nationality),
        birthDate,
        shirt: rp.shirt ?? null,
        position,
        secondary,
        overall: ratings.overall,
        attack: ratings.attack,
        defence: ratings.defence,
        goalkeeping: ratings.goalkeeping,
        starter: ratings.starter,
        legendary: ratings.legendary,
      };
    });

  // Rate once, against the club's own prior. Feeding the derived squad strength back into
  // the ratings and re-rating amplifies: a strong squad lifts its players, which lifts the
  // squad, which lifts the players again, and a whole first eleven ends up in the nineties.
  const built = build(baseStrength);
  const strength = squadStrengthFrom(built.map((p) => p.overall));

  // Keep squads to a sensible size — the draft offers a squad, not a whole club database.
  built.sort((a, b) => b.overall - a.overall);
  const kept = built.slice(0, 30);
  for (const p of kept) players.set(p.id, p);

  const squad = {
    id: squadId,
    teamId,
    teamName,
    teamCode,
    kind,
    country,
    season,
    competitionId,
    competitionName,
    competitionIds: [],
    year,
    era: eraFor(year),
    strength,
    playerIds: kept.map((p) => p.id),
    source,
  };
  squads.set(squadId, squad);
  addToCompetition(squad, competitionId, competitionName);
  return squad;
}

/** A club can be in several competitions at once — a La Liga side also in the Champions League. */
function addToCompetition(squad, competitionId, competitionName) {
  if (!squad.competitionIds.includes(competitionId)) squad.competitionIds.push(competitionId);
  const comp = registerCompetition({ id: competitionId, name: competitionName });
  if (!comp.squadIds.includes(squad.id)) comp.squadIds.push(squad.id);
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * Build a surname -> shirt number index from the Wikipedia club squads. The FPL feed leaves
 * squad numbers null, and a shirt number is what lets us tell a right-back from a centre-back
 * or a winger from a central midfielder.
 */
function wikipediaClubIndex() {
  const raw = readRaw('clubs.json');
  const index = new Map();
  if (!raw) return index;
  for (const squad of raw.current || []) {
    for (const p of squad.players) {
      const entry = { shirt: p.shirt ?? null, position: p.position, wikiTitle: p.wikiTitle || null };
      const key = slug(p.name);
      if (!index.has(key)) index.set(key, entry);
      const surname = slug(p.name.split(' ').slice(-1)[0]);
      if (surname.length > 3 && !index.has('s:' + surname)) index.set('s:' + surname, entry);
    }
  }
  return index;
}

/** Premier League from the FPL API — the one source with real season performance data. */
function ingestFpl() {
  const raw = readRaw('fpl.json');
  if (!raw) {
    log('  (no fpl.json, skipping Premier League performance data)');
    return new Map();
  }
  const wiki = wikipediaClubIndex();
  const wikiFor = (p) =>
    wiki.get(slug(p.knownName || p.name)) ||
    wiki.get(slug(p.webName)) ||
    wiki.get('s:' + slug(p.lastName.split(' ').slice(-1)[0])) ||
    null;
  const byClub = new Map();
  for (const p of raw.players) {
    if (!p.club || !p.position) continue;
    if (!byClub.has(p.club)) byClub.set(p.club, []);
    byClub.get(p.club).push(p);
  }

  // Normalise performance and valuation WITHIN each position group.
  //
  // FPL scoring is heavily position-biased: a forward banks points for goals, a centre-back
  // mostly does not. Ranking the whole league on one scale therefore rates every defender and
  // goalkeeper far below every attacker, which is how Van Dijk ended up beneath a squad
  // forward. Comparing defenders to defenders fixes it.
  const groups = new Map();
  for (const p of raw.players) {
    if (!p.position) continue;
    if (!groups.has(p.position)) groups.set(p.position, []);
    groups.get(p.position).push(p);
  }

  const percentiles = new Map(); // position -> { price: sorted[], per90: sorted[] }
  for (const [position, list] of groups) {
    percentiles.set(position, {
      price: list.map((p) => p.price || 0).sort((a, b) => a - b),
      per90: list
        .filter((p) => p.minutes >= 450)
        .map((p) => (p.totalPoints / Math.max(1, p.minutes)) * 90)
        .sort((a, b) => a - b),
    });
  }

  /** Where a value sits in its position's distribution, 0-1. */
  const rank = (sorted, value) => {
    if (!sorted.length) return null;
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo / Math.max(1, sorted.length - 1);
  };

  const perf = (p) => {
    // Five games of points is noise; require a meaningful sample before it counts.
    if (p.minutes < 450) return null;
    const dist = percentiles.get(p.position);
    if (!dist) return null;
    return rank(dist.per90, (p.totalPoints / Math.max(1, p.minutes)) * 90);
  };

  const valuation = (p) => {
    const dist = percentiles.get(p.position);
    if (!dist) return null;
    return rank(dist.price, p.price || 0);
  };

  const clubMeta = new Map(PREMIER_LEAGUE_2025_26.map((c) => [c.fpl || c.name, c]));
  const squadByClubName = new Map();

  for (const [clubName, list] of byClub) {
    const meta = clubMeta.get(clubName) || { name: clubName, code: (list[0].clubCode || clubName).slice(0, 3).toUpperCase() };
    const fplTeam = raw.teams.find((t) => t.name === clubName);
    // FPL's own strength rating (1-5) gives a decent prior for how good the club is.
    const prior = fplTeam ? 58 + ((fplTeam.strengthHome + fplTeam.strengthAway) / 2 - 2) * 7 : 66;
    const squad = addSquad({
      teamId: 'club_' + slug(meta.name),
      teamName: meta.name,
      teamCode: meta.code,
      kind: 'club',
      country: 'England',
      season: raw.season,
      year: 2025,
      competitionId: 'premier-league',
      competitionName: 'Premier League',
      source: 'Fantasy Premier League API',
      baseStrength: prior,
      rawPlayers: list.map((p) => {
        // Matching the FPL feed to the club's Wikipedia squad gives us both a shirt number
        // and an article title. Without the title these players would carry no stature signal
        // at all, and every Premier League club would rate far below its European peers.
        const match = wikiFor(p);
        return {
        name: p.knownName || p.name,
        wikiTitle: match?.wikiTitle ?? null,
        shirt: p.shirt ?? match?.shirt ?? null,
        position: p.position,
        birthDate: p.birthDate,
        nationality: p.nationality,
        performance: perf(p),
        valuation: valuation(p),
        starter: p.starts >= 3,
        };
      }),
    });
    squadByClubName.set(meta.name, squad);
  }
  log(`  Premier League: ${squadByClubName.size} squads`);
  return squadByClubName;
}

/** Club squads scraped from Wikipedia — La Liga, the Champions League field and the Album. */
function ingestClubs(existingByName) {
  const raw = readRaw('clubs.json');
  if (!raw) {
    log('  (no clubs.json)');
    return;
  }
  const laLigaNames = new Set(LA_LIGA_2025_26.map((c) => c.name));
  const uclNames = new Set(CHAMPIONS_LEAGUE_2025_26.map((c) => c.name));
  const configByWiki = new Map(allCurrentClubs().map((c) => [c.wiki, c]));

  let count = 0;
  for (const entry of raw.current || []) {
    const cfg = configByWiki.get(entry.wiki) || entry;
    // Clubs already built from the richer FPL feed keep that version.
    const alreadyHave = existingByName.get(cfg.name);
    const competitionId = laLigaNames.has(cfg.name)
      ? 'la-liga'
      : uclNames.has(cfg.name)
        ? 'champions-league'
        : 'clubs';
    const competitionName =
      competitionId === 'la-liga' ? 'La Liga' : competitionId === 'champions-league' ? 'Champions League' : 'Clubs';

    if (alreadyHave) {
      // A Premier League squad that also plays in Europe belongs to both competitions.
      if (uclNames.has(cfg.name)) addToCompetition(alreadyHave, 'champions-league', 'Champions League');
      continue;
    }

    const squad = addSquad({
      teamId: 'club_' + slug(cfg.name),
      teamName: cfg.name,
      teamCode: cfg.code || cfg.name.slice(0, 3).toUpperCase(),
      kind: 'club',
      country: cfg.country || entry.country || null,
      season: entry.season || '2025-26',
      year: 2025,
      competitionId,
      competitionName,
      source: 'Wikipedia',
      baseStrength: 68,
      rawPlayers: entry.players.map((p) => ({
        name: p.name,
        wikiTitle: p.wikiTitle,
        shirt: p.shirt,
        position: p.position,
        nationality: p.nationality,
        starter: p.shirt != null && p.shirt <= 11,
      })),
    });
    // La Liga sides in Europe appear in both fields.
    if (laLigaNames.has(cfg.name)) addToCompetition(squad, 'la-liga', 'La Liga');
    if (uclNames.has(cfg.name)) addToCompetition(squad, 'champions-league', 'Champions League');
    count++;
  }

  for (const entry of raw.historical || []) {
    const year = Number(String(entry.season).slice(0, 4)) || 2000;
    addSquad({
      teamId: 'club_' + slug(entry.club),
      teamName: entry.club,
      teamCode: entry.code,
      kind: 'club',
      country: entry.country,
      season: entry.season,
      year,
      competitionId: 'club-history',
      competitionName: 'Club History',
      source: 'Wikipedia',
      baseStrength: 70,
      rawPlayers: entry.players.map((p) => ({
        name: p.name,
        wikiTitle: p.wikiTitle,
        shirt: p.shirt,
        position: p.position,
        nationality: p.nationality,
        starter: p.shirt != null && p.shirt <= 11,
      })),
    });
  }
  log(`  Clubs: ${count} current, ${(raw.historical || []).length} historical`);
}

/** International tournaments — World Cups, Euros, Copa América. */
function ingestTournaments() {
  const raw = readRaw('tournaments.json');
  if (!raw) {
    log('  (no tournaments.json)');
    return;
  }
  const COMPETITION_NAMES = {
    'world-cup': 'World Cup',
    euros: 'European Championship',
    'copa-america': 'Copa América',
  };
  let squadCount = 0;
  for (const tournament of raw.tournaments) {
    const compName = COMPETITION_NAMES[tournament.competition] || tournament.competition;
    for (const squad of tournament.teams) {
      // Tournament fields are seeded by era: a modern World Cup squad is deeper than a 1930 one.
      const prior = tournament.year >= 2000 ? 72 : tournament.year >= 1970 ? 68 : 63;
      addSquad({
        teamId: 'nation_' + slug(squad.team),
        teamName: squad.team,
        teamCode: squad.team.slice(0, 3).toUpperCase(),
        kind: 'nation',
        country: squad.team,
        season: String(tournament.year),
        year: tournament.year,
        competitionId: tournament.competition,
        competitionName: compName,
        source: 'Wikipedia',
        baseStrength: prior,
        rawPlayers: squad.players.map((p) => ({
          name: p.name,
          wikiTitle: p.wikiTitle,
          shirt: p.shirt,
          position: p.position,
          birthDate: p.birthDate,
          caps: p.caps,
          intlGoals: p.intlGoals,
          starter: p.shirt != null && p.shirt <= 11,
        })),
      });
      squadCount++;
    }
  }
  log(`  Tournaments: ${squadCount} squads`);
}

// ---------------------------------------------------------------------------

async function main() {
  log('Building dataset...');
  const fplSquads = ingestFpl();
  ingestClubs(fplSquads);
  ingestTournaments();

  const playerList = [...players.values()];
  const squadList = [...squads.values()];

  // Mark the very best player-seasons as legendary for the Album.
  const byOverall = [...playerList].sort((a, b) => b.overall - a.overall);
  const legendCut = byOverall[Math.floor(byOverall.length * 0.004)]?.overall ?? 92;
  for (const p of playerList) p.legendary = p.overall >= Math.max(88, legendCut);

  const competitionList = [...competitions.values()].map((c) => ({
    id: c.id,
    name: c.name,
    squadCount: c.squadIds.length,
  }));

  writeDist('players.json', playerList);
  writeDist('squads.json', squadList);
  writeDist('teams.json', [...teams.values()]);
  writeDist('competitions.json', competitionList);
  writeDist('manifest.json', {
    generatedAt: new Date().toISOString(),
    counts: {
      teams: teams.size,
      squads: squadList.length,
      players: playerList.length,
      competitions: competitionList.length,
    },
    sources: [
      {
        name: 'Fantasy Premier League API',
        url: 'https://fantasy.premierleague.com/api/bootstrap-static/',
        licence: 'Public endpoint, used for factual squad and performance data',
        covers: 'Premier League 2025-26 squads, positions, birth dates, season performance',
      },
      {
        name: 'Wikipedia',
        url: 'https://en.wikipedia.org',
        licence: 'CC BY-SA 4.0',
        covers: 'Club current squads, World Cup / Euro / Copa América tournament squads',
      },
      {
        name: 'Wikidata',
        url: 'https://www.wikidata.org',
        licence: 'CC0 1.0',
        covers: 'Birth dates, nationality, playing position, article counts used for stature',
      },
    ],
  });

  log(`Done.`);
  log(`  teams        ${teams.size}`);
  log(`  squads       ${squadList.length}`);
  log(`  players      ${playerList.length}`);
  log(`  competitions ${competitionList.map((c) => `${c.id}(${c.squadCount})`).join(' ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
