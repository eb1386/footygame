/**
 * Deterministic pseudo-random number generation.
 *
 * Every random decision in the game — draft offers, AI picks, match events — runs through
 * one of these generators. Given the same seed you get the same stream, which is what makes
 * a match replayable, synchronisable between two players, and testable.
 */

/** Hash an arbitrary string into a 32-bit seed. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Final avalanche so similar strings don't produce similar streams.
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Pick one element uniformly. */
  pick<T>(items: readonly T[]): T;
  /** Pick one element with the given non-negative weights. */
  weighted<T>(items: readonly T[], weight: (item: T, index: number) => number): T;
  /** Fisher-Yates shuffle, returning a new array. */
  shuffle<T>(items: readonly T[]): T[];
  /** Standard normal sample (Box-Muller). */
  normal(mean?: number, sd?: number): number;
  /** Gamma-ish positive sample used for chance quality; shape > 0. */
  beta(alpha: number, beta: number): number;
}

/** mulberry32 — small, fast, good enough distribution for game simulation. */
export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 0x9e3779b9;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int(min, max) {
      if (max < min) return min;
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(p) {
      return next() < p;
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    weighted(items, weight) {
      let total = 0;
      const weights: number[] = [];
      for (let i = 0; i < items.length; i++) {
        const w = Math.max(0, weight(items[i], i));
        weights.push(w);
        total += w;
      }
      if (total <= 0) return items[Math.floor(next() * items.length)];
      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    normal(mean = 0, sd = 1) {
      // Box-Muller; guard against log(0).
      let u = next();
      while (u === 0) u = next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    beta(alpha, betaParam) {
      // Johnk's method is unstable for small parameters; use the ratio of two gammas
      // approximated with the sum-of-exponentials trick for integer-ish shapes.
      const gamma = (shape: number): number => {
        if (shape < 1) {
          const u = Math.max(next(), 1e-12);
          return gamma(shape + 1) * Math.pow(u, 1 / shape);
        }
        // Marsaglia & Tsang
        const d = shape - 1 / 3;
        const c = 1 / Math.sqrt(9 * d);
        for (;;) {
          const x = rng.normal();
          const v = Math.pow(1 + c * x, 3);
          if (v <= 0) continue;
          const u = Math.max(next(), 1e-12);
          if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
        }
      };
      const a = gamma(alpha);
      const b = gamma(betaParam);
      return a / (a + b || 1);
    },
  };
  return rng;
}

/** Build a stable child seed from a parent seed and a label. */
export function deriveSeed(parent: string | number, ...labels: (string | number)[]): string {
  return [parent, ...labels].join(':');
}

/** Human-friendly seeds for rooms: 8 upper-case characters, no ambiguous glyphs. */
const SEED_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomSeedString(length = 10): string {
  let out = '';
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) out += SEED_ALPHABET[bytes[i] % SEED_ALPHABET.length];
  return out;
}
