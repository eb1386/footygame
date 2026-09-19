// Sanity check: what does a real generated season actually look like?
import { buildCompetition, standingsAfter } from '../src/lib/core/competition.ts';
import { runAiDraft, toSelection } from '../src/lib/core/draft.ts';
import { competitionSquads, dataset, draftPool } from '../src/lib/data/dataset.ts';

const ds = dataset();
const deps = { playersById: ds.playersById, squadsById: ds.squadsById };
const mode = (process.argv[2] || 'premier-league') as 'premier-league' | 'champions-league' | 'world-cup' | 'la-liga';
const field = competitionSquads(mode);
const count = { 'premier-league': 20, 'la-liga': 20, 'champions-league': 36, 'world-cup': 48 }[mode];

const entries = field.slice(0, count).map((squad, i) => {
  const draft = runAiDraft(
    { seed: `s-${i}`, squadPool: draftPool(mode, true), rerolls: 5, allowDuplicatePlayers: false, allowDuplicateSquads: false },
    deps,
    'normal',
  );
  return {
    id: 'e' + i, teamName: squad.teamName, teamCode: squad.teamCode, badge: '',
    colors: { primary: '#000', secondary: '#fff', text: '#fff' },
    ownerId: null, ownerName: null, avatar: null,
    selection: toSelection(draft, draft.style), strength: squad.strength,
  };
});

const t0 = Date.now();
const state = buildCompetition({ mode, seasonLabel: 'x', seed: 'season-check', entries, playersById: ds.playersById });
console.log(`${mode}: generated in ${Date.now() - t0}ms — ${state.fixtures.length} fixtures, ${state.totalMatchdays} matchdays`);

const results = Object.values(state.results);
const goals = results.reduce((a, r) => a + r.homeScore + r.awayScore, 0);
console.log(`avg goals/match ${(goals / results.length).toFixed(2)}`);

if (mode === 'premier-league' || mode === 'la-liga') {
  const table = standingsAfter(state, 38);
  console.log('\nFinal table (top 6 and bottom 3):');
  for (const row of [...table.slice(0, 6), ...table.slice(-3)]) {
    const e = state.entries.find((x) => x.id === row.entryId)!;
    console.log(
      `  ${String(row.position).padStart(2)} ${e.teamName.padEnd(24)} ${row.played} ${String(row.won).padStart(2)}-${row.drawn}-${row.lost}  ${String(row.goalsFor).padStart(2)}:${String(row.goalsAgainst).padStart(2)}  ${String(row.points).padStart(2)} pts`,
    );
  }
  console.log(`champion points: ${table[0].points} (real Premier League winners: 85-95)`);
} else {
  const champ = state.entries.find((e) => e.id === state.championEntryId);
  const runner = state.entries.find((e) => e.id === state.runnerUpEntryId);
  console.log(`champion: ${champ?.teamName}, runner-up: ${runner?.teamName}`);
  const stages = [...new Set(state.fixtures.map((f) => f.stage))];
  for (const s of stages) console.log(`  ${s}: ${state.fixtures.filter((f) => f.stage === s).length} matches`);
}
