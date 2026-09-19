/** Knockout bracket construction for the Champions League and World Cup formats. */

import { createRng } from './rng';
import type { CompetitionStage, Fixture } from './types';

export interface TiePair {
  tieId: string;
  homeFirst: string;
  awayFirst: string;
}

const STAGE_LABEL: Record<CompetitionStage, string> = {
  league: 'Matchday',
  'league-phase': 'League Phase',
  group: 'Group Stage',
  playoff: 'Knockout Playoff',
  'round-of-32': 'Round of 32',
  'round-of-16': 'Round of 16',
  'quarter-final': 'Quarter-final',
  'semi-final': 'Semi-final',
  'third-place': 'Third-place Play-off',
  final: 'Final',
};

export function stageLabel(stage: CompetitionStage): string {
  return STAGE_LABEL[stage] ?? stage;
}

/**
 * Build the fixtures for one knockout round.
 * `twoLegged` produces a home leg and a return leg sharing a tie id; the lower seed hosts first.
 */
export function buildKnockoutRound(
  stage: CompetitionStage,
  pairs: TiePair[],
  matchday: number,
  options: { twoLegged: boolean; neutral?: boolean },
): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const pair of pairs) {
    if (options.twoLegged) {
      fixtures.push({
        id: `${pair.tieId}-l1`,
        matchday,
        stage,
        label: `${stageLabel(stage)}, 1st leg`,
        homeEntryId: pair.homeFirst,
        awayEntryId: pair.awayFirst,
        tieId: pair.tieId,
        leg: 1,
        neutralVenue: false,
        knockout: false,
      });
      fixtures.push({
        id: `${pair.tieId}-l2`,
        matchday: matchday + 1,
        stage,
        label: `${stageLabel(stage)}, 2nd leg`,
        homeEntryId: pair.awayFirst,
        awayEntryId: pair.homeFirst,
        tieId: pair.tieId,
        leg: 2,
        neutralVenue: false,
        knockout: true,
      });
    } else {
      fixtures.push({
        id: `${pair.tieId}-single`,
        matchday,
        stage,
        label: stageLabel(stage),
        homeEntryId: pair.homeFirst,
        awayEntryId: pair.awayFirst,
        tieId: pair.tieId,
        neutralVenue: options.neutral ?? false,
        knockout: true,
      });
    }
  }
  return fixtures;
}

/** Standard seeded bracket: 1v16, 2v15 … so the top seeds only meet late. */
export function seedPairs(seeded: string[], stage: string, seed: string): TiePair[] {
  const rng = createRng(`${seed}:${stage}:pairs`);
  const pairs: TiePair[] = [];
  const n = seeded.length;
  for (let i = 0; i < n / 2; i++) {
    const high = seeded[i];
    const low = seeded[n - 1 - i];
    // Lower seed hosts the first leg; the higher seed gets the decisive home leg.
    pairs.push({ tieId: `${stage}-t${i + 1}`, homeFirst: low, awayFirst: high });
  }
  return rng.shuffle(pairs);
}

/** Pair winners of the previous round, preserving bracket structure. */
export function advancePairs(winners: string[], stage: string): TiePair[] {
  const pairs: TiePair[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    if (winners[i + 1] === undefined) break;
    pairs.push({ tieId: `${stage}-t${i / 2 + 1}`, homeFirst: winners[i + 1], awayFirst: winners[i] });
  }
  return pairs;
}

/**
 * The modern Champions League bridge between league phase and Round of 16.
 *  1-8   go straight through
 *  9-24  contest a two-legged knockout playoff
 *  25-36 are eliminated
 */
export function championsLeagueQualification(orderedEntryIds: string[]) {
  return {
    direct: orderedEntryIds.slice(0, 8),
    playoff: orderedEntryIds.slice(8, 24),
    eliminated: orderedEntryIds.slice(24),
  };
}

/**
 * World Cup group qualification. The 48-team format qualifies the top two from each of the
 * twelve groups plus the eight best third-placed sides into a Round of 32.
 */
export function worldCupQualifiers(
  groups: { id: string; table: { entryId: string; points: number; goalDifference: number; goalsFor: number }[] }[],
  bestThirds: number,
): string[] {
  const direct: string[] = [];
  const thirds: { entryId: string; points: number; goalDifference: number; goalsFor: number }[] = [];
  for (const g of groups) {
    direct.push(...g.table.slice(0, 2).map((r) => r.entryId));
    if (g.table[2]) thirds.push(g.table[2]);
  }
  thirds.sort(
    (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor,
  );
  return [...direct, ...thirds.slice(0, bestThirds).map((r) => r.entryId)];
}
