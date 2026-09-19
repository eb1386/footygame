import assert from 'node:assert/strict';
import test from 'node:test';

import { generateLeagueFixtures, generateGroupFixtures, buildTable } from '../src/lib/core/schedule.ts';
import { createRng, hashSeed } from '../src/lib/core/rng.ts';
import { FORMATIONS, eligibleSlots, getFormation, slotFit } from '../src/lib/core/formations.ts';
import { simulateMatch } from '../src/lib/core/match.ts';
import { resolveTeam } from '../src/lib/core/team.ts';
import { createDraft, applyPick, applyReroll, runAiDraft, toSelection } from '../src/lib/core/draft.ts';
import { buildCompetition } from '../src/lib/core/competition.ts';
import { championsLeagueQualification, worldCupQualifiers } from '../src/lib/core/knockout.ts';
import { competitionSquads, dataset, draftPool } from '../src/lib/data/dataset.ts';
import type { CompetitionEntry } from '../src/lib/core/competition.ts';

const ds = dataset();
const deps = { playersById: ds.playersById, squadsById: ds.squadsById };

// ---------------------------------------------------------------------------
test('rng is deterministic and seed-sensitive', () => {
  const a = createRng('abc');
  const b = createRng('abc');
  const c = createRng('abd');
  const seqA = Array.from({ length: 20 }, () => a.next());
  const seqB = Array.from({ length: 20 }, () => b.next());
  const seqC = Array.from({ length: 20 }, () => c.next());
  assert.deepEqual(seqA, seqB, 'same seed must produce the same stream');
  assert.notDeepEqual(seqA, seqC, 'different seeds must diverge');
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
});

test('rng stays within bounds', () => {
  const r = createRng('bounds');
  for (let i = 0; i < 2000; i++) {
    const n = r.next();
    assert.ok(n >= 0 && n < 1);
    const i2 = r.int(3, 7);
    assert.ok(i2 >= 3 && i2 <= 7);
    const b = r.beta(1.3, 4.7);
    assert.ok(b >= 0 && b <= 1);
  }
});

// ---------------------------------------------------------------------------
test('league fixtures: every pair meets home and away, exactly once', () => {
  const teams = Array.from({ length: 20 }, (_, i) => `t${i}`);
  const fixtures = generateLeagueFixtures(teams, 'seed-1');

  assert.equal(fixtures.length, 20 * 19, 'a 20 team double round robin is 380 matches');
  assert.equal(Math.max(...fixtures.map((f) => f.matchday)), 38);

  const seen = new Set<string>();
  for (const f of fixtures) {
    const key = `${f.homeEntryId}v${f.awayEntryId}`;
    assert.ok(!seen.has(key), `duplicate fixture ${key}`);
    assert.notEqual(f.homeEntryId, f.awayEntryId, 'a team cannot play itself');
    seen.add(key);
  }
  for (const a of teams) {
    for (const b of teams) {
      if (a === b) continue;
      assert.ok(seen.has(`${a}v${b}`), `missing fixture ${a} v ${b}`);
    }
  }
});

test('league fixtures: no team plays twice on the same matchday', () => {
  const teams = Array.from({ length: 20 }, (_, i) => `t${i}`);
  const fixtures = generateLeagueFixtures(teams, 'seed-2');
  const perDay = new Map<number, Set<string>>();
  for (const f of fixtures) {
    if (!perDay.has(f.matchday)) perDay.set(f.matchday, new Set());
    const set = perDay.get(f.matchday)!;
    assert.ok(!set.has(f.homeEntryId), `${f.homeEntryId} plays twice on matchday ${f.matchday}`);
    assert.ok(!set.has(f.awayEntryId), `${f.awayEntryId} plays twice on matchday ${f.matchday}`);
    set.add(f.homeEntryId);
    set.add(f.awayEntryId);
  }
  for (const [, set] of perDay) assert.equal(set.size, 20, 'every team plays every matchday');
});

test('league fixtures: home and away games are balanced', () => {
  const teams = Array.from({ length: 20 }, (_, i) => `t${i}`);
  const fixtures = generateLeagueFixtures(teams, 'seed-3');
  const home = new Map<string, number>();
  for (const f of fixtures) home.set(f.homeEntryId, (home.get(f.homeEntryId) ?? 0) + 1);
  for (const t of teams) assert.equal(home.get(t), 19, `${t} should host 19 matches`);
});

test('odd team counts still produce a valid schedule', () => {
  const teams = Array.from({ length: 11 }, (_, i) => `t${i}`);
  const fixtures = generateLeagueFixtures(teams, 'odd');
  assert.equal(fixtures.length, 11 * 10);
  const perDay = new Map<number, Set<string>>();
  for (const f of fixtures) {
    if (!perDay.has(f.matchday)) perDay.set(f.matchday, new Set());
    const set = perDay.get(f.matchday)!;
    assert.ok(!set.has(f.homeEntryId) && !set.has(f.awayEntryId));
    set.add(f.homeEntryId);
    set.add(f.awayEntryId);
  }
});

test('group fixtures: single round robin per group', () => {
  const groups = [
    { id: 'g1', entryIds: ['a', 'b', 'c', 'd'] },
    { id: 'g2', entryIds: ['e', 'f', 'g', 'h'] },
  ];
  const fixtures = generateGroupFixtures(groups, 'wc');
  assert.equal(fixtures.length, 12, 'two groups of four is six matches each');
  assert.equal(Math.max(...fixtures.map((f) => f.matchday)), 3);
  for (const f of fixtures) {
    const group = groups.find((g) => g.id === f.groupId)!;
    assert.ok(group.entryIds.includes(f.homeEntryId) && group.entryIds.includes(f.awayEntryId));
  }
});

// ---------------------------------------------------------------------------
test('table: points, goal difference and ordering', () => {
  const table = buildTable(
    ['a', 'b', 'c'],
    [
      { homeEntryId: 'a', awayEntryId: 'b', homeScore: 3, awayScore: 0 },
      { homeEntryId: 'b', awayEntryId: 'c', homeScore: 1, awayScore: 1 },
      { homeEntryId: 'c', awayEntryId: 'a', homeScore: 2, awayScore: 2 },
    ],
  );
  const a = table.find((r) => r.entryId === 'a')!;
  assert.equal(a.points, 4, '3 for the win plus 1 for the draw');
  assert.equal(a.goalsFor, 5);
  assert.equal(a.goalsAgainst, 2);
  assert.equal(a.goalDifference, 3);
  assert.equal(table[0].entryId, 'a');
  assert.deepEqual(table.map((r) => r.position), [1, 2, 3]);
});

test('table: goal difference separates level teams', () => {
  const table = buildTable(
    ['a', 'b', 'c'],
    [
      { homeEntryId: 'a', awayEntryId: 'c', homeScore: 5, awayScore: 0 },
      { homeEntryId: 'b', awayEntryId: 'c', homeScore: 1, awayScore: 0 },
    ],
  );
  assert.equal(table[0].entryId, 'a', 'better goal difference ranks first on equal points');
});

test('table: La Liga head-to-head tiebreak beats goal difference', () => {
  // a and b finish level on points. b won the head-to-head; a has the better goal difference.
  const results = [
    { homeEntryId: 'b', awayEntryId: 'a', homeScore: 2, awayScore: 0 },
    { homeEntryId: 'a', awayEntryId: 'b', homeScore: 1, awayScore: 0 },
    { homeEntryId: 'a', awayEntryId: 'c', homeScore: 6, awayScore: 0 },
    { homeEntryId: 'c', awayEntryId: 'a', homeScore: 0, awayScore: 1 },
    { homeEntryId: 'b', awayEntryId: 'c', homeScore: 1, awayScore: 0 },
    { homeEntryId: 'c', awayEntryId: 'b', homeScore: 0, awayScore: 1 },
  ];
  const h2h = buildTable(['a', 'b', 'c'], results, { tiebreak: 'head-to-head' });
  const gd = buildTable(['a', 'b', 'c'], results, { tiebreak: 'goal-difference' });

  const aRow = h2h.find((r) => r.entryId === 'a')!;
  const bRow = h2h.find((r) => r.entryId === 'b')!;
  assert.equal(aRow.points, bRow.points, 'the fixtures should leave a and b level on points');
  assert.ok(aRow.goalDifference > bRow.goalDifference, 'a should have the better goal difference');

  assert.equal(h2h[0].entryId, 'b', 'La Liga separates level teams on the head-to-head record');
  assert.equal(gd[0].entryId, 'a', 'the Premier League separates them on goal difference');
});

// ---------------------------------------------------------------------------
test('formations: every shape has eleven slots and exactly one keeper', () => {
  for (const f of FORMATIONS) {
    assert.equal(f.slots.length, 11, `${f.id} must field eleven`);
    assert.equal(f.slots.filter((s) => s.position === 'GK').length, 1, `${f.id} needs one keeper`);
    const ids = new Set(f.slots.map((s) => s.id));
    assert.equal(ids.size, 11, `${f.id} has duplicate slot ids`);
  }
});

test('positions: a centre-back can never be put at striker, and only keepers keep goal', () => {
  const formation = getFormation('4-3-3');
  const striker = formation.slots.find((s) => s.position === 'ST')!;
  const keeperSlot = formation.slots.find((s) => s.position === 'GK')!;
  assert.equal(slotFit(striker, 'CB', []), 0, 'CB at ST must be illegal');
  assert.equal(slotFit(keeperSlot, 'CB', []), 0, 'outfielders cannot keep goal');
  assert.equal(slotFit(keeperSlot, 'GK', []), 1);
  assert.ok(slotFit(striker, 'RW', []) > 0, 'a winger can lead the line');
  // A declared secondary position is respected.
  assert.ok(slotFit(striker, 'CM', ['ST']) > 0.9, 'a listed secondary position fits well');
});

test('eligibleSlots never offers a filled slot', () => {
  const formation = getFormation('4-2-3-1');
  const taken = new Set(['gk', 'rb']);
  const slots = eligibleSlots(formation, 'RB', ['CB'], taken);
  assert.ok(!slots.some((s) => taken.has(s.slot.id)));
});

// ---------------------------------------------------------------------------
test('draft: produces a legal eleven and respects rerolls', () => {
  const options = {
    seed: 'draft-test',
    squadPool: draftPool('premier-league', true),
    rerolls: 5,
    allowDuplicatePlayers: false,
    allowDuplicateSquads: false,
  };
  let state = createDraft(options, deps);
  assert.ok(state.currentOffer, 'a squad should be on offer immediately');
  assert.equal(state.rerollsLeft, 5);

  state = applyReroll(state, options, deps);
  assert.equal(state.rerollsLeft, 4, 'a reroll is spent');

  let guard = 0;
  while (!state.complete && state.currentOffer && guard++ < 30) {
    const first = state.currentOffer.players[0];
    state = applyPick(state, first.playerId, first.eligibleSlotIds[0], options, deps);
  }

  assert.ok(state.complete, 'the draft should complete');
  const formation = getFormation(state.formationId);
  assert.equal(Object.keys(state.picks).length, 11, 'eleven slots filled');

  for (const slot of formation.slots) {
    const playerId = state.picks[slot.id];
    assert.ok(playerId, `slot ${slot.id} must be filled`);
    const player = ds.playersById.get(playerId)!;
    assert.ok(
      slotFit(slot, player.position, player.secondary) > 0,
      `${player.name} (${player.position}) is not allowed at ${slot.position}`,
    );
  }

  const ids = Object.values(state.picks);
  assert.equal(new Set(ids).size, 11, 'no duplicate players when duplicates are disabled');
});

test('draft: rejects an illegal pick', () => {
  const options = {
    seed: 'draft-illegal',
    squadPool: draftPool('premier-league', true),
    rerolls: 5,
    allowDuplicatePlayers: false,
    allowDuplicateSquads: false,
  };
  const state = createDraft(options, deps);
  const offer = state.currentOffer!;
  const entry = offer.players[0];
  const badSlot = getFormation(state.formationId)
    .slots.map((s) => s.id)
    .find((id) => !entry.eligibleSlotIds.includes(id))!;
  assert.throws(() => applyPick(state, entry.playerId, badSlot, options, deps), /cannot play there/);
  assert.throws(() => applyPick(state, 'not-a-player', null, options, deps), /not in the squad/);
});

test('draft: the same seed produces the same draft', () => {
  const options = {
    seed: 'repeatable',
    squadPool: draftPool('la-liga', true),
    rerolls: 5,
    allowDuplicatePlayers: false,
    allowDuplicateSquads: false,
  };
  const a = runAiDraft(options, deps, 'normal');
  const b = runAiDraft(options, deps, 'normal');
  assert.deepEqual(a.picks, b.picks);
  assert.equal(a.formationId, b.formationId);
});

test('AI draft: fills a legal eleven at every difficulty', () => {
  for (const difficulty of ['casual', 'normal', 'ruthless'] as const) {
    const state = runAiDraft(
      {
        seed: 'ai-' + difficulty,
        squadPool: draftPool('champions-league', true),
        rerolls: 5,
        allowDuplicatePlayers: false,
        allowDuplicateSquads: false,
      },
      deps,
      difficulty,
    );
    assert.ok(state.complete, `${difficulty} AI should finish its draft`);
    assert.equal(Object.keys(state.picks).length, 11);
    const formation = getFormation(state.formationId);
    for (const slot of formation.slots) {
      const player = ds.playersById.get(state.picks[slot.id])!;
      assert.ok(slotFit(slot, player.position, player.secondary) > 0);
    }
  }
});

// ---------------------------------------------------------------------------
function testTeam(seed: string, mode: 'premier-league' | 'world-cup' = 'premier-league') {
  const draft = runAiDraft(
    {
      seed,
      squadPool: draftPool(mode, true),
      rerolls: 5,
      allowDuplicatePlayers: false,
      allowDuplicateSquads: false,
    },
    deps,
    'normal',
  );
  return resolveTeam(toSelection(draft, draft.style), ds.playersById);
}

test('match: the same seed replays identically', () => {
  const home = testTeam('m-home');
  const away = testTeam('m-away');
  const ctx = { seed: 'match-1', homeName: 'A', awayName: 'B', homeAdvantage: 1, knockout: false };
  const a = simulateMatch(home, away, ctx);
  const b = simulateMatch(home, away, ctx);
  assert.equal(a.homeScore, b.homeScore);
  assert.equal(a.awayScore, b.awayScore);
  assert.equal(a.events.length, b.events.length);
  assert.deepEqual(
    a.events.map((e) => [e.minute, e.type, e.playerName]),
    b.events.map((e) => [e.minute, e.type, e.playerName]),
  );
});

test('match: a different seed gives a different match', () => {
  const home = testTeam('m-home');
  const away = testTeam('m-away');
  const base = { homeName: 'A', awayName: 'B', homeAdvantage: 1, knockout: false };
  const results = Array.from({ length: 12 }, (_, i) =>
    simulateMatch(home, away, { ...base, seed: 'vary-' + i }),
  );
  const distinct = new Set(results.map((r) => `${r.homeScore}-${r.awayScore}`));
  assert.ok(distinct.size > 1, 'twelve seeds should not all give the same score');
});

test('match: events are consistent with the final score', () => {
  const home = testTeam('e-home');
  const away = testTeam('e-away');
  for (let i = 0; i < 40; i++) {
    const r = simulateMatch(home, away, {
      seed: 'events-' + i,
      homeName: 'A',
      awayName: 'B',
      homeAdvantage: 1,
      knockout: false,
    });
    const homeGoals = r.events.filter(
      (e) => (e.type === 'goal' || e.type === 'penalty-scored') && e.side === 'home',
    ).length;
    const awayGoals = r.events.filter(
      (e) => (e.type === 'goal' || e.type === 'penalty-scored') && e.side === 'away',
    ).length;
    assert.equal(homeGoals, r.homeScore, 'goal events must match the home score');
    assert.equal(awayGoals, r.awayScore, 'goal events must match the away score');

    // Events are ordered and inside the match.
    let last = -1;
    for (const e of r.events) {
      assert.ok(e.minute >= last, 'events must be in chronological order');
      assert.ok(e.minute >= 0 && e.minute <= r.duration);
      last = e.minute;
    }
    assert.ok(r.events.some((e) => e.type === 'kickoff'));
    assert.ok(r.events.some((e) => e.type === 'full-time'));
    assert.ok(r.events.some((e) => e.type === 'half-time'));
    assert.ok(r.home.shotsOnTarget <= r.home.shots, 'shots on target cannot exceed shots');
    assert.ok(r.away.shotsOnTarget <= r.away.shots);
    assert.equal(r.home.possession + r.away.possession, 100);
  }
});

test('match: knockouts always produce a winner, via extra time and penalties', () => {
  const home = testTeam('k-home');
  const away = testTeam('k-away');
  let extraTimes = 0;
  let shootouts = 0;
  for (let i = 0; i < 60; i++) {
    const r = simulateMatch(home, away, {
      seed: 'ko-' + i,
      homeName: 'A',
      awayName: 'B',
      homeAdvantage: 0,
      knockout: true,
    });
    if (!r.shootout) {
      assert.notEqual(r.homeScore, r.awayScore, 'a knockout must not finish level without a shootout');
    }
    if (r.extraTime) {
      extraTimes++;
      assert.equal(r.duration, 120);
      assert.ok(r.events.some((e) => e.type === 'extra-time'));
    }
    if (r.shootout) {
      shootouts++;
      assert.notEqual(r.shootout.home, r.shootout.away, 'a shootout must have a winner');
      assert.ok(r.shootout.kicks.length >= 2);
      assert.ok(r.events.some((e) => e.type === 'shootout-end'));
    }
  }
  assert.ok(extraTimes > 0, 'some knockouts should go to extra time');
  assert.ok(shootouts > 0, 'some should go all the way to penalties');
});

// ---------------------------------------------------------------------------
test('champions league qualification splits the league phase correctly', () => {
  const ordered = Array.from({ length: 36 }, (_, i) => `t${i + 1}`);
  const { direct, playoff, eliminated } = championsLeagueQualification(ordered);
  assert.equal(direct.length, 8, 'top eight go straight to the last sixteen');
  assert.equal(playoff.length, 16, 'nine to twenty-four contest the playoff');
  assert.equal(eliminated.length, 12, 'twenty-five and below are out');
  assert.equal(direct[0], 't1');
  assert.equal(playoff[0], 't9');
  assert.equal(eliminated[0], 't25');
});

test('world cup qualifiers take the top two plus the best third-placed sides', () => {
  const groups = Array.from({ length: 12 }, (_, g) => ({
    id: `g${g}`,
    table: [
      { entryId: `g${g}-1`, points: 9, goalDifference: 5, goalsFor: 7 },
      { entryId: `g${g}-2`, points: 6, goalDifference: 2, goalsFor: 5 },
      { entryId: `g${g}-3`, points: 3, goalDifference: -1, goalsFor: 3 + g },
      { entryId: `g${g}-4`, points: 0, goalDifference: -6, goalsFor: 1 },
    ],
  }));
  const qualified = worldCupQualifiers(groups, 8);
  assert.equal(qualified.length, 32, '24 group qualifiers plus 8 best thirds');
  assert.ok(qualified.includes('g11-3'), 'the best third-placed side qualifies');
  assert.ok(!qualified.includes('g0-3'), 'the worst third-placed side does not');
  assert.ok(!qualified.some((id) => id.endsWith('-4')));
});

// ---------------------------------------------------------------------------
function buildEntries(mode: 'premier-league' | 'champions-league' | 'world-cup', count: number): CompetitionEntry[] {
  const field = competitionSquads(mode).slice(0, count);
  return field.map((squad, i) => {
    const draft = runAiDraft(
      {
        seed: `entry-${mode}-${i}`,
        squadPool: draftPool(mode, true),
        rerolls: 5,
        allowDuplicatePlayers: false,
        allowDuplicateSquads: false,
      },
      deps,
      'normal',
    );
    return {
      id: 'e' + i,
      teamName: squad.teamName,
      teamCode: squad.teamCode,
      badge: '',
      colors: { primary: '#000', secondary: '#fff', text: '#fff' },
      ownerId: i === 0 ? 'human-1' : null,
      ownerName: i === 0 ? 'EVAN' : null,
      avatar: i === 0 ? '🔥' : null,
      selection: toSelection(draft, draft.style),
      strength: 70,
    };
  });
}

test('premier league: a full season runs and produces a champion', () => {
  const state = buildCompetition({
    mode: 'premier-league',
    seasonLabel: '2025/26',
    seed: 'pl-season',
    entries: buildEntries('premier-league', 20),
    playersById: ds.playersById,
  });
  assert.equal(state.fixtures.length, 380);
  assert.equal(Object.keys(state.results).length, 380, 'every fixture must be played');
  assert.equal(state.totalMatchdays, 38);
  assert.ok(state.championEntryId, 'a champion must be crowned');
  assert.notEqual(state.championEntryId, state.runnerUpEntryId);

  // Every team played 38 matches.
  const played = new Map<string, number>();
  for (const f of state.fixtures) {
    played.set(f.homeEntryId, (played.get(f.homeEntryId) ?? 0) + 1);
    played.set(f.awayEntryId, (played.get(f.awayEntryId) ?? 0) + 1);
  }
  for (const entry of state.entries) assert.equal(played.get(entry.id), 38);
});

test('champions league: league phase, playoff and knockout rounds all resolve', () => {
  const state = buildCompetition({
    mode: 'champions-league',
    seasonLabel: '2025/26',
    seed: 'ucl-season',
    entries: buildEntries('champions-league', 36),
    playersById: ds.playersById,
  });

  const leaguePhase = state.fixtures.filter((f) => f.stage === 'league-phase');
  assert.equal(leaguePhase.length, (36 * 8) / 2, 'every club plays eight league-phase matches');
  for (const entry of state.entries) {
    const count = leaguePhase.filter((f) => f.homeEntryId === entry.id || f.awayEntryId === entry.id).length;
    assert.equal(count, 8, `${entry.teamName} should play eight league-phase matches`);
  }

  for (const stage of ['playoff', 'round-of-16', 'quarter-final', 'semi-final', 'final'] as const) {
    assert.ok(state.fixtures.some((f) => f.stage === stage), `missing ${stage}`);
  }
  // Two-legged ties really do have two legs.
  const r16 = state.fixtures.filter((f) => f.stage === 'round-of-16');
  assert.equal(r16.length, 16, 'eight ties over two legs');
  const ties = new Map<string, number>();
  for (const f of r16) ties.set(f.tieId!, (ties.get(f.tieId!) ?? 0) + 1);
  for (const [, legs] of ties) assert.equal(legs, 2);

  const final = state.fixtures.filter((f) => f.stage === 'final');
  assert.equal(final.length, 1, 'the final is a single match');
  assert.ok(final[0].neutralVenue, 'the final is played at a neutral venue');
  assert.ok(state.championEntryId);
  assert.ok(Object.keys(state.results).length === state.fixtures.length);
});

test('world cup: groups, knockouts and a third-place play-off', () => {
  const state = buildCompetition({
    mode: 'world-cup',
    seasonLabel: '2026',
    seed: 'wc-season',
    entries: buildEntries('world-cup', 48),
    playersById: ds.playersById,
  });
  assert.equal(state.groups.length, 12, '48 nations make twelve groups of four');
  for (const g of state.groups) assert.equal(g.entryIds.length, 4);
  // No nation appears in two groups.
  const all = state.groups.flatMap((g) => g.entryIds);
  assert.equal(new Set(all).size, 48);

  for (const stage of ['group', 'round-of-32', 'round-of-16', 'quarter-final', 'semi-final', 'third-place', 'final'] as const) {
    assert.ok(state.fixtures.some((f) => f.stage === stage), `missing ${stage}`);
  }
  assert.ok(state.championEntryId);
  assert.equal(Object.keys(state.results).length, state.fixtures.length);

  // Knockout matches must never end level.
  for (const f of state.fixtures.filter((x) => x.knockout)) {
    const r = state.results[f.id];
    const decided = r.homeScore !== r.awayScore || (r.shootoutHome ?? 0) !== (r.shootoutAway ?? 0);
    assert.ok(decided, `knockout ${f.id} finished level with no shootout`);
  }
});

test('competition: the same seed regenerates the identical season', () => {
  const entries = buildEntries('premier-league', 20);
  const a = buildCompetition({
    mode: 'premier-league',
    seasonLabel: '2025/26',
    seed: 'determinism',
    entries,
    playersById: ds.playersById,
  });
  const b = buildCompetition({
    mode: 'premier-league',
    seasonLabel: '2025/26',
    seed: 'determinism',
    entries,
    playersById: ds.playersById,
  });
  assert.equal(a.championEntryId, b.championEntryId);
  for (const f of a.fixtures) {
    assert.equal(a.results[f.id].homeScore, b.results[f.id].homeScore);
    assert.equal(a.results[f.id].awayScore, b.results[f.id].awayScore);
  }
});

// ---------------------------------------------------------------------------
test('dataset: the four shipped competitions have a full field', () => {
  assert.ok(competitionSquads('premier-league').length >= 20);
  assert.ok(competitionSquads('la-liga').length >= 20);
  assert.ok(competitionSquads('champions-league').length >= 36);
  assert.ok(competitionSquads('world-cup').length >= 48);
});

test('dataset: every squad can field a legal eleven', () => {
  for (const mode of ['premier-league', 'la-liga', 'champions-league', 'world-cup'] as const) {
    for (const squad of competitionSquads(mode)) {
      const players = squad.playerIds.map((id) => ds.playersById.get(id)!).filter(Boolean);
      assert.ok(players.length >= 11, `${squad.teamName} ${squad.season} has only ${players.length} players`);
      assert.ok(
        players.some((p) => p.position === 'GK'),
        `${squad.teamName} ${squad.season} has no goalkeeper`,
      );
    }
  }
});

test('dataset: ratings are inside the published range', () => {
  for (const p of ds.players) {
    assert.ok(p.overall >= 40 && p.overall <= 99, `${p.name} has overall ${p.overall}`);
    assert.ok(p.attack >= 0 && p.attack <= 99);
    assert.ok(p.defence >= 0 && p.defence <= 99);
  }
});
