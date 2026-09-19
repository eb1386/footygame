// Ingest the current Premier League season from the official Fantasy Premier League API.
//
// Source:  https://fantasy.premierleague.com/api/bootstrap-static/  (public, unauthenticated)
// Output:  data/raw/fpl.json
//
// This is the highest-quality slice of the dataset: real squads, real shirt data, real
// birth dates, real nationality and — crucially — real per-season performance numbers,
// which feed the rating model instead of a pure fame proxy.
import { writeRaw, log } from './lib/wiki.mjs';

const ENDPOINT = 'https://fantasy.premierleague.com/api/bootstrap-static/';

// FPL exposes nationality only as an internal numeric "region" id with no public lookup
// table, so nationality is left to the Wikipedia squad lists and the Wikidata enrichment
// pass, which both carry it explicitly.

const POSITIONS = { 1: 'GK', 2: 'DF', 3: 'MF', 4: 'FW' };

async function main() {
  log('Fetching Fantasy Premier League bootstrap-static...');
  const res = await fetch(ENDPOINT, { headers: { 'User-Agent': 'ElNipGame-DataPipeline/1.0' } });
  if (!res.ok) throw new Error('FPL API returned ' + res.status);
  const data = await res.json();

  const teamsById = new Map(data.teams.map((t) => [t.id, t]));

  const teams = data.teams.map((t) => ({
    fplId: t.id,
    name: t.name,
    code: t.short_name,
    strengthHome: t.strength_overall_home,
    strengthAway: t.strength_overall_away,
  }));

  const players = data.elements
    .filter((e) => e.status !== 'u')
    .map((e) => {
      const team = teamsById.get(e.team);
      return {
        fplId: e.id,
        firstName: e.first_name,
        lastName: e.second_name,
        name: `${e.first_name} ${e.second_name}`.trim(),
        webName: e.web_name,
        knownName: e.known_name || null,
        club: team ? team.name : null,
        clubCode: team ? team.short_name : null,
        position: POSITIONS[e.element_type] || null,
        shirt: e.squad_number || null,
        birthDate: e.birth_date || null,
        nationality: null,
        joined: e.team_join_date || null,
        // Performance signals used by the rating model.
        price: e.now_cost,           // FPL price in tenths of a million: a strong market valuation
        totalPoints: e.total_points,
        pointsPerGame: Number(e.points_per_game) || 0,
        minutes: e.minutes,
        goals: e.goals_scored,
        assists: e.assists,
        cleanSheets: e.clean_sheets,
        saves: e.saves,
        goalsConceded: e.goals_conceded,
        yellowCards: e.yellow_cards,
        redCards: e.red_cards,
        selectedBy: Number(e.selected_by_percent) || 0,
        influence: Number(e.influence) || 0,
        creativity: Number(e.creativity) || 0,
        threat: Number(e.threat) || 0,
        ictIndex: Number(e.ict_index) || 0,
        expectedGoals: Number(e.expected_goals) || 0,
        expectedAssists: Number(e.expected_assists) || 0,
        expectedGoalsConceded: Number(e.expected_goals_conceded) || 0,
        starts: e.starts || 0,
      };
    });

  log(`  ${teams.length} clubs, ${players.length} players.`);
  writeRaw('fpl.json', {
    fetchedAt: new Date().toISOString(),
    source: 'fantasy.premierleague.com public API',
    season: '2025-26',
    teams,
    players,
  });
  log('Wrote data/raw/fpl.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
