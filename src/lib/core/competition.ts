/**
 * Competition orchestration.
 *
 * When a room starts, the server generates the whole competition in one deterministic pass:
 * fixtures, every result, and every knockout round that follows from them. Only a compact
 * summary is stored per match (its seed and outcome) — the full minute-by-minute timeline is
 * regenerated from that seed whenever someone watches or replays the match, which is exact
 * because the engine is pure and seeded.
 *
 * That is what makes a 38-matchday season play out in about two minutes: the client is
 * revealing a result that already exists rather than waiting on a server round trip.
 */

import { advancePairs, buildKnockoutRound, championsLeagueQualification, seedPairs, stageLabel, worldCupQualifiers, type TiePair } from './knockout';
import { matchWinner, simulateMatch, type MatchContext } from './match';
import { createRng } from './rng';
import { buildTable, generateGroupFixtures, generateLeagueFixtures, generateLeaguePhaseFixtures, type ResultInput, type TiebreakRule } from './schedule';
import { resolveTeam, type ResolvedTeam } from './team';
import type { CompetitionMode, CompetitionStage, Fixture, MatchResult, PlayerSeason, SquadSelection, StandingRow } from './types';

export interface CompetitionEntry {
  id: string;
  teamName: string;
  teamCode: string;
  badge: string;
  colors: { primary: string; secondary: string; text: string };
  /** Room member id, or null for an AI-controlled team. */
  ownerId: string | null;
  ownerName: string | null;
  avatar: string | null;
  selection: SquadSelection;
  /** Used for seeding brackets and the league-phase pot draw. */
  strength: number;
}

/** What we persist per played match. */
export interface StoredResult {
  fixtureId: string;
  seed: string;
  homeScore: number;
  awayScore: number;
  regulationHome: number;
  regulationAway: number;
  extraTime: boolean;
  shootoutHome: number | null;
  shootoutAway: number | null;
  /** Compact scorer list for result screens without re-simulating. */
  scorers: { side: 'home' | 'away'; minute: number; playerId: string; playerName: string; penalty: boolean }[];
  cards: { side: 'home' | 'away'; minute: number; playerName: string; red: boolean }[];
  homeXg: number;
  awayXg: number;
  homePossession: number;
  motm: { playerId: string; playerName: string; side: 'home' | 'away' } | null;
  /** Per-player contributions, merged into competition-wide leaderboards. */
  contributions: Record<string, { goals: number; assists: number; yellow: number; red: number; cleanSheet: boolean; motm: boolean }>;
}

export interface CompetitionFormat {
  mode: CompetitionMode;
  name: string;
  teamCount: number;
  tiebreak: TiebreakRule;
  /** Total matchdays, used by the UI to pace playback. */
  matchdays: number;
}

export interface CompetitionState {
  mode: CompetitionMode;
  name: string;
  seasonLabel: string;
  seed: string;
  entries: CompetitionEntry[];
  fixtures: Fixture[];
  results: Record<string, StoredResult>;
  /** Group memberships for group-stage competitions. */
  groups: { id: string; name: string; entryIds: string[] }[];
  /** Ordered stages actually used by this competition. */
  stages: CompetitionStage[];
  championEntryId: string | null;
  runnerUpEntryId: string | null;
  totalMatchdays: number;
  tiebreak: TiebreakRule;
  homeAdvantage: number;
}

export const FORMATS: Record<CompetitionMode, CompetitionFormat> = {
  'premier-league': { mode: 'premier-league', name: 'Premier League', teamCount: 20, tiebreak: 'goal-difference', matchdays: 38 },
  'la-liga': { mode: 'la-liga', name: 'La Liga', teamCount: 20, tiebreak: 'head-to-head', matchdays: 38 },
  'champions-league': { mode: 'champions-league', name: 'Champions League', teamCount: 36, tiebreak: 'goal-difference', matchdays: 17 },
  'world-cup': { mode: 'world-cup', name: 'World Cup', teamCount: 48, tiebreak: 'goal-difference', matchdays: 9 },
};

export interface BuildCompetitionArgs {
  mode: CompetitionMode;
  seasonLabel: string;
  seed: string;
  entries: CompetitionEntry[];
  playersById: Map<string, PlayerSeason>;
  homeAdvantage?: number;
}

/** Generate and fully simulate a competition. */
export function buildCompetition(args: BuildCompetitionArgs): CompetitionState {
  const format = FORMATS[args.mode];
  const homeAdvantage = args.homeAdvantage ?? 1;
  const teams = new Map<string, ResolvedTeam>();
  for (const entry of args.entries) {
    teams.set(entry.id, resolveTeam(entry.selection, args.playersById));
  }

  const state: CompetitionState = {
    mode: args.mode,
    name: format.name,
    seasonLabel: args.seasonLabel,
    seed: args.seed,
    entries: args.entries,
    fixtures: [],
    results: {},
    groups: [],
    stages: [],
    championEntryId: null,
    runnerUpEntryId: null,
    totalMatchdays: 0,
    tiebreak: format.tiebreak,
    homeAdvantage,
  };

  const ctx = { state, teams, homeAdvantage };

  switch (args.mode) {
    case 'premier-league':
    case 'la-liga':
      runLeague(ctx);
      break;
    case 'champions-league':
      runChampionsLeague(ctx);
      break;
    case 'world-cup':
      runWorldCup(ctx);
      break;
  }

  state.totalMatchdays = state.fixtures.reduce((m, f) => Math.max(m, f.matchday), 0);
  return state;
}

interface RunCtx {
  state: CompetitionState;
  teams: Map<string, ResolvedTeam>;
  homeAdvantage: number;
}

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

function runLeague(ctx: RunCtx) {
  const ids = ctx.state.entries.map((e) => e.id);
  ctx.state.stages = ['league'];
  ctx.state.fixtures = generateLeagueFixtures(ids, ctx.state.seed);
  playFixtures(ctx, ctx.state.fixtures);
  const table = tableFor(ctx, ctx.state.fixtures);
  ctx.state.championEntryId = table[0]?.entryId ?? null;
  ctx.state.runnerUpEntryId = table[1]?.entryId ?? null;
}

function runChampionsLeague(ctx: RunCtx) {
  const ids = ctx.state.entries.map((e) => e.id);
  ctx.state.stages = ['league-phase', 'playoff', 'round-of-16', 'quarter-final', 'semi-final', 'final'];

  const leaguePhase = generateLeaguePhaseFixtures(ids, ctx.state.seed, 8);
  ctx.state.fixtures.push(...leaguePhase);
  playFixtures(ctx, leaguePhase);

  const table = tableFor(ctx, leaguePhase);
  const { direct, playoff } = championsLeagueQualification(table.map((r) => r.entryId));

  // Knockout playoff: seeds 9-24, two legs.
  let matchday = 9;
  const playoffPairs = seedPairs(playoff, 'ko-playoff', ctx.state.seed);
  const playoffFixtures = buildKnockoutRound('playoff', playoffPairs, matchday, { twoLegged: true });
  ctx.state.fixtures.push(...playoffFixtures);
  playFixtures(ctx, playoffFixtures);
  matchday += 2;

  const playoffWinners = resolveTies(ctx, playoffPairs);
  // Seed the Round of 16: the eight direct qualifiers meet the eight playoff winners.
  let alive = [...direct, ...playoffWinners];

  const rounds: { stage: CompetitionStage; twoLegged: boolean }[] = [
    { stage: 'round-of-16', twoLegged: true },
    { stage: 'quarter-final', twoLegged: true },
    { stage: 'semi-final', twoLegged: true },
    { stage: 'final', twoLegged: false },
  ];

  for (const round of rounds) {
    if (alive.length < 2) break;
    const pairs =
      round.stage === 'round-of-16'
        ? seedPairs(alive, round.stage, ctx.state.seed)
        : advancePairs(alive, round.stage);
    const fixtures = buildKnockoutRound(round.stage, pairs, matchday, {
      twoLegged: round.twoLegged,
      neutral: round.stage === 'final',
    });
    ctx.state.fixtures.push(...fixtures);
    playFixtures(ctx, fixtures);
    matchday += round.twoLegged ? 2 : 1;
    const winners = resolveTies(ctx, pairs);
    if (round.stage === 'final') {
      ctx.state.championEntryId = winners[0] ?? null;
      const finalPair = pairs[0];
      ctx.state.runnerUpEntryId =
        finalPair && winners[0]
          ? finalPair.homeFirst === winners[0]
            ? finalPair.awayFirst
            : finalPair.homeFirst
          : null;
    }
    alive = winners;
  }
}

function runWorldCup(ctx: RunCtx) {
  const rng = createRng(ctx.state.seed + ':wc-draw');
  const entries = [...ctx.state.entries].sort((a, b) => b.strength - a.strength);
  const groupCount = Math.max(2, Math.floor(entries.length / 4));
  ctx.state.stages = ['group', 'round-of-32', 'round-of-16', 'quarter-final', 'semi-final', 'third-place', 'final'];

  // Pot-based draw: strongest teams spread across groups.
  const pots: CompetitionEntry[][] = [];
  for (let i = 0; i < 4; i++) pots.push(rng.shuffle(entries.slice(i * groupCount, (i + 1) * groupCount)));
  const groups = Array.from({ length: groupCount }, (_, i) => ({
    id: `g${i + 1}`,
    name: `Group ${String.fromCharCode(65 + i)}`,
    entryIds: [] as string[],
  }));
  pots.forEach((pot) => {
    pot.forEach((entry, i) => {
      if (groups[i % groupCount]) groups[i % groupCount].entryIds.push(entry.id);
    });
  });
  // Anything left over (uneven counts) goes to the smallest groups.
  const assigned = new Set(groups.flatMap((g) => g.entryIds));
  for (const entry of entries) {
    if (assigned.has(entry.id)) continue;
    groups.sort((a, b) => a.entryIds.length - b.entryIds.length)[0].entryIds.push(entry.id);
  }
  groups.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  ctx.state.groups = groups;

  const groupFixtures = generateGroupFixtures(groups, ctx.state.seed, 1);
  ctx.state.fixtures.push(...groupFixtures);
  playFixtures(ctx, groupFixtures);

  const groupMatchdays = groupFixtures.reduce((m, f) => Math.max(m, f.matchday), 0);
  const groupTables = groups.map((g) => ({
    id: g.id,
    table: tableFor(
      ctx,
      groupFixtures.filter((f) => f.groupId === g.id),
      g.entryIds,
    ),
  }));

  // Fill the bracket to the nearest power of two so the rounds line up.
  const qualified = worldCupQualifiers(
    groupTables.map((g) => ({ id: g.id, table: g.table })),
    Math.max(0, nearestPowerOfTwo(groups.length * 2) - groups.length * 2),
  );
  const ordered = orderBySeedStrength(ctx, qualified);

  let alive = ordered;
  let matchday = groupMatchdays + 1;
  const bracketRounds: CompetitionStage[] = ['round-of-32', 'round-of-16', 'quarter-final', 'semi-final', 'final'];
  const semiPairs: { pairs: TiePair[]; winners: string[] } = { pairs: [], winners: [] };

  for (const stage of bracketRounds) {
    if (alive.length < 2) break;
    // Skip rounds the bracket is too small for.
    if (stage === 'round-of-32' && alive.length <= 16) continue;
    if (stage === 'round-of-16' && alive.length <= 8) continue;
    if (stage === 'quarter-final' && alive.length <= 4) continue;
    if (stage === 'semi-final' && alive.length <= 2) continue;

    const pairs =
      alive === ordered ? seedPairs(alive, stage, ctx.state.seed) : advancePairs(alive, stage);
    const fixtures = buildKnockoutRound(stage, pairs, matchday, { twoLegged: false, neutral: true });
    ctx.state.fixtures.push(...fixtures);
    playFixtures(ctx, fixtures);
    const winners = resolveTies(ctx, pairs);

    if (stage === 'semi-final') {
      semiPairs.pairs = pairs;
      semiPairs.winners = winners;
    }
    if (stage === 'final') {
      ctx.state.championEntryId = winners[0] ?? null;
      const finalPair = pairs[0];
      ctx.state.runnerUpEntryId =
        finalPair && winners[0]
          ? finalPair.homeFirst === winners[0]
            ? finalPair.awayFirst
            : finalPair.homeFirst
          : null;
    }
    matchday += 1;
    alive = winners;
  }

  // Third-place play-off between the beaten semi-finalists.
  if (semiPairs.pairs.length === 2) {
    const losers = semiPairs.pairs.map((p, i) =>
      semiPairs.winners[i] === p.homeFirst ? p.awayFirst : p.homeFirst,
    );
    if (losers.length === 2 && losers[0] && losers[1]) {
      const fixtures = buildKnockoutRound(
        'third-place',
        [{ tieId: 'third-place', homeFirst: losers[0], awayFirst: losers[1] }],
        matchday,
        { twoLegged: false, neutral: true },
      );
      ctx.state.fixtures.push(...fixtures);
      playFixtures(ctx, fixtures);
    }
  }
}

function nearestPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function orderBySeedStrength(ctx: RunCtx, entryIds: string[]): string[] {
  const byId = new Map(ctx.state.entries.map((e) => [e.id, e]));
  return [...entryIds].sort((a, b) => (byId.get(b)?.strength ?? 0) - (byId.get(a)?.strength ?? 0));
}

// ---------------------------------------------------------------------------
// Playing matches
// ---------------------------------------------------------------------------

function playFixtures(ctx: RunCtx, fixtures: Fixture[]) {
  for (const fixture of fixtures) {
    if (ctx.state.results[fixture.id]) continue;
    ctx.state.results[fixture.id] = playFixture(ctx, fixture);
  }
}

export function fixtureSeed(competitionSeed: string, fixtureId: string): string {
  return `${competitionSeed}:${fixtureId}`;
}

function playFixture(ctx: RunCtx, fixture: Fixture): StoredResult {
  const home = ctx.teams.get(fixture.homeEntryId);
  const away = ctx.teams.get(fixture.awayEntryId);
  const homeEntry = ctx.state.entries.find((e) => e.id === fixture.homeEntryId);
  const awayEntry = ctx.state.entries.find((e) => e.id === fixture.awayEntryId);
  if (!home || !away || !homeEntry || !awayEntry) {
    throw new Error(`Missing team for fixture ${fixture.id}`);
  }

  const matchCtx = buildMatchContext(ctx, fixture, homeEntry.teamName, awayEntry.teamName);
  const result = simulateMatch(home, away, matchCtx);
  return summarise(fixture, matchCtx.seed, result);
}

export function buildMatchContext(
  ctx: { state: CompetitionState; homeAdvantage: number },
  fixture: Fixture,
  homeName: string,
  awayName: string,
): MatchContext {
  let aggregate: MatchContext['aggregate'] = null;
  if (fixture.leg === 2 && fixture.tieId) {
    const firstLeg = Object.values(ctx.state.results).find(
      (r) => r.fixtureId === `${fixture.tieId}-l1`,
    );
    if (firstLeg) {
      // The first leg's home team is this leg's away team.
      aggregate = { home: firstLeg.awayScore, away: firstLeg.homeScore };
    }
  }
  return {
    seed: fixtureSeed(ctx.state.seed, fixture.id),
    homeName,
    awayName,
    homeAdvantage: fixture.neutralVenue ? 0 : ctx.homeAdvantage,
    knockout: fixture.knockout,
    aggregate,
  };
}

function summarise(fixture: Fixture, seed: string, result: MatchResult): StoredResult {
  const scorers = result.events
    .filter((e) => e.type === 'goal' || e.type === 'penalty-scored')
    .map((e) => ({
      side: e.side as 'home' | 'away',
      minute: e.minute,
      playerId: e.playerId ?? '',
      playerName: e.playerName ?? '',
      penalty: e.type === 'penalty-scored',
    }));
  const cards = result.events
    .filter((e) => e.type === 'yellow-card' || e.type === 'red-card')
    .map((e) => ({
      side: e.side as 'home' | 'away',
      minute: e.minute,
      playerName: e.playerName ?? '',
      red: e.type === 'red-card',
    }));
  const contributions: StoredResult['contributions'] = {};
  for (const [playerId, s] of Object.entries(result.playerStats)) {
    if (!s.goals && !s.assists && !s.yellowCards && !s.redCards && !s.cleanSheet && !s.motm) continue;
    contributions[playerId] = {
      goals: s.goals,
      assists: s.assists,
      yellow: s.yellowCards,
      red: s.redCards,
      cleanSheet: s.cleanSheet,
      motm: s.motm,
    };
  }
  return {
    fixtureId: fixture.id,
    seed,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    regulationHome: result.regulationHome,
    regulationAway: result.regulationAway,
    extraTime: result.extraTime,
    shootoutHome: result.shootout?.home ?? null,
    shootoutAway: result.shootout?.away ?? null,
    scorers,
    cards,
    homeXg: Math.round(result.home.xg * 100) / 100,
    awayXg: Math.round(result.away.xg * 100) / 100,
    homePossession: result.home.possession,
    motm: result.motm,
    contributions,
  };
}

/** Who won each tie, using aggregate then the shootout. */
function resolveTies(ctx: RunCtx, pairs: TiePair[]): string[] {
  const winners: string[] = [];
  for (const pair of pairs) {
    const legs = ctx.state.fixtures.filter((f) => f.tieId === pair.tieId);
    if (!legs.length) continue;
    let aggA = 0;
    let aggB = 0;
    let decider: StoredResult | null = null;
    let deciderFixture: Fixture | null = null;
    for (const leg of legs) {
      const r = ctx.state.results[leg.id];
      if (!r) continue;
      if (leg.homeEntryId === pair.homeFirst) {
        aggA += r.homeScore;
        aggB += r.awayScore;
      } else {
        aggB += r.homeScore;
        aggA += r.awayScore;
      }
      decider = r;
      deciderFixture = leg;
    }
    if (aggA > aggB) winners.push(pair.homeFirst);
    else if (aggB > aggA) winners.push(pair.awayFirst);
    else if (decider && deciderFixture && decider.shootoutHome != null && decider.shootoutAway != null) {
      const homeWon = decider.shootoutHome > decider.shootoutAway;
      winners.push(homeWon ? deciderFixture.homeEntryId : deciderFixture.awayEntryId);
    } else {
      winners.push(pair.homeFirst);
    }
  }
  return winners;
}

// ---------------------------------------------------------------------------
// Tables and derived views
// ---------------------------------------------------------------------------

export function resultsToInputs(state: CompetitionState, fixtures: Fixture[]): ResultInput[] {
  const out: ResultInput[] = [];
  for (const f of fixtures) {
    const r = state.results[f.id];
    if (!r) continue;
    out.push({
      homeEntryId: f.homeEntryId,
      awayEntryId: f.awayEntryId,
      // Extra time counts towards the table only in leagues, where it never happens.
      homeScore: r.homeScore,
      awayScore: r.awayScore,
    });
  }
  return out;
}

function tableFor(ctx: RunCtx, fixtures: Fixture[], entryIds?: string[]): StandingRow[] {
  const ids = entryIds ?? [...new Set(fixtures.flatMap((f) => [f.homeEntryId, f.awayEntryId]))];
  return buildTable(ids, resultsToInputs(ctx.state, fixtures), { tiebreak: ctx.state.tiebreak });
}

/** The table as it stood after `matchday`. Used by the season playback. */
export function standingsAfter(
  state: CompetitionState,
  matchday: number,
  entryIds?: string[],
  groupId?: string,
): StandingRow[] {
  const leagueStages: CompetitionStage[] = ['league', 'league-phase', 'group'];
  const fixtures = state.fixtures.filter(
    (f) =>
      leagueStages.includes(f.stage) &&
      f.matchday <= matchday &&
      (groupId ? f.groupId === groupId : true),
  );
  const ids =
    entryIds ??
    (groupId
      ? state.groups.find((g) => g.id === groupId)?.entryIds ?? []
      : state.entries.map((e) => e.id));
  const previous =
    matchday > 1
      ? Object.fromEntries(
          standingsAfter(state, matchday - 1, ids, groupId).map((r) => [r.entryId, r.position]),
        )
      : undefined;
  return buildTable(ids, resultsToInputs(state, fixtures), { tiebreak: state.tiebreak, previous });
}

/** Everything that happened on one matchday, for the season playback screen. */
export interface MatchdayView {
  matchday: number;
  stage: CompetitionStage;
  label: string;
  fixtures: {
    fixture: Fixture;
    result: StoredResult | null;
    home: CompetitionEntry;
    away: CompetitionEntry;
  }[];
}

export function matchdayView(state: CompetitionState, matchday: number): MatchdayView | null {
  const fixtures = state.fixtures.filter((f) => f.matchday === matchday);
  if (!fixtures.length) return null;
  const byId = new Map(state.entries.map((e) => [e.id, e]));
  return {
    matchday,
    stage: fixtures[0].stage,
    label: fixtures[0].label || stageLabel(fixtures[0].stage),
    fixtures: fixtures
      .map((fixture) => ({
        fixture,
        result: state.results[fixture.id] ?? null,
        home: byId.get(fixture.homeEntryId)!,
        away: byId.get(fixture.awayEntryId)!,
      }))
      .filter((f) => f.home && f.away),
  };
}

// ---------------------------------------------------------------------------
// Competition-wide statistics
// ---------------------------------------------------------------------------

export interface PlayerTally {
  playerId: string;
  playerName: string;
  entryId: string;
  goals: number;
  assists: number;
  cleanSheets: number;
  yellow: number;
  red: number;
  motm: number;
}

export function competitionStats(
  state: CompetitionState,
  playersById: Map<string, PlayerSeason>,
  upToMatchday = Infinity,
): PlayerTally[] {
  const tallies = new Map<string, PlayerTally>();
  const entryOf = new Map<string, string>();
  for (const entry of state.entries) {
    for (const playerId of Object.values(entry.selection.picks)) entryOf.set(playerId, entry.id);
  }

  for (const fixture of state.fixtures) {
    if (fixture.matchday > upToMatchday) continue;
    const result = state.results[fixture.id];
    if (!result) continue;
    for (const [playerId, c] of Object.entries(result.contributions)) {
      const entryId = entryOf.get(playerId);
      if (!entryId) continue;
      let tally = tallies.get(playerId);
      if (!tally) {
        tally = {
          playerId,
          playerName: playersById.get(playerId)?.name ?? 'Unknown',
          entryId,
          goals: 0,
          assists: 0,
          cleanSheets: 0,
          yellow: 0,
          red: 0,
          motm: 0,
        };
        tallies.set(playerId, tally);
      }
      tally.goals += c.goals;
      tally.assists += c.assists;
      tally.yellow += c.yellow;
      tally.red += c.red;
      tally.motm += c.motm ? 1 : 0;
      if (c.cleanSheet) tally.cleanSheets++;
    }
  }
  return [...tallies.values()];
}

export function goldenBoot(tallies: PlayerTally[]) {
  return [...tallies].sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 20);
}
export function topAssists(tallies: PlayerTally[]) {
  return [...tallies].sort((a, b) => b.assists - a.assists || b.goals - a.goals).slice(0, 20);
}
export function goldenGlove(state: CompetitionState, tallies: PlayerTally[], playersById: Map<string, PlayerSeason>) {
  return [...tallies]
    .filter((t) => playersById.get(t.playerId)?.position === 'GK')
    .sort((a, b) => b.cleanSheets - a.cleanSheets)
    .slice(0, 20);
}
