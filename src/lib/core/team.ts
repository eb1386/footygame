import { getFormation, slotFit } from './formations';
import type { Formation, PlayerSeason, PlayingStyle, Position, SquadSelection, TeamAttributes } from './types';

/** The eleven, resolved: who is in which slot and how well they fit it. */
export interface ResolvedPlayer {
  slotId: string;
  player: PlayerSeason;
  fit: number;
  /** Effective ratings after the out-of-position penalty. */
  attack: number;
  defence: number;
  goalkeeping: number;
  overall: number;
  x: number;
  y: number;
  slotPosition: Position;
}

export interface ResolvedTeam {
  formation: Formation;
  style: PlayingStyle;
  players: ResolvedPlayer[];
  attributes: TeamAttributes;
  /** Convenience: only the outfield players, used for picking scorers. */
  outfield: ResolvedPlayer[];
  keeper: ResolvedPlayer | null;
}

export const STYLES: { id: PlayingStyle; name: string; blurb: string }[] = [
  { id: 'balanced', name: 'BALANCED', blurb: 'No trade-offs. Solid everywhere.' },
  { id: 'attacking', name: 'ATTACKING', blurb: 'More chances created, more conceded.' },
  { id: 'defensive', name: 'DEFENSIVE', blurb: 'Sit deep. Concede less, create less.' },
  { id: 'possession', name: 'POSSESSION', blurb: 'Control the ball, build better chances.' },
  { id: 'counter', name: 'COUNTER ATTACK', blurb: 'Give up the ball, punish in transition.' },
  { id: 'high-press', name: 'HIGH PRESS', blurb: 'Win it high. Ferocious early, leggy late.' },
  { id: 'direct', name: 'DIRECT', blurb: 'Go long and go often. Volume over quality.' },
];

interface StyleModifier {
  attack: number;
  defence: number;
  possession: number;
  chanceVolume: number;
  chanceQuality: number;
  counter: number;
  press: number;
  discipline: number;
  /** Multiplier applied to the team's output after the 70th minute. */
  stamina: number;
}

export const STYLE_MODIFIERS: Record<PlayingStyle, StyleModifier> = {
  balanced: { attack: 1, defence: 1, possession: 1, chanceVolume: 1, chanceQuality: 1, counter: 1, press: 1, discipline: 1, stamina: 1 },
  attacking: { attack: 1.1, defence: 0.9, possession: 1.04, chanceVolume: 1.16, chanceQuality: 0.98, counter: 0.95, press: 1.05, discipline: 0.97, stamina: 0.98 },
  defensive: { attack: 0.87, defence: 1.14, possession: 0.9, chanceVolume: 0.8, chanceQuality: 1.02, counter: 1.08, press: 0.9, discipline: 1.05, stamina: 1.03 },
  possession: { attack: 1.03, defence: 1.02, possession: 1.2, chanceVolume: 1.02, chanceQuality: 1.12, counter: 0.85, press: 1.02, discipline: 1.04, stamina: 1.01 },
  counter: { attack: 0.98, defence: 1.06, possession: 0.82, chanceVolume: 0.9, chanceQuality: 1.2, counter: 1.3, press: 0.92, discipline: 1, stamina: 1.02 },
  'high-press': { attack: 1.06, defence: 1.02, possession: 1.1, chanceVolume: 1.1, chanceQuality: 1.04, counter: 0.9, press: 1.28, discipline: 0.92, stamina: 0.9 },
  direct: { attack: 1.04, defence: 0.98, possession: 0.88, chanceVolume: 1.2, chanceQuality: 0.86, counter: 1.12, press: 0.96, discipline: 0.98, stamina: 1.02 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Resolve a drafted selection into a playable team: apply out-of-position penalties, then
 * roll the eleven up into the attributes the simulation actually consumes.
 */
export function resolveTeam(selection: SquadSelection, playersById: Map<string, PlayerSeason>): ResolvedTeam {
  const formation = getFormation(selection.formationId);
  const players: ResolvedPlayer[] = [];

  for (const slot of formation.slots) {
    const playerId = selection.picks[slot.id];
    const player = playerId ? playersById.get(playerId) : undefined;
    if (!player) continue;
    const fit = slotFit(slot, player.position, player.secondary);
    // Out of position costs ability, never eligibility — the draft already enforced that.
    const penalty = fit >= 1 ? 1 : 0.62 + fit * 0.38;
    players.push({
      slotId: slot.id,
      player,
      fit,
      attack: player.attack * penalty,
      defence: player.defence * penalty,
      goalkeeping: player.goalkeeping * penalty,
      overall: player.overall * penalty,
      x: slot.x,
      y: slot.y,
      slotPosition: slot.position,
    });
  }

  const attributes = deriveAttributes(formation, selection.style, players);
  const keeper = players.find((p) => p.slotPosition === 'GK') ?? null;
  return {
    formation,
    style: selection.style,
    players,
    attributes,
    outfield: players.filter((p) => p.slotPosition !== 'GK'),
    keeper,
  };
}

function deriveAttributes(formation: Formation, style: PlayingStyle, players: ResolvedPlayer[]): TeamAttributes {
  const mod = STYLE_MODIFIERS[style] ?? STYLE_MODIFIERS.balanced;
  const slotById = new Map(formation.slots.map((s) => [s.id, s]));

  let attackNum = 0;
  let attackDen = 0;
  let midNum = 0;
  let midDen = 0;
  let defNum = 0;
  let defDen = 0;

  for (const p of players) {
    const slot = slotById.get(p.slotId);
    if (!slot) continue;
    attackNum += p.attack * slot.weights.attack;
    attackDen += slot.weights.attack;
    midNum += ((p.attack + p.defence) / 2) * slot.weights.midfield;
    midDen += slot.weights.midfield;
    defNum += p.defence * slot.weights.defence;
    defDen += slot.weights.defence;
  }

  const rawAttack = attackDen ? attackNum / attackDen : 50;
  const rawMid = midDen ? midNum / midDen : 50;
  const rawDefence = defDen ? defNum / defDen : 50;
  const keeper = players.find((p) => p.slotPosition === 'GK');
  const rawKeeper = keeper ? keeper.goalkeeping : 48;

  // Missing players (an unfinished draft) hurt — an incomplete side is a weak side.
  const completeness = clamp(players.length / formation.slots.length, 0.4, 1);

  const forwards = players.filter((p) => ['ST', 'RW', 'LW', 'AM'].includes(p.slotPosition));
  const finishing = forwards.length
    ? forwards.reduce((a, p) => a + p.attack, 0) / forwards.length
    : rawAttack;
  const creators = players.filter((p) => ['AM', 'CM', 'RW', 'LW', 'RM', 'LM'].includes(p.slotPosition));
  const creativity = creators.length ? creators.reduce((a, p) => a + p.attack, 0) / creators.length : rawMid;
  const setPieces = players.length
    ? players.map((p) => p.attack).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3
    : 55;
  const discipline = players.length
    ? players.reduce((a, p) => a + p.defence, 0) / players.length
    : 55;

  const attack = clamp(rawAttack * formation.modifiers.attack * mod.attack * completeness, 20, 99);
  const midfield = clamp(rawMid * formation.modifiers.midfield * mod.possession * completeness, 20, 99);
  const defence = clamp(rawDefence * formation.modifiers.defence * mod.defence * completeness, 20, 99);
  const goalkeeper = clamp(rawKeeper * completeness, 20, 99);

  return {
    attack,
    midfield,
    defence,
    goalkeeper,
    finishing: clamp(finishing * mod.chanceQuality, 20, 99),
    creativity: clamp(creativity * mod.possession, 20, 99),
    possession: clamp(midfield * mod.possession, 20, 99),
    counter: clamp(((attack + midfield) / 2) * formation.modifiers.counter * mod.counter, 20, 99),
    width: clamp(60 * formation.modifiers.width, 20, 99),
    setPieces: clamp(setPieces, 20, 99),
    discipline: clamp(discipline * mod.discipline, 20, 99),
    // Weighted towards the defensive half because that is what the match engine rewards:
    // suppressing the opposition's chance quality is worth more over a season than volume.
    overall: Math.round(clamp(attack * 0.27 + midfield * 0.26 + defence * 0.32 + goalkeeper * 0.15, 20, 99)),
  };
}

/** Headline numbers for the squad screen. */
export function squadSummary(team: ResolvedTeam) {
  return {
    attack: Math.round(team.attributes.attack),
    midfield: Math.round(team.attributes.midfield),
    defence: Math.round(team.attributes.defence),
    overall: Math.round(team.attributes.overall),
  };
}
