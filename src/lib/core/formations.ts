import type { Formation, FormationSlot, Position } from './types';

/**
 * Formations are data. Adding a new one means adding an entry here — nothing else in the
 * game hard-codes a shape.
 *
 * Slot weights say how much a slot contributes to each phase of play. They sum to roughly
 * 1.0 per slot so an eleven's phase scores stay comparable across shapes.
 */

const slot = (
  id: string,
  position: Position,
  x: number,
  y: number,
  weights: { attack: number; midfield: number; defence: number },
  alternates: Position[] = [],
): FormationSlot => ({ id, position, x, y, weights, alternates });

// Common alternate sets, so shapes stay readable.
const CB_ALTS: Position[] = ['DM', 'RB', 'LB'];
const RB_ALTS: Position[] = ['CB', 'RM', 'RW', 'LB'];
const LB_ALTS: Position[] = ['CB', 'LM', 'LW', 'RB'];
const DM_ALTS: Position[] = ['CM', 'CB'];
const CM_ALTS: Position[] = ['DM', 'AM'];
const AM_ALTS: Position[] = ['CM', 'LW', 'RW', 'ST'];
const RM_ALTS: Position[] = ['RW', 'CM', 'RB', 'AM'];
const LM_ALTS: Position[] = ['LW', 'CM', 'LB', 'AM'];
const RW_ALTS: Position[] = ['RM', 'AM', 'ST', 'LW'];
const LW_ALTS: Position[] = ['LM', 'AM', 'ST', 'RW'];
const ST_ALTS: Position[] = ['AM', 'RW', 'LW'];

export const FORMATIONS: Formation[] = [
  {
    id: '4-3-3',
    name: '4-3-3',
    shape: 'Wide attack',
    description: 'Three forwards stretch the pitch. High chance volume, thinner cover in behind.',
    modifiers: { attack: 1.08, midfield: 1.0, defence: 0.96, width: 1.15, counter: 1.0 },
    slots: [
      slot('gk', 'GK', 50, 5, { attack: 0.02, midfield: 0.05, defence: 0.2 }),
      slot('rb', 'RB', 82, 24, { attack: 0.22, midfield: 0.24, defence: 0.54 }, RB_ALTS),
      slot('rcb', 'CB', 62, 16, { attack: 0.06, midfield: 0.16, defence: 0.78 }, CB_ALTS),
      slot('lcb', 'CB', 38, 16, { attack: 0.06, midfield: 0.16, defence: 0.78 }, CB_ALTS),
      slot('lb', 'LB', 18, 24, { attack: 0.22, midfield: 0.24, defence: 0.54 }, LB_ALTS),
      slot('dm', 'DM', 50, 38, { attack: 0.14, midfield: 0.56, defence: 0.5 }, DM_ALTS),
      slot('rcm', 'CM', 66, 50, { attack: 0.34, midfield: 0.62, defence: 0.24 }, CM_ALTS),
      slot('lcm', 'CM', 34, 50, { attack: 0.34, midfield: 0.62, defence: 0.24 }, CM_ALTS),
      slot('rw', 'RW', 84, 74, { attack: 0.74, midfield: 0.26, defence: 0.08 }, RW_ALTS),
      slot('st', 'ST', 50, 84, { attack: 0.92, midfield: 0.14, defence: 0.02 }, ST_ALTS),
      slot('lw', 'LW', 16, 74, { attack: 0.74, midfield: 0.26, defence: 0.08 }, LW_ALTS),
    ],
  },
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    shape: 'Control',
    description: 'Double pivot behind a creative ten. The most balanced modern shape.',
    modifiers: { attack: 1.0, midfield: 1.1, defence: 1.02, width: 1.0, counter: 1.04 },
    slots: [
      slot('gk', 'GK', 50, 5, { attack: 0.02, midfield: 0.05, defence: 0.2 }),
      slot('rb', 'RB', 82, 24, { attack: 0.2, midfield: 0.24, defence: 0.56 }, RB_ALTS),
      slot('rcb', 'CB', 62, 15, { attack: 0.06, midfield: 0.16, defence: 0.8 }, CB_ALTS),
      slot('lcb', 'CB', 38, 15, { attack: 0.06, midfield: 0.16, defence: 0.8 }, CB_ALTS),
      slot('lb', 'LB', 18, 24, { attack: 0.2, midfield: 0.24, defence: 0.56 }, LB_ALTS),
      slot('rdm', 'DM', 60, 40, { attack: 0.14, midfield: 0.6, defence: 0.46 }, DM_ALTS),
      slot('ldm', 'DM', 40, 40, { attack: 0.14, midfield: 0.6, defence: 0.46 }, DM_ALTS),
      slot('ram', 'RW', 82, 64, { attack: 0.66, midfield: 0.34, defence: 0.1 }, RW_ALTS),
      slot('am', 'AM', 50, 68, { attack: 0.7, midfield: 0.44, defence: 0.06 }, AM_ALTS),
      slot('lam', 'LW', 18, 64, { attack: 0.66, midfield: 0.34, defence: 0.1 }, LW_ALTS),
      slot('st', 'ST', 50, 86, { attack: 0.94, midfield: 0.12, defence: 0.02 }, ST_ALTS),
    ],
  },
  {
    id: '4-4-2',
    name: '4-4-2',
    shape: 'Classic',
    description: 'Two banks of four and a strike partnership. Compact, direct, dependable.',
    modifiers: { attack: 1.02, midfield: 0.96, defence: 1.05, width: 1.1, counter: 1.08 },
    slots: [
      slot('gk', 'GK', 50, 5, { attack: 0.02, midfield: 0.05, defence: 0.2 }),
      slot('rb', 'RB', 82, 22, { attack: 0.18, midfield: 0.22, defence: 0.58 }, RB_ALTS),
      slot('rcb', 'CB', 62, 15, { attack: 0.06, midfield: 0.14, defence: 0.82 }, CB_ALTS),
      slot('lcb', 'CB', 38, 15, { attack: 0.06, midfield: 0.14, defence: 0.82 }, CB_ALTS),
      slot('lb', 'LB', 18, 22, { attack: 0.18, midfield: 0.22, defence: 0.58 }, LB_ALTS),
      slot('rm', 'RM', 84, 52, { attack: 0.52, midfield: 0.46, defence: 0.24 }, RM_ALTS),
      slot('rcm', 'CM', 60, 46, { attack: 0.3, midfield: 0.64, defence: 0.34 }, CM_ALTS),
      slot('lcm', 'CM', 40, 46, { attack: 0.3, midfield: 0.64, defence: 0.34 }, CM_ALTS),
      slot('lm', 'LM', 16, 52, { attack: 0.52, midfield: 0.46, defence: 0.24 }, LM_ALTS),
      slot('rst', 'ST', 60, 82, { attack: 0.88, midfield: 0.16, defence: 0.03 }, ST_ALTS),
      slot('lst', 'ST', 40, 82, { attack: 0.88, midfield: 0.16, defence: 0.03 }, ST_ALTS),
    ],
  },
  {
    id: '3-5-2',
    name: '3-5-2',
    shape: 'Midfield overload',
    description: 'Wing-backs push high and five bodies flood midfield. Wins the middle, exposed wide.',
    modifiers: { attack: 1.04, midfield: 1.14, defence: 0.94, width: 0.92, counter: 0.98 },
    slots: [
      slot('gk', 'GK', 50, 5, { attack: 0.02, midfield: 0.05, defence: 0.2 }),
      slot('rcb', 'CB', 68, 16, { attack: 0.07, midfield: 0.16, defence: 0.78 }, CB_ALTS),
      slot('cb', 'CB', 50, 14, { attack: 0.05, midfield: 0.16, defence: 0.84 }, CB_ALTS),
      slot('lcb', 'CB', 32, 16, { attack: 0.07, midfield: 0.16, defence: 0.78 }, CB_ALTS),
      slot('rwb', 'RM', 88, 48, { attack: 0.46, midfield: 0.44, defence: 0.38 }, ['RB', 'RW', 'CM']),
      slot('lwb', 'LM', 12, 48, { attack: 0.46, midfield: 0.44, defence: 0.38 }, ['LB', 'LW', 'CM']),
      slot('dm', 'DM', 50, 38, { attack: 0.12, midfield: 0.6, defence: 0.5 }, DM_ALTS),
      slot('rcm', 'CM', 64, 54, { attack: 0.36, midfield: 0.66, defence: 0.22 }, CM_ALTS),
      slot('lcm', 'CM', 36, 54, { attack: 0.36, midfield: 0.66, defence: 0.22 }, CM_ALTS),
      slot('rst', 'ST', 58, 84, { attack: 0.9, midfield: 0.14, defence: 0.02 }, ST_ALTS),
      slot('lst', 'ST', 42, 84, { attack: 0.9, midfield: 0.14, defence: 0.02 }, ST_ALTS),
    ],
  },
  {
    id: '5-3-2',
    name: '5-3-2',
    shape: 'Low block',
    description: 'Five at the back, two up top. Hard to break down and lethal on the counter.',
    modifiers: { attack: 0.93, midfield: 0.98, defence: 1.16, width: 1.0, counter: 1.18 },
    slots: [
      slot('gk', 'GK', 50, 5, { attack: 0.02, midfield: 0.05, defence: 0.2 }),
      slot('rwb', 'RB', 86, 32, { attack: 0.3, midfield: 0.3, defence: 0.5 }, RB_ALTS),
      slot('rcb', 'CB', 66, 14, { attack: 0.05, midfield: 0.14, defence: 0.84 }, CB_ALTS),
      slot('cb', 'CB', 50, 12, { attack: 0.04, midfield: 0.14, defence: 0.88 }, CB_ALTS),
      slot('lcb', 'CB', 34, 14, { attack: 0.05, midfield: 0.14, defence: 0.84 }, CB_ALTS),
      slot('lwb', 'LB', 14, 32, { attack: 0.3, midfield: 0.3, defence: 0.5 }, LB_ALTS),
      slot('dm', 'DM', 50, 42, { attack: 0.12, midfield: 0.58, defence: 0.5 }, DM_ALTS),
      slot('rcm', 'CM', 66, 54, { attack: 0.34, midfield: 0.62, defence: 0.26 }, CM_ALTS),
      slot('lcm', 'CM', 34, 54, { attack: 0.34, midfield: 0.62, defence: 0.26 }, CM_ALTS),
      slot('rst', 'ST', 58, 82, { attack: 0.86, midfield: 0.16, defence: 0.03 }, ST_ALTS),
      slot('lst', 'ST', 42, 82, { attack: 0.86, midfield: 0.16, defence: 0.03 }, ST_ALTS),
    ],
  },
  {
    id: '4-1-4-1',
    name: '4-1-4-1',
    shape: 'Press trap',
    description: 'A screen in front of the back four with four ahead of it. Built for pressing.',
    modifiers: { attack: 0.98, midfield: 1.12, defence: 1.08, width: 1.05, counter: 0.96 },
    slots: [
      slot('gk', 'GK', 50, 5, { attack: 0.02, midfield: 0.05, defence: 0.2 }),
      slot('rb', 'RB', 82, 24, { attack: 0.2, midfield: 0.24, defence: 0.56 }, RB_ALTS),
      slot('rcb', 'CB', 62, 15, { attack: 0.06, midfield: 0.16, defence: 0.8 }, CB_ALTS),
      slot('lcb', 'CB', 38, 15, { attack: 0.06, midfield: 0.16, defence: 0.8 }, CB_ALTS),
      slot('lb', 'LB', 18, 24, { attack: 0.2, midfield: 0.24, defence: 0.56 }, LB_ALTS),
      slot('dm', 'DM', 50, 36, { attack: 0.1, midfield: 0.62, defence: 0.54 }, DM_ALTS),
      slot('rm', 'RW', 84, 60, { attack: 0.6, midfield: 0.4, defence: 0.14 }, RW_ALTS),
      slot('rcm', 'CM', 62, 54, { attack: 0.36, midfield: 0.66, defence: 0.22 }, CM_ALTS),
      slot('lcm', 'CM', 38, 54, { attack: 0.36, midfield: 0.66, defence: 0.22 }, CM_ALTS),
      slot('lm', 'LW', 16, 60, { attack: 0.6, midfield: 0.4, defence: 0.14 }, LW_ALTS),
      slot('st', 'ST', 50, 86, { attack: 0.94, midfield: 0.12, defence: 0.02 }, ST_ALTS),
    ],
  },
  {
    id: '3-4-3',
    name: '3-4-3',
    shape: 'Front-foot',
    description: 'Three centre-backs behind a flat four and a front three. Maximum pressure.',
    modifiers: { attack: 1.14, midfield: 1.02, defence: 0.9, width: 1.12, counter: 0.94 },
    slots: [
      slot('gk', 'GK', 50, 5, { attack: 0.02, midfield: 0.05, defence: 0.2 }),
      slot('rcb', 'CB', 68, 16, { attack: 0.08, midfield: 0.16, defence: 0.76 }, CB_ALTS),
      slot('cb', 'CB', 50, 14, { attack: 0.05, midfield: 0.16, defence: 0.84 }, CB_ALTS),
      slot('lcb', 'CB', 32, 16, { attack: 0.08, midfield: 0.16, defence: 0.76 }, CB_ALTS),
      slot('rwb', 'RM', 88, 50, { attack: 0.48, midfield: 0.46, defence: 0.34 }, ['RB', 'RW', 'CM']),
      slot('rcm', 'CM', 60, 46, { attack: 0.32, midfield: 0.66, defence: 0.3 }, CM_ALTS),
      slot('lcm', 'CM', 40, 46, { attack: 0.32, midfield: 0.66, defence: 0.3 }, CM_ALTS),
      slot('lwb', 'LM', 12, 50, { attack: 0.48, midfield: 0.46, defence: 0.34 }, ['LB', 'LW', 'CM']),
      slot('rw', 'RW', 78, 78, { attack: 0.78, midfield: 0.24, defence: 0.06 }, RW_ALTS),
      slot('st', 'ST', 50, 86, { attack: 0.92, midfield: 0.14, defence: 0.02 }, ST_ALTS),
      slot('lw', 'LW', 22, 78, { attack: 0.78, midfield: 0.24, defence: 0.06 }, LW_ALTS),
    ],
  },
];

export const FORMATION_BY_ID = new Map(FORMATIONS.map((f) => [f.id, f]));

export function getFormation(id: string): Formation {
  const f = FORMATION_BY_ID.get(id);
  if (!f) throw new Error(`Unknown formation: ${id}`);
  return f;
}

export const DEFAULT_FORMATION_ID = '4-3-3';

/**
 * How well a player's position fits a slot.
 *  1.00 natural, 0.94 listed alternate for the slot, 0.88 a secondary position the player
 *  actually has, 0 means illegal — a centre-back will never be dropped at striker.
 */
export function slotFit(slotDef: FormationSlot, position: Position, secondary: Position[] = []): number {
  if (slotDef.position === position) return 1;
  if (secondary.includes(slotDef.position)) return 0.94;
  if (slotDef.alternates.includes(position)) return 0.9;
  // A goalkeeper can only keep goal, and only a goalkeeper can.
  if (slotDef.position === 'GK' || position === 'GK') return 0;
  // Anything sharing a band (defence / midfield / attack) is a stretch but legal.
  if (sameBand(slotDef.position, position)) return 0.82;
  return 0;
}

const BANDS: Record<Position, 'gk' | 'def' | 'mid' | 'att'> = {
  GK: 'gk',
  RB: 'def',
  CB: 'def',
  LB: 'def',
  DM: 'mid',
  CM: 'mid',
  AM: 'mid',
  RM: 'mid',
  LM: 'mid',
  RW: 'att',
  LW: 'att',
  ST: 'att',
};

export function positionBand(p: Position) {
  return BANDS[p];
}

function sameBand(a: Position, b: Position) {
  return BANDS[a] === BANDS[b];
}

/** Can this player legally be placed in this slot at all? */
export function canPlay(slotDef: FormationSlot, position: Position, secondary: Position[] = []): boolean {
  return slotFit(slotDef, position, secondary) > 0;
}

/** The empty slots a player could fill, best fit first. */
export function eligibleSlots(
  formation: Formation,
  position: Position,
  secondary: Position[],
  takenSlotIds: Set<string>,
): { slot: FormationSlot; fit: number }[] {
  return formation.slots
    .filter((s) => !takenSlotIds.has(s.id))
    .map((s) => ({ slot: s, fit: slotFit(s, position, secondary) }))
    .filter((s) => s.fit > 0)
    .sort((a, b) => b.fit - a.fit || a.slot.y - b.slot.y);
}
