/**
 * The rating model.
 *
 * The inspiration's own rating methodology is not published, so this is an independent,
 * transparent model built from the signals our legitimately-sourced datasets actually carry.
 * Everything lives in this one module so it can be recalibrated without touching gameplay.
 *
 * Signals, in rough order of weight:
 *   1. Squad strength     — how good was the team that season (league/competition tier, era).
 *   2. Stature            — Wikipedia language-edition count for the player, a strong and
 *                           remarkably well-behaved proxy for how significant a footballer is.
 *   3. Season performance — real numbers where we have them (FPL points, xG, xA, minutes).
 *   4. International record — caps and international goals at the time of a tournament.
 *   5. Role and age       — starters rate above squad players; an age curve peaking at 27.
 *
 * Output is a 40-99 overall plus attack / defence / goalkeeping sub-ratings.
 */

import type { CoarsePosition, Position } from './types';

export interface RatingSignals {
  position: Position;
  /** 0-100 strength of the squad this player-season belongs to. */
  squadStrength: number;
  /** Wikipedia language editions carrying an article about this player. */
  sitelinks?: number | null;
  /** Shirt number, used as a weak starter signal. */
  shirt?: number | null;
  /** Explicitly known starter. */
  starter?: boolean;
  age?: number | null;
  caps?: number | null;
  intlGoals?: number | null;
  /** Normalised 0-1 season performance, when real match data exists. */
  performance?: number | null;
  /** Normalised 0-1 market valuation, when it exists. */
  valuation?: number | null;
  year: number;
}

export interface Ratings {
  overall: number;
  attack: number;
  defence: number;
  goalkeeping: number;
  starter: boolean;
  legendary: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Diminishing-returns curve: 0 at 0, ~1 at `full`. */
function saturate(value: number, full: number): number {
  if (!value || value <= 0) return 0;
  return Math.log1p(value) / Math.log1p(full);
}

/** Footballers peak around 27; sharp rise through the early twenties, gentle decline after 31. */
export function ageCurve(age: number | null | undefined): number {
  if (!age || age < 15 || age > 45) return 0;
  if (age < 21) return -6 + (age - 17) * 1.1;
  if (age < 24) return -1.6 + (age - 21) * 0.55;
  if (age <= 30) return 0.5 + (1 - Math.abs(27 - age) / 6) * 1.6;
  if (age <= 34) return 1.4 - (age - 30) * 1.15;
  return -3.2 - (age - 34) * 1.3;
}

export function computeRatings(signals: RatingSignals): Ratings {
  const {
    position,
    squadStrength,
    sitelinks,
    shirt,
    age,
    caps,
    intlGoals,
    performance,
    valuation,
  } = signals;

  // 1. A player's floor is set by the company they keep.
  const base = 44 + clamp(squadStrength, 30, 99) * 0.40;

  // 2. Stature. 200+ language editions is Messi/Ronaldo territory; 10 is a squad player.
  const stature = saturate(sitelinks ?? 0, 180) * 19;

  // 3. Real season performance, when the dataset has it.
  const perf = performance != null ? (performance - 0.45) * 16 : 0;
  const market = valuation != null ? (valuation - 0.4) * 11 : 0;

  // 4. International record.
  const capBoost = saturate(caps ?? 0, 130) * 6;
  const goalBoost = position === 'GK' ? 0 : saturate(intlGoals ?? 0, 45) * 3.5;

  // 5. Role and age.
  const starterKnown = signals.starter ?? (shirt != null && shirt >= 1 && shirt <= 11);
  const roleBoost = starterKnown ? 2.4 : -1.4;
  const ageAdj = ageCurve(age);

  const raw = base + stature + perf + market + capBoost + goalBoost + roleBoost + ageAdj;
  const overall = Math.round(clamp(raw, 40, 99));

  const profile = POSITION_PROFILE[position];
  const attack = Math.round(clamp(overall * profile.attack + profile.attackOffset, 20, 99));
  const defence = Math.round(clamp(overall * profile.defence + profile.defenceOffset, 20, 99));
  const goalkeeping = position === 'GK' ? overall : Math.round(clamp(overall * 0.28, 10, 45));

  return {
    overall,
    attack,
    defence,
    goalkeeping,
    starter: starterKnown,
    legendary: overall >= 90 && (sitelinks ?? 0) >= 70,
  };
}

/**
 * How an overall rating splits into attacking and defensive ability, by position.
 * A 90-rated centre-back defends at ~92 and attacks at ~45; a 90-rated striker is the mirror.
 */
const POSITION_PROFILE: Record<Position, { attack: number; defence: number; attackOffset: number; defenceOffset: number }> = {
  GK: { attack: 0.16, defence: 0.72, attackOffset: 2, defenceOffset: 14 },
  CB: { attack: 0.46, defence: 1.0, attackOffset: 2, defenceOffset: 2 },
  RB: { attack: 0.68, defence: 0.92, attackOffset: 2, defenceOffset: 2 },
  LB: { attack: 0.68, defence: 0.92, attackOffset: 2, defenceOffset: 2 },
  DM: { attack: 0.6, defence: 0.94, attackOffset: 2, defenceOffset: 2 },
  CM: { attack: 0.82, defence: 0.78, attackOffset: 2, defenceOffset: 2 },
  AM: { attack: 0.96, defence: 0.5, attackOffset: 2, defenceOffset: 2 },
  RM: { attack: 0.86, defence: 0.66, attackOffset: 2, defenceOffset: 2 },
  LM: { attack: 0.86, defence: 0.66, attackOffset: 2, defenceOffset: 2 },
  RW: { attack: 1.0, defence: 0.42, attackOffset: 1, defenceOffset: 2 },
  LW: { attack: 1.0, defence: 0.42, attackOffset: 1, defenceOffset: 2 },
  ST: { attack: 1.02, defence: 0.32, attackOffset: 1, defenceOffset: 2 },
};

/**
 * Turn a coarse GK/DF/MF/FW plus a shirt number into a specific position.
 * Shirt numbers are a genuinely strong signal in football: 1 keeps goal, 2 and 3 are
 * full-backs, 4/5/6 sit centrally, 7 and 11 are wide, 9 leads the line, 10 plays behind.
 */
export function refinePosition(coarse: CoarsePosition | null, shirt: number | null, hint?: string | null): {
  position: Position;
  secondary: Position[];
} {
  const h = (hint || '').toUpperCase();
  const direct = DETAILED_HINTS[h];
  if (direct) return direct;

  switch (coarse) {
    case 'GK':
      return { position: 'GK', secondary: [] };
    case 'DF':
      if (shirt === 2) return { position: 'RB', secondary: ['CB'] };
      if (shirt === 3) return { position: 'LB', secondary: ['CB'] };
      if (shirt === 12 || shirt === 22) return { position: 'LB', secondary: ['RB'] };
      if (shirt === 24 || shirt === 20) return { position: 'RB', secondary: ['CB'] };
      return { position: 'CB', secondary: shirt === 6 ? ['DM'] : [] };
    case 'MF':
      if (shirt === 4 || shirt === 6) return { position: 'DM', secondary: ['CM', 'CB'] };
      if (shirt === 10) return { position: 'AM', secondary: ['CM'] };
      if (shirt === 7) return { position: 'RM', secondary: ['RW', 'CM'] };
      if (shirt === 11) return { position: 'LM', secondary: ['LW', 'CM'] };
      return { position: 'CM', secondary: ['DM', 'AM'] };
    case 'FW':
      if (shirt === 7) return { position: 'RW', secondary: ['ST', 'RM'] };
      if (shirt === 11) return { position: 'LW', secondary: ['ST', 'LM'] };
      if (shirt === 10) return { position: 'ST', secondary: ['AM'] };
      return { position: 'ST', secondary: ['AM'] };
    default:
      return { position: 'CM', secondary: [] };
  }
}

const DETAILED_HINTS: Record<string, { position: Position; secondary: Position[] }> = {
  GK: { position: 'GK', secondary: [] },
  CB: { position: 'CB', secondary: ['DM'] },
  RB: { position: 'RB', secondary: ['CB', 'RM'] },
  LB: { position: 'LB', secondary: ['CB', 'LM'] },
  RWB: { position: 'RB', secondary: ['RM'] },
  LWB: { position: 'LB', secondary: ['LM'] },
  DM: { position: 'DM', secondary: ['CM', 'CB'] },
  CDM: { position: 'DM', secondary: ['CM', 'CB'] },
  CM: { position: 'CM', secondary: ['DM', 'AM'] },
  AM: { position: 'AM', secondary: ['CM'] },
  CAM: { position: 'AM', secondary: ['CM'] },
  RM: { position: 'RM', secondary: ['RW'] },
  LM: { position: 'LM', secondary: ['LW'] },
  RW: { position: 'RW', secondary: ['RM', 'ST'] },
  LW: { position: 'LW', secondary: ['LM', 'ST'] },
  ST: { position: 'ST', secondary: ['AM'] },
  CF: { position: 'ST', secondary: ['AM'] },
};

/** Derive a squad's overall strength from its rated players. */
export function squadStrengthFrom(overalls: number[]): number {
  if (!overalls.length) return 55;
  const sorted = [...overalls].sort((a, b) => b - a);
  const core = sorted.slice(0, 11);
  const mean = core.reduce((a, b) => a + b, 0) / core.length;
  const depth = sorted.slice(11, 20);
  const depthMean = depth.length ? depth.reduce((a, b) => a + b, 0) / depth.length : mean - 6;
  return Math.round(clamp(mean * 0.86 + depthMean * 0.14, 40, 99));
}
