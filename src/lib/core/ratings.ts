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
  const { position, squadStrength, sitelinks, shirt, age, caps, intlGoals, performance, valuation } = signals;

  // Each signal is normalised to 0-1 first, then blended. Summing raw bonuses instead —
  // an earlier version of this — lets a player who happens to have several signals present
  // stack them all and pin to 99, which is how a whole Premier League XI ended up in the
  // high nineties. A weighted mean over whatever signals exist cannot do that.
  const parts: { value: number; weight: number }[] = [];
  const add = (value: number | null | undefined, weight: number) => {
    if (value == null || Number.isNaN(value)) return;
    parts.push({ value: clamp(value, 0, 1), weight });
  };

  // The company you keep: how strong was this squad.
  add((clamp(squadStrength, 35, 99) - 35) / 64, 0.3);
  // Stature: Wikipedia language editions. ~180 is the very top of the game.
  add(sitelinks != null ? saturate(sitelinks, 180) : null, 0.36);
  // Real season performance and market valuation, where the dataset carries them.
  add(performance, 0.17);
  add(valuation, 0.06);
  // International record, for tournament squads.
  const intl =
    caps != null || intlGoals != null
      ? 0.62 * saturate(caps ?? 0, 130) + 0.38 * saturate(position === 'GK' ? 0 : intlGoals ?? 0, 45)
      : null;
  add(intl, 0.11);

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0) || 1;
  const score = parts.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight;

  // Map the blended score onto the rating scale, then apply the two adjustments that are
  // genuinely additive: whether this player starts, and where they are on the age curve.
  const starterKnown = signals.starter ?? (shirt != null && shirt >= 1 && shirt <= 11);
  // The scale is deliberately wide: a squad player lands in the fifties, a first-team
  // regular in the low seventies, and only the genuinely historic reach the mid nineties.
  const overall = Math.round(
    clamp(36 + score * 66 + (starterKnown ? 2.2 : -1.8) + ageCurve(age) * 0.8, 40, 99),
  );

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
 * Turn a coarse GK/DF/MF/FW plus a shirt number into a specific position, plus the other
 * positions that player can cover.
 *
 * Every outfielder gets two secondary positions, so each card is playable in three places
 * and a draft never stalls because the one slot left is one nobody can fill. Goalkeepers get
 * none: a keeper keeps goal, and nobody else does.
 *
 * Shirt numbers are a genuinely strong signal in football: 1 keeps goal, 2 and 3 are
 * full-backs, 4/5/6 sit centrally, 7 and 11 are wide, 9 leads the line, 10 plays behind.
 */
export function refinePosition(coarse: CoarsePosition | null, shirt: number | null, hint?: string | null): {
  position: Position;
  secondary: Position[];
} {
  const h = (hint || '').toUpperCase();
  const fromHint = DETAILED_HINTS[h];
  if (fromHint) return { position: fromHint, secondary: SECONDARY[fromHint] };

  const position = ((): Position => {
    switch (coarse) {
      case 'GK':
        return 'GK';
      case 'DF':
        if (shirt === 2) return 'RB';
        if (shirt === 3) return 'LB';
        if (shirt === 12 || shirt === 22 || shirt === 33) return 'LB';
        if (shirt === 20 || shirt === 24) return 'RB';
        return 'CB';
      case 'MF':
        if (shirt === 4 || shirt === 6) return 'DM';
        if (shirt === 10) return 'AM';
        if (shirt === 7) return 'RM';
        if (shirt === 11) return 'LM';
        return 'CM';
      case 'FW':
        if (shirt === 7) return 'RW';
        if (shirt === 11) return 'LW';
        return 'ST';
      default:
        return 'CM';
    }
  })();

  return { position, secondary: SECONDARY[position] };
}

/**
 * The two positions each role can also cover. These are the moves a manager actually makes:
 * a full-back tucking inside, a holding midfielder dropping into defence, a winger going up
 * front. Nothing here turns a centre-back into a striker.
 */
const SECONDARY: Record<Position, Position[]> = {
  GK: [],
  CB: ['DM', 'RB'],
  RB: ['CB', 'RM'],
  LB: ['CB', 'LM'],
  DM: ['CM', 'CB'],
  CM: ['DM', 'AM'],
  AM: ['CM', 'LW'],
  RM: ['RW', 'CM'],
  LM: ['LW', 'CM'],
  RW: ['RM', 'ST'],
  LW: ['LM', 'ST'],
  ST: ['AM', 'RW'],
};

const DETAILED_HINTS: Record<string, Position> = {
  GK: 'GK',
  CB: 'CB',
  RB: 'RB',
  LB: 'LB',
  RWB: 'RB',
  LWB: 'LB',
  DM: 'DM',
  CDM: 'DM',
  CM: 'CM',
  AM: 'AM',
  CAM: 'AM',
  RM: 'RM',
  LM: 'LM',
  RW: 'RW',
  LW: 'LW',
  ST: 'ST',
  CF: 'ST',
  FW: 'ST',
  DF: 'CB',
  MF: 'CM',
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
