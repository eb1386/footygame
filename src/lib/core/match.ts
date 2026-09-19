/**
 * The match engine.
 *
 * A match is simulated minute by minute. Nothing about the result is decided up front:
 * possession, chance creation, chance quality, finishing and goalkeeping are each modelled
 * separately, and the score emerges from them. Better teams win more often because they
 * generate more and better chances, not because a die is loaded in their favour.
 *
 * The whole thing is driven by one seeded RNG, so the same inputs always produce the same
 * match — which is what lets two players watch the identical game, and lets replays work
 * off stored events instead of re-rolling.
 */

import { createRng, type Rng } from './rng';
import { STYLE_MODIFIERS, type ResolvedPlayer, type ResolvedTeam } from './team';
import type { MatchEvent, MatchPlayerStats, MatchResult, MatchStats, ShootoutKick } from './types';

export interface MatchContext {
  seed: string;
  homeName: string;
  awayName: string;
  /** 0 = neutral venue, 1 = normal home advantage. */
  homeAdvantage: number;
  /** Knockout matches go to extra time and penalties when level. */
  knockout: boolean;
  /** Aggregate carried in from the first leg, from the perspective of this match's home team. */
  aggregate?: { home: number; away: number; awayGoalsRule?: boolean } | null;
  /** Off by default; the room can enable them. */
  injuries?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Calibration constants. Tuned so a full league season lands on realistic distributions:
// ~2.7 goals per game, ~45% home wins, ~25% draws, and strong sides beating weak ones
// roughly 70% of the time without making upsets impossible.
const BASE_CHANCES_PER_TEAM = 13.0;
const HOME_ADVANTAGE_CHANCES = 1.11;
const HOME_ADVANTAGE_DEFENCE = 0.055;

interface SideState {
  team: ResolvedTeam;
  name: string;
  score: number;
  stats: MatchStats;
  /** Players sent off. */
  dismissed: Set<string>;
  booked: Set<string>;
  onPitch: ResolvedPlayer[];
  subsUsed: number;
}

function emptyStats(): MatchStats {
  return {
    possession: 50,
    shots: 0,
    shotsOnTarget: 0,
    bigChances: 0,
    corners: 0,
    offsides: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    xg: 0,
    saves: 0,
  };
}

export function simulateMatch(home: ResolvedTeam, away: ResolvedTeam, ctx: MatchContext): MatchResult {
  const rng = createRng(ctx.seed);

  const sides: Record<'home' | 'away', SideState> = {
    home: { team: home, name: ctx.homeName, score: 0, stats: emptyStats(), dismissed: new Set(), booked: new Set(), onPitch: [...home.players], subsUsed: 0 },
    away: { team: away, name: ctx.awayName, score: 0, stats: emptyStats(), dismissed: new Set(), booked: new Set(), onPitch: [...away.players], subsUsed: 0 },
  };

  const events: MatchEvent[] = [];
  const playerStats: Record<string, MatchPlayerStats> = {};
  const stat = (id: string): MatchPlayerStats => {
    if (!playerStats[id]) {
      playerStats[id] = { goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheet: false, penaltiesScored: 0, rating: 6.2, motm: false };
    }
    return playerStats[id];
  };

  // ---- Possession ---------------------------------------------------------
  const homeMid = home.attributes.midfield * (1 + ctx.homeAdvantage * 0.02);
  const awayMid = away.attributes.midfield;
  const homePossessionRaw = homeMid / (homeMid + awayMid || 1);
  const styleTilt =
    (STYLE_MODIFIERS[home.style].possession - STYLE_MODIFIERS[away.style].possession) * 0.14;
  const homePossession = clamp(homePossessionRaw + styleTilt + rng.normal(0, 0.035), 0.24, 0.76);
  sides.home.stats.possession = Math.round(homePossession * 100);
  sides.away.stats.possession = 100 - sides.home.stats.possession;

  // ---- Chance rates -------------------------------------------------------
  // Attack vs opposing defence+keeper decides both how many chances a side gets and how
  // good they are. Possession scales volume; style scales both.
  const expectedChances = (attacker: ResolvedTeam, defender: ResolvedTeam, possession: number, isHome: boolean) => {
    const def = defender.attributes.defence * 0.78 + defender.attributes.goalkeeper * 0.22;
    const edge = (attacker.attributes.attack - def) / 100;
    const styleMod = STYLE_MODIFIERS[attacker.style].chanceVolume;
    const homeMod = isHome ? 1 + ctx.homeAdvantage * (HOME_ADVANTAGE_CHANCES - 1) : 1;
    const possessionMod = 0.62 + possession * 0.76;
    return clamp(BASE_CHANCES_PER_TEAM * (1 + edge * 1.75) * styleMod * homeMod * possessionMod, 5.2, 26);
  };

  const rates = {
    home: expectedChances(home, away, homePossession, true),
    away: expectedChances(away, home, 1 - homePossession, false),
  };

  // ---- Minute loop --------------------------------------------------------
  const push = (e: Omit<MatchEvent, 'homeScore' | 'awayScore'>) => {
    events.push({ ...e, homeScore: sides.home.score, awayScore: sides.away.score });
  };

  push({ minute: 0, tick: 0, type: 'kickoff', side: null, text: `${ctx.homeName} v ${ctx.awayName}. We are under way.` });

  const runPeriod = (from: number, to: number) => {
    for (let minute = from; minute <= to; minute++) {
      for (const side of ['home', 'away'] as const) {
        const other = side === 'home' ? 'away' : 'home';
        const attacking = sides[side];
        const defending = sides[other];

        const perMinute = rates[side] / 90;
        const gameState = gameStateModifier(attacking.score - defending.score, minute);
        const fatigue = staminaModifier(attacking.team, minute);
        const numbers = manpowerModifier(attacking.onPitch.length, defending.onPitch.length);
        const p = perMinute * gameState * fatigue * numbers;

        if (rng.chance(p)) {
          resolveChance(minute, side, rng, sides, push, stat, ctx);
        }

        // Fouls, cards and set pieces tick along independently of chances.
        if (rng.chance(0.12 * (2 - STYLE_MODIFIERS[attacking.team.style].discipline))) {
          attacking.stats.fouls++;
          const severity = rng.next();
          const indisciplineRisk = clamp(0.17 * (72 / Math.max(40, attacking.team.attributes.discipline)), 0.06, 0.4);
          if (severity < indisciplineRisk) {
            issueCard(minute, side, rng, sides, push, stat);
          }
        }
        if (rng.chance(0.052)) {
          attacking.stats.corners++;
          if (rng.chance(0.055)) {
            // A corner occasionally becomes a real opening.
            resolveChance(minute, side, rng, sides, push, stat, ctx, { fromSetPiece: true });
          }
        }
        if (rng.chance(0.022)) {
          attacking.stats.offsides++;
          if (rng.chance(0.28)) {
            const p2 = pickAttacker(attacking, rng);
            if (p2) push({ minute, tick: rng.next(), type: 'offside', side, playerId: p2.player.id, playerName: p2.player.name, text: `${p2.player.name} is flagged offside.` });
          }
        }
      }

      // Substitutions in the last third of the match.
      for (const side of ['home', 'away'] as const) {
        if (minute >= 58 && minute <= 85 && sides[side].subsUsed < 3 && rng.chance(0.035)) {
          sides[side].subsUsed++;
        }
      }
    }
  };

  runPeriod(1, 45);
  push({ minute: 45, tick: 0.99, type: 'half-time', side: null, text: `Half-time: ${ctx.homeName} ${sides.home.score}-${sides.away.score} ${ctx.awayName}` });
  push({ minute: 46, tick: 0, type: 'second-half', side: null, text: 'Back under way for the second half.' });
  runPeriod(46, 90);

  const regulationHome = sides.home.score;
  const regulationAway = sides.away.score;
  let extraTime = false;
  let shootout: MatchResult['shootout'] = null;
  let duration = 90;

  if (ctx.knockout && needsExtraTime(sides, ctx)) {
    extraTime = true;
    duration = 120;
    push({ minute: 90, tick: 0.99, type: 'extra-time', side: null, text: 'Level after ninety. We go to extra time.' });
    // Extra time is slower and more cautious.
    rates.home *= 0.78;
    rates.away *= 0.78;
    runPeriod(91, 105);
    push({ minute: 105, tick: 0.99, type: 'extra-time-half', side: null, text: 'End of the first period of extra time.' });
    runPeriod(106, 120);
    push({ minute: 120, tick: 0.98, type: 'extra-time-end', side: null, text: 'End of extra time.' });

    if (needsShootout(sides, ctx)) {
      shootout = runShootout(rng, sides, push, stat);
    }
  }

  push({
    minute: duration,
    tick: 1,
    type: 'full-time',
    side: null,
    text: `Full time: ${ctx.homeName} ${sides.home.score}-${sides.away.score} ${ctx.awayName}`,
  });

  // Clean sheets and player ratings.
  for (const side of ['home', 'away'] as const) {
    const conceded = side === 'home' ? sides.away.score : sides.home.score;
    for (const p of sides[side].team.players) {
      const s = stat(p.player.id);
      if (conceded === 0) s.cleanSheet = true;
      s.rating = clamp(
        6.1 +
          s.goals * 1.05 +
          s.assists * 0.6 +
          (conceded === 0 && ['GK', 'CB', 'RB', 'LB'].includes(p.slotPosition) ? 0.7 : 0) -
          s.yellowCards * 0.25 -
          s.redCards * 1.6 +
          (p.overall - 72) / 42,
        4,
        10,
      );
    }
  }

  const motm = pickMotm(sides, playerStats);
  if (motm) stat(motm.playerId).motm = true;

  events.sort((a, b) => a.minute - b.minute || a.tick - b.tick);

  return {
    seed: ctx.seed,
    homeScore: sides.home.score,
    awayScore: sides.away.score,
    regulationHome,
    regulationAway,
    extraTime,
    shootout,
    duration,
    events,
    home: sides.home.stats,
    away: sides.away.stats,
    playerStats,
    motm,
  };
}

// ---------------------------------------------------------------------------
// Chance resolution
// ---------------------------------------------------------------------------

function resolveChance(
  minute: number,
  side: 'home' | 'away',
  rng: Rng,
  sides: Record<'home' | 'away', SideState>,
  push: (e: Omit<MatchEvent, 'homeScore' | 'awayScore'>) => void,
  stat: (id: string) => MatchPlayerStats,
  ctx: MatchContext,
  opts: { fromSetPiece?: boolean } = {},
) {
  const other = side === 'home' ? 'away' : 'home';
  const attacking = sides[side];
  const defending = sides[other];
  const tick = rng.next();

  const shooter = pickAttacker(attacking, rng);
  if (!shooter) return;

  // Chance quality: a beta draw shaped by attack vs defence. Most chances are poor;
  // a good attack against a poor defence gets more of the good ones.
  const attackQuality = attacking.team.attributes.attack;
  const defenceQuality =
    defending.team.attributes.defence * (1 + (side === 'away' ? ctx.homeAdvantage * HOME_ADVANTAGE_DEFENCE : 0));
  const edge = clamp((attackQuality - defenceQuality) / 100, -0.45, 0.45);
  const styleQuality = STYLE_MODIFIERS[attacking.team.style].chanceQuality;
  const alpha = 1.3 + edge * 3.3;
  const beta = 4.7 - edge * 2.9;
  let xg = clamp(rng.beta(Math.max(0.6, alpha), Math.max(1.2, beta)) * 0.545 * styleQuality, 0.01, 0.9);
  if (opts.fromSetPiece) xg = clamp(xg * 0.85 + 0.02, 0.015, 0.6);

  attacking.stats.xg += xg;

  // Penalties: rare, and worth their own branch.
  if (!opts.fromSetPiece && rng.chance(0.014)) {
    push({ minute, tick, type: 'penalty-awarded', side, text: `Penalty to ${attacking.name}!` });
    const taker = pickPenaltyTaker(attacking, rng) ?? shooter;
    const keeper = defending.team.keeper;
    const scoreChance = clamp(0.78 + (taker.attack - 72) / 260 - ((keeper?.goalkeeping ?? 70) - 72) / 420, 0.55, 0.92);
    if (rng.chance(scoreChance)) {
      attacking.score++;
      attacking.stats.shots++;
      attacking.stats.shotsOnTarget++;
      const s = stat(taker.player.id);
      s.goals++;
      s.penaltiesScored++;
      push({ minute, tick: tick + 0.02, type: 'penalty-scored', side, playerId: taker.player.id, playerName: taker.player.name, xg: 0.78, text: `GOAL! ${taker.player.name} buries the penalty.` });
    } else {
      attacking.stats.shots++;
      if (keeper) defending.stats.saves++;
      push({ minute, tick: tick + 0.02, type: 'penalty-missed', side, playerId: taker.player.id, playerName: taker.player.name, xg: 0.78, text: `Penalty saved! ${taker.player.name} is denied.` });
    }
    return;
  }

  const isBigChance = xg >= 0.22;
  if (isBigChance) attacking.stats.bigChances++;

  // Does the chance become a shot at all? Blocked, crowded out, a poor touch.
  if (rng.chance(0.13 - xg * 0.1)) {
    push({
      minute,
      tick,
      type: 'chance',
      side,
      playerId: shooter.player.id,
      playerName: shooter.player.name,
      xg,
      text: `${attacking.name} work an opening but ${shooter.player.name} can't get the shot away.`,
    });
    return;
  }

  attacking.stats.shots++;

  // A shot's chance of being a goal IS its expected-goals value, adjusted for the keeper.
  // Whether it was on target or wide is decided afterwards, as presentation — deciding it
  // first and then applying xG again would count the same reduction twice.
  const keeper = defending.team.keeper;
  const keeperQuality = keeper ? keeper.goalkeeping : 62;
  const finishing = (shooter.attack - 70) / 500;
  const conversion = clamp(xg * (1 - (keeperQuality - 70) / 260) + finishing, 0.008, 0.95);

  if (rng.chance(conversion)) {
    attacking.stats.shotsOnTarget++;
    attacking.score++;
    const s = stat(shooter.player.id);
    s.goals++;
    const assister = pickAssister(attacking, shooter, rng);
    if (assister) stat(assister.player.id).assists++;
    push({
      minute,
      tick,
      type: 'goal',
      side,
      playerId: shooter.player.id,
      playerName: shooter.player.name,
      assistId: assister?.player.id,
      assistName: assister?.player.name,
      xg,
      text: `GOAL! ${shooter.player.name}${assister ? `, set up by ${assister.player.name}` : ''}.`,
      detail: opts.fromSetPiece ? 'From the corner' : undefined,
    });
    return;
  }

  // Not a goal. Was it on target? Better chances and better finishers hit the target more.
  const onTarget = clamp(0.24 + xg * 0.55 + (shooter.attack - 70) / 420, 0.12, 0.7);
  if (rng.chance(onTarget)) {
    attacking.stats.shotsOnTarget++;
    defending.stats.saves++;
    push({
      minute,
      tick,
      type: 'save',
      side,
      playerId: keeper?.player.id,
      playerName: keeper?.player.name,
      xg,
      text: isBigChance
        ? `SAVE! ${keeper?.player.name ?? 'The keeper'} denies ${shooter.player.name} brilliantly.`
        : `${keeper?.player.name ?? 'The keeper'} gathers ${shooter.player.name}'s effort.`,
    });
    return;
  }

  const woodwork = rng.chance(0.06);
  push({
    minute,
    tick,
    type: woodwork ? 'woodwork' : 'shot',
    side,
    playerId: shooter.player.id,
    playerName: shooter.player.name,
    xg,
    text: woodwork
      ? `Off the woodwork! ${shooter.player.name} is inches away.`
      : isBigChance
        ? `BIG CHANCE! ${shooter.player.name} shoots narrowly wide.`
        : `${shooter.player.name} drags it wide.`,
  });
}

function issueCard(
  minute: number,
  side: 'home' | 'away',
  rng: Rng,
  sides: Record<'home' | 'away', SideState>,
  push: (e: Omit<MatchEvent, 'homeScore' | 'awayScore'>) => void,
  stat: (id: string) => MatchPlayerStats,
) {
  const s = sides[side];
  const candidates = s.onPitch.filter((p) => !s.dismissed.has(p.player.id) && p.slotPosition !== 'GK');
  if (!candidates.length) return;
  // Defensive and midfield players pick up the majority of bookings.
  // Bookings concentrate on defenders and holding midfielders, but spread widely enough
  // that second yellows stay as rare as they are in real football.
  const player = rng.weighted(candidates, (p) =>
    ['CB', 'DM', 'RB', 'LB', 'CM'].includes(p.slotPosition) ? 1.8 : 1,
  );
  const alreadyBooked = s.booked.has(player.player.id);
  // A player already on a yellow is withdrawn or plays within himself; most of the time the
  // second bookable moment simply never comes.
  if (alreadyBooked && !rng.chance(0.26)) return;
  const straightRed = rng.chance(0.006);

  if (alreadyBooked || straightRed) {
    s.dismissed.add(player.player.id);
    s.onPitch = s.onPitch.filter((p) => p.player.id !== player.player.id);
    s.stats.redCards++;
    stat(player.player.id).redCards++;
    push({
      minute,
      tick: rng.next(),
      type: 'red-card',
      side,
      playerId: player.player.id,
      playerName: player.player.name,
      text: alreadyBooked
        ? `RED CARD! Second booking for ${player.player.name}. ${s.name} are down to ten.`
        : `RED CARD! ${player.player.name} is sent off.`,
    });
    return;
  }

  s.booked.add(player.player.id);
  s.stats.yellowCards++;
  stat(player.player.id).yellowCards++;
  push({
    minute,
    tick: rng.next(),
    type: 'yellow-card',
    side,
    playerId: player.player.id,
    playerName: player.player.name,
    text: `Yellow card. ${player.player.name} goes into the book.`,
  });
}

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

function pickAttacker(side: SideState, rng: Rng): ResolvedPlayer | null {
  const pool = side.onPitch.filter((p) => p.slotPosition !== 'GK');
  if (!pool.length) return null;
  return rng.weighted(pool, (p) => Math.pow(Math.max(1, p.attack - 34), 2.1) * SHOT_SHARE[p.slotPosition]);
}

function pickAssister(side: SideState, shooter: ResolvedPlayer, rng: Rng): ResolvedPlayer | null {
  const pool = side.onPitch.filter((p) => p.player.id !== shooter.player.id && p.slotPosition !== 'GK');
  if (!pool.length) return null;
  if (rng.chance(0.22)) return null; // solo goals
  return rng.weighted(pool, (p) => Math.max(1, p.attack - 34) * ASSIST_SHARE[p.slotPosition]);
}

function pickPenaltyTaker(side: SideState, rng: Rng): ResolvedPlayer | null {
  const pool = side.onPitch.filter((p) => p.slotPosition !== 'GK');
  if (!pool.length) return null;
  const best = [...pool].sort((a, b) => b.attack - a.attack);
  return best[rng.chance(0.75) ? 0 : Math.min(1, best.length - 1)];
}

const SHOT_SHARE: Record<string, number> = {
  GK: 0, CB: 0.14, RB: 0.16, LB: 0.16, DM: 0.24, CM: 0.55, AM: 1.1, RM: 0.8, LM: 0.8, RW: 1.25, LW: 1.25, ST: 2.1,
};
const ASSIST_SHARE: Record<string, number> = {
  GK: 0.02, CB: 0.12, RB: 0.5, LB: 0.5, DM: 0.45, CM: 1.0, AM: 1.5, RM: 1.25, LM: 1.25, RW: 1.4, LW: 1.4, ST: 0.9,
};

/** Trailing teams push; leading teams manage the game. */
function gameStateModifier(goalDiff: number, minute: number): number {
  if (minute < 55) return 1;
  const urgency = clamp(-goalDiff, -2, 2);
  const lateness = (minute - 55) / 45;
  return clamp(1 + urgency * 0.16 * lateness, 0.7, 1.45);
}

function staminaModifier(team: ResolvedTeam, minute: number): number {
  if (minute <= 70) return 1;
  const s = STYLE_MODIFIERS[team.style].stamina;
  return 1 - (1 - s) * ((minute - 70) / 50);
}

function manpowerModifier(attackers: number, defenders: number): number {
  const diff = attackers - defenders;
  if (diff === 0) return 1;
  return clamp(1 + diff * 0.22, 0.45, 1.6);
}

function pickMotm(
  sides: Record<'home' | 'away', SideState>,
  playerStats: Record<string, MatchPlayerStats>,
): MatchResult['motm'] {
  let best: { playerId: string; playerName: string; side: 'home' | 'away'; score: number } | null = null;
  for (const side of ['home', 'away'] as const) {
    const won = sides[side].score > sides[side === 'home' ? 'away' : 'home'].score;
    for (const p of sides[side].team.players) {
      const s = playerStats[p.player.id];
      if (!s) continue;
      const score = s.rating + (won ? 0.35 : 0) + s.goals * 0.3;
      if (!best || score > best.score) best = { playerId: p.player.id, playerName: p.player.name, side, score };
    }
  }
  return best ? { playerId: best.playerId, playerName: best.playerName, side: best.side } : null;
}

// ---------------------------------------------------------------------------
// Knockout resolution
// ---------------------------------------------------------------------------

function needsExtraTime(sides: Record<'home' | 'away', SideState>, ctx: MatchContext): boolean {
  if (!ctx.aggregate) return sides.home.score === sides.away.score;
  const aggHome = ctx.aggregate.home + sides.home.score;
  const aggAway = ctx.aggregate.away + sides.away.score;
  return aggHome === aggAway;
}

function needsShootout(sides: Record<'home' | 'away', SideState>, ctx: MatchContext): boolean {
  return needsExtraTime(sides, ctx);
}

function runShootout(
  rng: Rng,
  sides: Record<'home' | 'away', SideState>,
  push: (e: Omit<MatchEvent, 'homeScore' | 'awayScore'>) => void,
  stat: (id: string) => MatchPlayerStats,
): { home: number; away: number; kicks: ShootoutKick[] } {
  push({ minute: 120, tick: 0.99, type: 'shootout-start', side: null, text: 'It all comes down to penalties.' });

  const takers: Record<'home' | 'away', ResolvedPlayer[]> = {
    home: orderTakers(sides.home, rng),
    away: orderTakers(sides.away, rng),
  };
  const kicks: ShootoutKick[] = [];
  const score = { home: 0, away: 0 };
  let index = 0;

  const kick = (side: 'home' | 'away') => {
    const other = side === 'home' ? 'away' : 'home';
    const taker = takers[side][index % Math.max(1, takers[side].length)];
    const keeper = sides[other].team.keeper;
    // Shootout conversion sits around 75%; nerve matters more than quality.
    const p = clamp(0.74 + (taker.attack - 72) / 300 - ((keeper?.goalkeeping ?? 70) - 72) / 460, 0.5, 0.9);
    const scored = rng.chance(p);
    if (scored) {
      score[side]++;
      stat(taker.player.id).penaltiesScored++;
    }
    kicks.push({ side, index, scored, playerId: taker.player.id, playerName: taker.player.name, homeScore: score.home, awayScore: score.away });
    push({
      minute: 120,
      tick: 1 + kicks.length * 0.001,
      type: 'shootout-kick',
      side,
      playerId: taker.player.id,
      playerName: taker.player.name,
      text: scored ? `${taker.player.name} scores. ${score.home}-${score.away}` : `${taker.player.name} misses! ${score.home}-${score.away}`,
    });
  };

  // Best of five, then sudden death.
  for (index = 0; index < 5; index++) {
    kick('home');
    if (decided(score, index + 1, 5)) break;
    kick('away');
    if (decided(score, index + 1, 5)) break;
  }
  let guard = 0;
  while (score.home === score.away && guard < 20) {
    kick('home');
    kick('away');
    guard++;
    index++;
  }

  push({
    minute: 120,
    tick: 1.5,
    type: 'shootout-end',
    side: null,
    text: `${score.home > score.away ? sides.home.name : sides.away.name} win the shootout ${Math.max(score.home, score.away)}-${Math.min(score.home, score.away)}.`,
  });
  return { home: score.home, away: score.away, kicks };
}

function orderTakers(side: SideState, rng: Rng): ResolvedPlayer[] {
  const pool = side.onPitch.filter((p) => p.slotPosition !== 'GK');
  const ranked = [...pool].sort((a, b) => b.attack - a.attack);
  // Top five in rough order of ability, with a little shuffle for personality.
  const five = ranked.slice(0, 5);
  const rest = rng.shuffle(ranked.slice(5));
  return [...five, ...rest, ...(side.team.keeper ? [side.team.keeper] : [])];
}

function decided(score: { home: number; away: number }, taken: number, total: number): boolean {
  const homeRemaining = total - taken;
  const awayRemaining = total - taken;
  if (score.home > score.away + awayRemaining) return true;
  if (score.away > score.home + homeRemaining) return true;
  return false;
}

/** Who advances, accounting for aggregate and shootouts. */
export function matchWinner(result: MatchResult, ctx: MatchContext): 'home' | 'away' | null {
  if (result.shootout) return result.shootout.home > result.shootout.away ? 'home' : 'away';
  const aggHome = (ctx.aggregate?.home ?? 0) + result.homeScore;
  const aggAway = (ctx.aggregate?.away ?? 0) + result.awayScore;
  if (aggHome > aggAway) return 'home';
  if (aggAway > aggHome) return 'away';
  return null;
}
