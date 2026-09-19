/**
 * Fixture generation and league tables.
 *
 * League scheduling uses the circle method, which guarantees every team plays every other
 * team exactly once per half-season with no duplicates and no byes (for an even count).
 */

import { createRng } from './rng';
import type { CompetitionStage, Fixture, StandingRow } from './types';

export interface ResultInput {
  homeEntryId: string;
  awayEntryId: string;
  homeScore: number;
  awayScore: number;
}

/**
 * Double round-robin: every team plays every other home and away.
 * For n teams that is n-1 rounds per half and 2(n-1) matchdays in total.
 */
export function generateLeagueFixtures(entryIds: string[], seed: string): Fixture[] {
  const rng = createRng(seed + ':schedule');
  const teams = rng.shuffle(entryIds);
  if (teams.length < 2) return [];

  const odd = teams.length % 2 === 1;
  if (odd) teams.push('__BYE__');

  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixtures: Fixture[] = [];

  // Circle method: fix the first team, rotate the rest.
  const rotation = teams.slice(1);

  for (let round = 0; round < rounds; round++) {
    const order = [teams[0], ...rotation];
    for (let i = 0; i < half; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      if (a === '__BYE__' || b === '__BYE__') continue;
      // Alternate home/away by round so no team has a long run at home.
      const homeFirst = (round + i) % 2 === 0;
      const home = homeFirst ? a : b;
      const away = homeFirst ? b : a;

      fixtures.push(makeLeagueFixture(round + 1, home, away));
      fixtures.push(makeLeagueFixture(round + 1 + rounds, away, home));
    }
    rotation.unshift(rotation.pop()!);
  }

  return fixtures.sort((a, b) => a.matchday - b.matchday);
}

function makeLeagueFixture(matchday: number, home: string, away: string): Fixture {
  return {
    id: `md${matchday}-${home}-${away}`,
    matchday,
    stage: 'league',
    label: `Matchday ${matchday}`,
    homeEntryId: home,
    awayEntryId: away,
    neutralVenue: false,
    knockout: false,
  };
}

/**
 * The modern Champions League league phase: 36 teams, 8 matches each, four at home and
 * four away, drawn from four seeding pots so every side meets two clubs from each pot.
 */
export function generateLeaguePhaseFixtures(entryIds: string[], seed: string, matchesEach = 8): Fixture[] {
  const rng = createRng(seed + ':league-phase');
  const n = entryIds.length;
  const targetPairs = (n * matchesEach) / 2;

  const perPot = Math.max(1, Math.ceil(n / 4));
  const potOf = new Map<string, number>();
  entryIds.forEach((id, i) => potOf.set(id, Math.min(3, Math.floor(i / perPot))));
  const perPotQuota = Math.max(1, Math.floor(matchesEach / 4));

  /**
   * One full attempt at drawing the phase. Each attempt starts from scratch — carrying
   * partial state between attempts is what makes a greedy draw dead-end permanently.
   * `usePots` off is the relaxed fallback: the match count is the hard constraint, the
   * pot spread is the nice-to-have.
   */
  const attemptDraw = (usePots: boolean): [string, string][] | null => {
    const played = new Map<string, Set<string>>(entryIds.map((id) => [id, new Set<string>()]));
    const potQuota = new Map<string, number[]>(entryIds.map((id) => [id, [0, 0, 0, 0]]));
    const pairs: [string, string][] = [];

    const canPair = (a: string, b: string) => {
      if (a === b) return false;
      if (played.get(a)!.has(b)) return false;
      if (played.get(a)!.size >= matchesEach || played.get(b)!.size >= matchesEach) return false;
      if (!usePots) return true;
      const pa = potOf.get(a)!;
      const pb = potOf.get(b)!;
      return potQuota.get(a)![pb] < perPotQuota && potQuota.get(b)![pa] < perPotQuota;
    };

    const link = (a: string, b: string) => {
      played.get(a)!.add(b);
      played.get(b)!.add(a);
      potQuota.get(a)![potOf.get(b)!]++;
      potQuota.get(b)![potOf.get(a)!]++;
      pairs.push([a, b]);
    };

    // Always extend the club with the fewest matches so far; that keeps the graph regular
    // and leaves the hardest clubs to pair with the most options remaining.
    for (let guard = 0; pairs.length < targetPairs && guard < n * matchesEach * 4; guard++) {
      const remaining = entryIds.filter((id) => played.get(id)!.size < matchesEach);
      if (remaining.length < 2) break;
      remaining.sort((x, y) => played.get(x)!.size - played.get(y)!.size);
      const a = remaining[0];
      const options = remaining.filter((b) => canPair(a, b));
      if (!options.length) return null;
      // Prefer opponents who also still need matches the most.
      const fewest = Math.min(...options.map((b) => played.get(b)!.size));
      link(a, rng.pick(options.filter((b) => played.get(b)!.size === fewest)));
    }
    return pairs.length === targetPairs ? pairs : null;
  };

  let pairs: [string, string][] | null = null;
  for (let attempt = 0; attempt < 250 && !pairs; attempt++) pairs = attemptDraw(true);
  for (let attempt = 0; attempt < 250 && !pairs; attempt++) pairs = attemptDraw(false);
  if (!pairs) throw new Error('Could not draw a league phase for ' + n + ' teams');

  // Assign home and away as evenly as possible, then spread across matchdays.
  const homeCount = new Map<string, number>(entryIds.map((id) => [id, 0]));
  const awayCount = new Map<string, number>(entryIds.map((id) => [id, 0]));
  const fixtures: Fixture[] = [];
  for (const [a, b] of pairs) {
    const aHome = homeCount.get(a)! - awayCount.get(a)! <= homeCount.get(b)! - awayCount.get(b)!;
    const home = aHome ? a : b;
    const away = aHome ? b : a;
    homeCount.set(home, homeCount.get(home)! + 1);
    awayCount.set(away, awayCount.get(away)! + 1);
    fixtures.push({
      id: `lp-${home}-${away}`,
      matchday: 0,
      stage: 'league-phase',
      label: '',
      homeEntryId: home,
      awayEntryId: away,
      neutralVenue: false,
      knockout: false,
    });
  }

  assignMatchdays(fixtures, matchesEach, rng);
  for (const f of fixtures) f.label = `League Phase ${f.matchday}`;
  return fixtures.sort((a, b) => a.matchday - b.matchday);
}

/** Spread fixtures over `rounds` matchdays so nobody plays twice in a round. */
function assignMatchdays(fixtures: Fixture[], rounds: number, rng: { shuffle: <T>(a: readonly T[]) => T[] }) {
  const busy: Set<string>[] = Array.from({ length: rounds }, () => new Set<string>());
  for (const f of rng.shuffle(fixtures)) {
    let placed = false;
    for (let r = 0; r < rounds; r++) {
      if (!busy[r].has(f.homeEntryId) && !busy[r].has(f.awayEntryId)) {
        busy[r].add(f.homeEntryId);
        busy[r].add(f.awayEntryId);
        f.matchday = r + 1;
        placed = true;
        break;
      }
    }
    if (!placed) f.matchday = 1 + (fixtures.indexOf(f) % rounds);
  }
}

/** Group stage: n groups of `groupSize`, single round-robin within each group. */
export function generateGroupFixtures(
  groups: { id: string; entryIds: string[] }[],
  seed: string,
  startMatchday = 1,
): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const group of groups) {
    const inner = generateSingleRoundRobin(group.entryIds, seed + ':' + group.id);
    for (const f of inner) {
      fixtures.push({
        ...f,
        id: `${group.id}-${f.id}`,
        matchday: startMatchday + f.matchday - 1,
        stage: 'group',
        label: `Group Stage ${startMatchday + f.matchday - 1}`,
        groupId: group.id,
      });
    }
  }
  return fixtures.sort((a, b) => a.matchday - b.matchday);
}

function generateSingleRoundRobin(entryIds: string[], seed: string): Fixture[] {
  const rng = createRng(seed);
  const teams = rng.shuffle(entryIds);
  if (teams.length % 2 === 1) teams.push('__BYE__');
  const n = teams.length;
  const rotation = teams.slice(1);
  const out: Fixture[] = [];
  for (let round = 0; round < n - 1; round++) {
    const order = [teams[0], ...rotation];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      if (a === '__BYE__' || b === '__BYE__') continue;
      const homeFirst = (round + i) % 2 === 0;
      out.push(makeLeagueFixture(round + 1, homeFirst ? a : b, homeFirst ? b : a));
    }
    rotation.unshift(rotation.pop()!);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export type TiebreakRule = 'goal-difference' | 'head-to-head';

export function buildTable(
  entryIds: string[],
  results: ResultInput[],
  options: { tiebreak?: TiebreakRule; previous?: Record<string, number> } = {},
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of entryIds) {
    rows.set(id, {
      entryId: id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: [],
      position: 0,
      previousPosition: options.previous?.[id] ?? null,
    });
  }

  for (const r of results) {
    const home = rows.get(r.homeEntryId);
    const away = rows.get(r.awayEntryId);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.goalsFor += r.homeScore;
    home.goalsAgainst += r.awayScore;
    away.goalsFor += r.awayScore;
    away.goalsAgainst += r.homeScore;
    if (r.homeScore > r.awayScore) {
      home.won++;
      home.points += 3;
      away.lost++;
      home.form.push('W');
      away.form.push('L');
    } else if (r.homeScore < r.awayScore) {
      away.won++;
      away.points += 3;
      home.lost++;
      home.form.push('L');
      away.form.push('W');
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
      home.form.push('D');
      away.form.push('D');
    }
  }

  const list = [...rows.values()];
  for (const row of list) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    row.form = row.form.slice(-5);
  }

  const tiebreak = options.tiebreak ?? 'goal-difference';
  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (tiebreak === 'head-to-head') {
      // La Liga separates level teams on the head-to-head record first.
      const h2h = headToHead(a.entryId, b.entryId, results);
      if (h2h !== 0) return h2h;
    }
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (b.won !== a.won) return b.won - a.won;
    return a.entryId.localeCompare(b.entryId);
  });

  list.forEach((row, i) => {
    row.position = i + 1;
  });
  return list;
}

/** Positive when b should rank above a, negative when a should. */
function headToHead(a: string, b: string, results: ResultInput[]): number {
  let aPts = 0;
  let bPts = 0;
  let aGd = 0;
  for (const r of results) {
    const involved =
      (r.homeEntryId === a && r.awayEntryId === b) || (r.homeEntryId === b && r.awayEntryId === a);
    if (!involved) continue;
    const aHome = r.homeEntryId === a;
    const aGoals = aHome ? r.homeScore : r.awayScore;
    const bGoals = aHome ? r.awayScore : r.homeScore;
    aGd += aGoals - bGoals;
    if (aGoals > bGoals) aPts += 3;
    else if (aGoals < bGoals) bPts += 3;
    else {
      aPts++;
      bPts++;
    }
  }
  if (aPts !== bPts) return bPts - aPts;
  if (aGd !== 0) return -aGd;
  return 0;
}

export const STAGE_ORDER: CompetitionStage[] = [
  'league',
  'league-phase',
  'group',
  'playoff',
  'round-of-32',
  'round-of-16',
  'quarter-final',
  'semi-final',
  'third-place',
  'final',
];
