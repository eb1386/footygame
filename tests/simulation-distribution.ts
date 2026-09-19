/**
 * Long-run simulation check.
 *
 * Runs thousands of matches and reports the distributions against real football benchmarks.
 * This is the harness used to calibrate the engine: `npm run test:sim`.
 */

import { simulateMatch } from '../src/lib/core/match.ts';
import { resolveTeam } from '../src/lib/core/team.ts';
import { createRng } from '../src/lib/core/rng.ts';
import { runAiDraft, toSelection } from '../src/lib/core/draft.ts';
import { competitionSquads, dataset, draftPool } from '../src/lib/data/dataset.ts';
import type { PlayingStyle } from '../src/lib/core/types.ts';

const ds = dataset();
const deps = { playersById: ds.playersById, squadsById: ds.squadsById };
const pool = draftPool('premier-league');
const field = competitionSquads('premier-league');

// Build twenty AI-drafted teams, exactly as a real room would.
const teams = field.slice(0, 20).map((squad, i) => {
  const draft = runAiDraft(
    {
      seed: `calib:${squad.id}`,
      squadPool: pool,
      rerolls: 5,
      allowDuplicatePlayers: false,
      allowDuplicateSquads: false,
    },
    deps,
    'normal',
  );
  return {
    name: squad.teamName,
    resolved: resolveTeam(toSelection(draft, draft.style), ds.playersById),
    index: i,
  };
});

const strengths = teams.map((t) => t.resolved.attributes.overall);
console.log(
  `Teams built. Overall ratings: min ${Math.min(...strengths)} max ${Math.max(...strengths)} mean ${(
    strengths.reduce((a, b) => a + b, 0) / strengths.length
  ).toFixed(1)}`,
);

// --- Distribution over many matches ----------------------------------------
const MATCHES = Number(process.env.MATCHES || 4000);
let homeGoals = 0;
let awayGoals = 0;
let homeWins = 0;
let draws = 0;
let awayWins = 0;
let shots = 0;
let onTarget = 0;
let yellows = 0;
let reds = 0;
let xgTotal = 0;
const scoreCounts = new Map<string, number>();
const goalHistogram = new Array(12).fill(0);

const rng = createRng('calibration');
for (let i = 0; i < MATCHES; i++) {
  const a = teams[rng.int(0, teams.length - 1)];
  let b = teams[rng.int(0, teams.length - 1)];
  while (b === a) b = teams[rng.int(0, teams.length - 1)];
  const result = simulateMatch(a.resolved, b.resolved, {
    seed: `calib-match:${i}`,
    homeName: a.name,
    awayName: b.name,
    homeAdvantage: 1,
    knockout: false,
  });
  homeGoals += result.homeScore;
  awayGoals += result.awayScore;
  if (result.homeScore > result.awayScore) homeWins++;
  else if (result.homeScore < result.awayScore) awayWins++;
  else draws++;
  shots += result.home.shots + result.away.shots;
  onTarget += result.home.shotsOnTarget + result.away.shotsOnTarget;
  yellows += result.home.yellowCards + result.away.yellowCards;
  reds += result.home.redCards + result.away.redCards;
  xgTotal += result.home.xg + result.away.xg;
  const key = `${result.homeScore}-${result.awayScore}`;
  scoreCounts.set(key, (scoreCounts.get(key) ?? 0) + 1);
  goalHistogram[Math.min(11, result.homeScore + result.awayScore)]++;
}

const pct = (n: number) => ((n / MATCHES) * 100).toFixed(1) + '%';
const per = (n: number) => (n / MATCHES).toFixed(2);

console.log('\n--- Over ' + MATCHES + ' matches ---');
console.log(`goals per match      ${per(homeGoals + awayGoals)}   (real: ~2.70)`);
console.log(`  home               ${per(homeGoals)}   (real: ~1.50)`);
console.log(`  away               ${per(awayGoals)}   (real: ~1.20)`);
console.log(`home wins            ${pct(homeWins)}  (real: ~44%)`);
console.log(`draws                ${pct(draws)}  (real: ~25%)`);
console.log(`away wins            ${pct(awayWins)}  (real: ~31%)`);
console.log(`shots per match      ${per(shots)}  (real: ~24)`);
console.log(`on target per match  ${per(onTarget)}  (real: ~8.4)`);
console.log(`xG per match         ${per(xgTotal)}  (real: ~2.70)`);
console.log(`yellows per match    ${per(yellows)}  (real: ~3.7)`);
console.log(`reds per match       ${per(reds)}  (real: ~0.12)`);

console.log('\nMost common scorelines:');
[...scoreCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .forEach(([k, v]) => console.log(`  ${k.padEnd(5)} ${pct(v)}`));

console.log('\nTotal goals distribution:');
goalHistogram.forEach((n, i) => {
  if (n === 0) return;
  console.log(`  ${String(i).padStart(2)} ${'█'.repeat(Math.round((n / MATCHES) * 120))} ${pct(n)}`);
});

// --- Does quality actually win? --------------------------------------------
// Comparing a single pair is misleading: a lopsided draft with an elite defence and a poor
// midfield rates low overall but is still awkward to beat. Averaging the top five against
// the bottom five measures what we actually care about — does a better squad win more.
const sorted = [...teams].sort((a, b) => b.resolved.attributes.overall - a.resolved.attributes.overall);
const strongSide = sorted.slice(0, 5);
const weakSide = sorted.slice(-5);
const best = sorted[0];
const worst = sorted[sorted.length - 1];

let bestWins = 0;
let worstWins = 0;
let ties = 0;
const HEAD_TO_HEAD = 2000;
for (let i = 0; i < HEAD_TO_HEAD; i++) {
  const strong = strongSide[i % strongSide.length];
  const weak = weakSide[(i * 3) % weakSide.length];
  // Alternate home advantage so it cancels out.
  const strongHome = i % 2 === 0;
  const result = simulateMatch(
    strongHome ? strong.resolved : weak.resolved,
    strongHome ? weak.resolved : strong.resolved,
    { seed: `h2h:${i}`, homeName: 'A', awayName: 'B', homeAdvantage: 1, knockout: false },
  );
  const strongScore = strongHome ? result.homeScore : result.awayScore;
  const weakScore = strongHome ? result.awayScore : result.homeScore;
  if (strongScore > weakScore) bestWins++;
  else if (strongScore < weakScore) worstWins++;
  else ties++;
}
const strongMean = (strongSide.reduce((a, t) => a + t.resolved.attributes.overall, 0) / 5).toFixed(1);
const weakMean = (weakSide.reduce((a, t) => a + t.resolved.attributes.overall, 0) / 5).toFixed(1);
console.log(`\nTop five (${strongMean} avg) v bottom five (${weakMean} avg) over ${HEAD_TO_HEAD} matches:`);
console.log(`  strong wins ${((bestWins / HEAD_TO_HEAD) * 100).toFixed(1)}%`);
console.log(`  draws       ${((ties / HEAD_TO_HEAD) * 100).toFixed(1)}%`);
console.log(`  upsets      ${((worstWins / HEAD_TO_HEAD) * 100).toFixed(1)}%`);
console.log('  (upsets should be possible but clearly the minority)');

console.log('\nAttribute spread (best vs worst):');
for (const t of [best, worst]) {
  const a = t.resolved.attributes;
  console.log(
    `  ${t.name.padEnd(22)} ovr ${a.overall} att ${a.attack.toFixed(1)} mid ${a.midfield.toFixed(1)} def ${a.defence.toFixed(1)} gk ${a.goalkeeper.toFixed(1)} style ${t.resolved.style}`,
  );
}
