/**
 * Dataset access.
 *
 * The football data is read-only and ships as JSON produced by the ingestion pipeline.
 * It is loaded once per process and indexed for the queries the game actually makes.
 * Nothing in here knows anything about rooms, drafts or matches — swapping the dataset
 * for a bigger one means replacing data/dist and nothing else.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CompetitionMode, Era, PlayerSeason, Squad, Team } from '../core/types';

interface Dataset {
  players: PlayerSeason[];
  squads: (Squad & { competitionIds: string[] })[];
  teams: Team[];
  competitions: { id: string; name: string; squadCount: number }[];
  manifest: {
    generatedAt: string;
    counts: { teams: number; squads: number; players: number; competitions: number };
    sources: { name: string; url: string; licence: string; covers: string }[];
  };
  playersById: Map<string, PlayerSeason>;
  squadsById: Map<string, Squad & { competitionIds: string[] }>;
  teamsById: Map<string, Team>;
  squadsByCompetition: Map<string, (Squad & { competitionIds: string[] })[]>;
}

let cache: Dataset | null = null;

// Paths are written out literally so the bundler traces exactly these files into the
// deployment rather than tracing the whole project.
const DIST = path.join(process.cwd(), 'data', 'dist');

function readJson<T>(file: string): T {
  const full = path.join(DIST, file);
  if (!fs.existsSync(full)) {
    throw new Error(`Dataset file missing: ${file}. Run "npm run ingest:build".`);
  }
  return JSON.parse(fs.readFileSync(full, 'utf8')) as T;
}

export function dataset(): Dataset {
  if (cache) return cache;
  const players = readJson<PlayerSeason[]>('players.json');
  const squads = readJson<(Squad & { competitionIds: string[] })[]>('squads.json');
  const teams = readJson<Team[]>('teams.json');
  const competitions = readJson<Dataset['competitions']>('competitions.json');
  const manifest = readJson<Dataset['manifest']>('manifest.json');

  const squadsByCompetition = new Map<string, (Squad & { competitionIds: string[] })[]>();
  for (const squad of squads) {
    for (const comp of squad.competitionIds?.length ? squad.competitionIds : [squad.competitionId]) {
      if (!squadsByCompetition.has(comp)) squadsByCompetition.set(comp, []);
      squadsByCompetition.get(comp)!.push(squad);
    }
  }

  cache = {
    players,
    squads,
    teams,
    competitions,
    manifest,
    playersById: new Map(players.map((p) => [p.id, p])),
    squadsById: new Map(squads.map((s) => [s.id, s])),
    teamsById: new Map(teams.map((t) => [t.id, t])),
    squadsByCompetition,
  };
  return cache;
}

// ---------------------------------------------------------------------------
// Competition configuration
// ---------------------------------------------------------------------------

export interface CompetitionOption {
  mode: CompetitionMode;
  name: string;
  tagline: string;
  teamCount: number;
  seasonLabel: string;
  /** How the draft pool is selected for this competition. */
  poolCompetitionId: string;
  poolYear?: number;
  accent: string;
}

export const COMPETITIONS: CompetitionOption[] = [
  {
    mode: 'premier-league',
    name: 'PREMIER LEAGUE',
    tagline: '20 clubs. 38 matchdays. One trophy.',
    teamCount: 20,
    seasonLabel: '2025/26',
    poolCompetitionId: 'premier-league',
    accent: '#00ff87',
  },
  {
    mode: 'la-liga',
    name: 'LA LIGA',
    tagline: '20 clubs. Head-to-head decides it.',
    teamCount: 20,
    seasonLabel: '2025/26',
    poolCompetitionId: 'la-liga',
    accent: '#ff4b44',
  },
  {
    mode: 'champions-league',
    name: 'CHAMPIONS LEAGUE',
    tagline: '36 clubs. League phase, then the bracket.',
    teamCount: 36,
    seasonLabel: '2025/26',
    poolCompetitionId: 'champions-league',
    accent: '#2f7bff',
  },
  {
    mode: 'world-cup',
    name: 'WORLD CUP',
    tagline: '48 nations. Groups, then knockout.',
    teamCount: 48,
    seasonLabel: '2026',
    poolCompetitionId: 'world-cup',
    poolYear: 2026,
    accent: '#ffd12e',
  },
];

export function competitionOption(mode: CompetitionMode): CompetitionOption {
  const c = COMPETITIONS.find((x) => x.mode === mode);
  if (!c) throw new Error('Unknown competition: ' + mode);
  return c;
}

/**
 * The squads a competition's teams are drawn from, and the squads the draft may offer.
 * Both are the same pool: you draft players from the clubs that are actually in the
 * competition you are playing.
 */
export function competitionSquads(mode: CompetitionMode): Squad[] {
  const option = competitionOption(mode);
  const ds = dataset();
  const all = ds.squadsByCompetition.get(option.poolCompetitionId) ?? [];
  const filtered = option.poolYear ? all.filter((s) => s.year === option.poolYear) : all;
  return [...filtered].sort((a, b) => b.strength - a.strength);
}

/**
 * The draft pool. Wider than the competition field on purpose — drafting is more fun when
 * legendary historical squads can spin up alongside the current season's clubs.
 */
export function draftPool(mode: CompetitionMode, includeHistory = true): Squad[] {
  const ds = dataset();
  const base = competitionSquads(mode);
  if (!includeHistory) return base;

  if (mode === 'world-cup') {
    // Every World Cup squad ever recorded, so a 1970 Brazil can appear next to 2026 France.
    const all = ds.squadsByCompetition.get('world-cup') ?? [];
    const euros = ds.squadsByCompetition.get('euros') ?? [];
    const copa = ds.squadsByCompetition.get('copa-america') ?? [];
    return [...all, ...euros, ...copa].filter((s) => s.playerIds.length >= 14);
  }
  // Club competitions draft from the clubs in that competition plus the wider club pool.
  const clubs = ds.squadsByCompetition.get('clubs') ?? [];
  const history = ds.squadsByCompetition.get('club-history') ?? [];
  const seen = new Set(base.map((s) => s.id));
  return [...base, ...[...clubs, ...history].filter((s) => !seen.has(s.id))].filter(
    (s) => s.playerIds.length >= 14,
  );
}

// ---------------------------------------------------------------------------
// Album queries
// ---------------------------------------------------------------------------

export interface AlbumFilters {
  competitionId?: string;
  era?: Era;
  country?: string;
  kind?: 'club' | 'nation';
  search?: string;
  year?: number;
}

export function browseSquads(filters: AlbumFilters, limit = 120, offset = 0) {
  const ds = dataset();
  const search = filters.search?.trim().toLowerCase();
  let list = filters.competitionId
    ? ds.squadsByCompetition.get(filters.competitionId) ?? []
    : ds.squads;

  list = list.filter((s) => {
    if (filters.era && s.era !== filters.era) return false;
    if (filters.kind && s.kind !== filters.kind) return false;
    if (filters.year && s.year !== filters.year) return false;
    if (filters.country && s.country !== filters.country) return false;
    if (search && !`${s.teamName} ${s.season}`.toLowerCase().includes(search)) return false;
    return true;
  });

  const sorted = [...list].sort((a, b) => b.year - a.year || b.strength - a.strength);
  return { total: sorted.length, items: sorted.slice(offset, offset + limit) };
}

export function searchPlayers(query: string, limit = 60) {
  const ds = dataset();
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: (PlayerSeason & { squad: Squad })[] = [];
  for (const p of ds.players) {
    if (!p.name.toLowerCase().includes(q)) continue;
    const squad = ds.squadsById.get(p.squadId);
    if (!squad) continue;
    out.push({ ...p, squad });
    if (out.length >= limit * 4) break;
  }
  return out.sort((a, b) => b.overall - a.overall).slice(0, limit);
}

export function squadWithPlayers(squadId: string) {
  const ds = dataset();
  const squad = ds.squadsById.get(squadId);
  if (!squad) return null;
  const players = squad.playerIds
    .map((id) => ds.playersById.get(id))
    .filter(Boolean) as PlayerSeason[];
  return { squad, players };
}

export function albumFacets() {
  const ds = dataset();
  const eras = new Map<string, number>();
  const countries = new Map<string, number>();
  const years = new Map<number, number>();
  for (const s of ds.squads) {
    eras.set(s.era, (eras.get(s.era) ?? 0) + 1);
    if (s.country) countries.set(s.country, (countries.get(s.country) ?? 0) + 1);
    years.set(s.year, (years.get(s.year) ?? 0) + 1);
  }
  return {
    competitions: ds.competitions,
    eras: [...eras.entries()].map(([id, count]) => ({ id, count })),
    countries: [...countries.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 80),
    years: [...years.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.id - a.id),
  };
}
