/**
 * The draft.
 *
 * The loop, deliberately close to the game this is modelled on:
 *
 *   1. Your formation is rolled for you.
 *   2. A squad spins up — a real club or national team from a real season.
 *   3. You pick one player from it. Only players who can legally fill one of your remaining
 *      positions are selectable, so you can never end up with a centre-back at striker.
 *   4. A new squad spins. Repeat until the eleven is full.
 *
 * Rerolls (five by default) throw away the current squad and spin another.
 *
 * Everything is driven by a seed, so a draft can be replayed, an AI can run the identical
 * process, and a Daily Challenge can hand everyone the same sequence of squads.
 */

import { eligibleSlots, FORMATIONS, getFormation } from './formations';
import { createRng, type Rng } from './rng';
import type { Formation, PlayerSeason, Position, Squad, SquadSelection } from './types';

export interface DraftOptions {
  seed: string;
  /** Squads the draft may offer, already filtered to the room's competition/season. */
  squadPool: Squad[];
  rerolls: number;
  /** Prevent the same footballer appearing twice in one XI. */
  allowDuplicatePlayers: boolean;
  /** Prevent the same squad being offered twice in one draft. */
  allowDuplicateSquads: boolean;
  /** Fixed formation, or null to roll one. */
  formationId?: string | null;
}

export interface DraftOffer {
  round: number;
  squadId: string;
  /** Players from that squad, with the slots each one could fill. */
  players: { playerId: string; eligibleSlotIds: string[] }[];
}

export interface DraftState {
  seed: string;
  formationId: string;
  round: number;
  rerollsLeft: number;
  picks: Record<string, string>;
  /** Player ids already taken, for duplicate prevention. */
  takenPlayerIds: string[];
  offeredSquadIds: string[];
  currentOffer: DraftOffer | null;
  complete: boolean;
  style: string;
  /** Records each pick for the draft recap. */
  history: { round: number; squadId: string; playerId: string; slotId: string }[];
}

export interface DraftEngineDeps {
  playersById: Map<string, PlayerSeason>;
  squadsById: Map<string, Squad>;
}

/** Roll the formation for a draft. Deterministic from the seed. */
export function rollFormation(seed: string): Formation {
  const rng = createRng(seed + ':formation');
  return rng.pick(FORMATIONS);
}

export function createDraft(options: DraftOptions, deps: DraftEngineDeps): DraftState {
  const formation = options.formationId ? getFormation(options.formationId) : rollFormation(options.seed);
  const state: DraftState = {
    seed: options.seed,
    formationId: formation.id,
    round: 1,
    rerollsLeft: options.rerolls,
    picks: {},
    takenPlayerIds: [],
    offeredSquadIds: [],
    currentOffer: null,
    complete: false,
    style: 'balanced',
    history: [],
  };
  state.currentOffer = rollOffer(state, options, deps);
  return state;
}

/**
 * Spin a squad that can actually help: at least one of its players must be able to fill one
 * of the remaining slots. Without that check a draft can deadlock on, say, a squad of
 * forwards when only the goalkeeper slot is open.
 */
export function rollOffer(state: DraftState, options: DraftOptions, deps: DraftEngineDeps): DraftOffer | null {
  const formation = getFormation(state.formationId);
  const taken = new Set(Object.keys(state.picks));
  if (taken.size >= formation.slots.length) return null;

  const rng = createRng(`${state.seed}:offer:${state.round}:${state.offeredSquadIds.length}`);
  const seen = new Set(options.allowDuplicateSquads ? [] : state.offeredSquadIds);
  const takenPlayers = new Set(options.allowDuplicatePlayers ? [] : state.takenPlayerIds);
  const takenPersons = new Set(
    options.allowDuplicatePlayers
      ? []
      : state.takenPlayerIds.map((id) => deps.playersById.get(id)?.personId).filter(Boolean) as string[],
  );

  // Weight the pool towards stronger squads, but keep the long tail reachable — finding a
  // gem in an unfashionable side is half the fun.
  const candidates = options.squadPool.filter((s) => !seen.has(s.id));
  const pool = candidates.length ? candidates : options.squadPool;

  for (let attempt = 0; attempt < 60; attempt++) {
    const squad = rng.weighted(pool, (s) => Math.pow(Math.max(1, s.strength - 40), 1.35));
    const offer = buildOffer(squad, state, formation, taken, takenPlayers, takenPersons, deps);
    if (offer && offer.players.length > 0) return offer;
  }

  // Fall back to a linear scan so a draft can always continue.
  for (const squad of pool) {
    const offer = buildOffer(squad, state, formation, taken, takenPlayers, takenPersons, deps);
    if (offer && offer.players.length > 0) return offer;
  }
  return null;
}

function buildOffer(
  squad: Squad,
  state: DraftState,
  formation: Formation,
  takenSlots: Set<string>,
  takenPlayers: Set<string>,
  takenPersons: Set<string>,
  deps: DraftEngineDeps,
): DraftOffer | null {
  const players: DraftOffer['players'] = [];
  for (const playerId of squad.playerIds) {
    if (takenPlayers.has(playerId)) continue;
    const player = deps.playersById.get(playerId);
    if (!player) continue;
    if (takenPersons.has(player.personId)) continue;
    const slots = eligibleSlots(formation, player.position, player.secondary, takenSlots);
    if (!slots.length) continue;
    players.push({ playerId, eligibleSlotIds: slots.map((s) => s.slot.id) });
  }
  if (!players.length) return null;
  return { round: state.round, squadId: squad.id, players };
}

/** Apply a pick. Throws when the pick is not legal, so the server can reject bad input. */
export function applyPick(
  state: DraftState,
  playerId: string,
  slotId: string | null,
  options: DraftOptions,
  deps: DraftEngineDeps,
): DraftState {
  if (state.complete) throw new Error('Draft already complete');
  const offer = state.currentOffer;
  if (!offer) throw new Error('No squad on offer');
  const entry = offer.players.find((p) => p.playerId === playerId);
  if (!entry) throw new Error('That player is not in the squad on offer');

  const chosenSlot = slotId ?? entry.eligibleSlotIds[0];
  if (!entry.eligibleSlotIds.includes(chosenSlot)) throw new Error('That player cannot play there');
  if (state.picks[chosenSlot]) throw new Error('That position is already filled');

  const next: DraftState = {
    ...state,
    picks: { ...state.picks, [chosenSlot]: playerId },
    takenPlayerIds: [...state.takenPlayerIds, playerId],
    offeredSquadIds: [...state.offeredSquadIds, offer.squadId],
    history: [...state.history, { round: state.round, squadId: offer.squadId, playerId, slotId: chosenSlot }],
    round: state.round + 1,
  };

  const formation = getFormation(state.formationId);
  if (Object.keys(next.picks).length >= formation.slots.length) {
    next.complete = true;
    next.currentOffer = null;
  } else {
    next.currentOffer = rollOffer(next, options, deps);
    if (!next.currentOffer) next.complete = true;
  }
  return next;
}

export function applyReroll(state: DraftState, options: DraftOptions, deps: DraftEngineDeps): DraftState {
  if (state.rerollsLeft <= 0) throw new Error('No rerolls left');
  if (!state.currentOffer) return state;
  const next: DraftState = {
    ...state,
    rerollsLeft: state.rerollsLeft - 1,
    offeredSquadIds: [...state.offeredSquadIds, state.currentOffer.squadId],
  };
  next.currentOffer = rollOffer(next, options, deps);
  return next;
}

/** Fill any remaining slots automatically — used when a draft timer expires. */
export function autoPick(state: DraftState, options: DraftOptions, deps: DraftEngineDeps): DraftState {
  let current = state;
  let guard = 0;
  while (!current.complete && current.currentOffer && guard++ < 40) {
    const rng = createRng(`${current.seed}:auto:${current.round}`);
    const best = bestAvailable(current, deps, rng, 1);
    if (!best) break;
    current = applyPick(current, best.playerId, best.slotId, options, deps);
  }
  return current;
}

/**
 * AI drafting. Difficulty controls how reliably the AI takes the strongest option and how
 * willing it is to spend a reroll — it never gets information or odds a human does not.
 */
export type AiDifficulty = 'casual' | 'normal' | 'ruthless';

const DIFFICULTY: Record<AiDifficulty, { greed: number; rerollThreshold: number }> = {
  casual: { greed: 0.45, rerollThreshold: 62 },
  normal: { greed: 0.8, rerollThreshold: 70 },
  ruthless: { greed: 1, rerollThreshold: 76 },
};

export function runAiDraft(options: DraftOptions, deps: DraftEngineDeps, difficulty: AiDifficulty = 'normal'): DraftState {
  const cfg = DIFFICULTY[difficulty];
  let state = createDraft(options, deps);
  const rng = createRng(options.seed + ':ai');
  let guard = 0;

  while (!state.complete && guard++ < 60) {
    if (!state.currentOffer) break;
    const best = bestAvailable(state, deps, rng, cfg.greed);
    if (!best) break;
    // Spend a reroll when the best thing on offer is poor and we can afford to.
    if (best.score < cfg.rerollThreshold && state.rerollsLeft > 0 && rng.chance(0.75)) {
      state = applyReroll(state, options, deps);
      continue;
    }
    state = applyPick(state, best.playerId, best.slotId, options, deps);
  }
  if (!state.complete) state = autoPick(state, options, deps);
  state.style = pickAiStyle(state, deps, rng);
  return state;
}

function pickAiStyle(state: DraftState, deps: DraftEngineDeps, rng: Rng): string {
  const players = Object.values(state.picks)
    .map((id) => deps.playersById.get(id))
    .filter(Boolean) as PlayerSeason[];
  if (!players.length) return 'balanced';
  const avgAttack = players.reduce((a, p) => a + p.attack, 0) / players.length;
  const avgDefence = players.reduce((a, p) => a + p.defence, 0) / players.length;
  if (avgAttack > avgDefence + 6) return rng.pick(['attacking', 'possession', 'direct']);
  if (avgDefence > avgAttack + 6) return rng.pick(['defensive', 'counter']);
  return rng.pick(['balanced', 'balanced', 'high-press', 'possession']);
}

/**
 * Score every legal option in the current offer and return the best one.
 * `greed` below 1 introduces deliberate mistakes so weaker AI drafts are genuinely weaker.
 */
function bestAvailable(
  state: DraftState,
  deps: DraftEngineDeps,
  rng: Rng,
  greed: number,
): { playerId: string; slotId: string; score: number } | null {
  const offer = state.currentOffer;
  if (!offer) return null;
  const formation = getFormation(state.formationId);
  const slotById = new Map(formation.slots.map((s) => [s.id, s]));
  const filled = new Set(Object.keys(state.picks));
  const remaining = formation.slots.filter((s) => !filled.has(s.id));

  const scored: { playerId: string; slotId: string; score: number }[] = [];
  for (const entry of offer.players) {
    const player = deps.playersById.get(entry.playerId);
    if (!player) continue;
    for (const slotId of entry.eligibleSlotIds) {
      const slot = slotById.get(slotId);
      if (!slot) continue;
      const natural = slot.position === player.position ? 4 : 0;
      // Weight by what that slot actually needs.
      const need =
        player.attack * slot.weights.attack +
        ((player.attack + player.defence) / 2) * slot.weights.midfield +
        player.defence * slot.weights.defence +
        (slot.position === 'GK' ? player.goalkeeping * 0.9 : 0);
      const denom = slot.weights.attack + slot.weights.midfield + slot.weights.defence + (slot.position === 'GK' ? 0.9 : 0);
      // Scarcity: filling an awkward slot early is worth something.
      const scarcity = remaining.length <= 3 ? 3 : 0;
      scored.push({ playerId: entry.playerId, slotId, score: need / (denom || 1) + natural + scarcity });
    }
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  if (greed >= 1 || rng.chance(greed)) return scored[0];
  // Otherwise take something from the upper half — a plausible human-ish mistake.
  const window = Math.max(1, Math.floor(scored.length * 0.5));
  return scored[rng.int(0, window - 1)];
}

/** Turn a finished draft into the selection the match engine consumes. */
export function toSelection(state: DraftState, style: string): SquadSelection {
  return {
    formationId: state.formationId,
    style: (style || state.style || 'balanced') as SquadSelection['style'],
    picks: { ...state.picks },
  };
}

/** Which positions still need filling, for the draft HUD. */
export function remainingPositions(state: DraftState): Position[] {
  const formation = getFormation(state.formationId);
  const filled = new Set(Object.keys(state.picks));
  return formation.slots.filter((s) => !filled.has(s.id)).map((s) => s.position);
}
