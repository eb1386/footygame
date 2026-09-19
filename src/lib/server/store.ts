/**
 * Server-authoritative room state.
 *
 * Rooms live in Postgres when DATABASE_URL (or POSTGRES_URL) is set, which is what makes
 * multiplayer work across serverless instances and survive restarts. Without one we fall
 * back to an in-process map so `npm run dev` works with zero setup — single process only,
 * which is fine locally and clearly flagged in the UI.
 */

import type { CompetitionState } from '../core/competition';
import type { DraftState } from '../core/draft';
import type { CompetitionMode } from '../core/types';

export interface RoomSettings {
  mode: CompetitionMode;
  seasonLabel: string;
  maxHumans: number;
  rerolls: number;
  draftTimerSeconds: number | null;
  allowDuplicatePlayers: boolean;
  allowDuplicateSquads: boolean;
  revealOpponentSquads: boolean;
  aiDifficulty: 'casual' | 'normal' | 'ruthless';
  simulationSpeed: 'live' | 'fast' | 'instant' | 'skip';
  homeAdvantage: number;
  includeHistoricalSquads: boolean;
  isPrivate: boolean;
  seed: string;
}

export interface RoomMember {
  id: string;
  deviceId: string;
  name: string;
  avatar: string;
  isHost: boolean;
  joinedAt: number;
  lastSeen: number;
  draft: DraftState | null;
  style: string;
  ready: boolean;
}

export type RoomPhase = 'lobby' | 'drafting' | 'running' | 'complete';

export interface Room {
  code: string;
  createdAt: number;
  updatedAt: number;
  phase: RoomPhase;
  settings: RoomSettings;
  members: RoomMember[];
  competition: CompetitionState | null;
  /** How far the season playback has been revealed. Advanced by the host's client. */
  revealedMatchday: number;
  version: number;
}

export interface Store {
  kind: 'postgres' | 'memory';
  init(): Promise<void>;
  get(code: string): Promise<Room | null>;
  put(room: Room): Promise<void>;
  /** Read-modify-write with optimistic retry so concurrent joins don't clobber each other. */
  update(code: string, fn: (room: Room) => Room | Promise<Room>): Promise<Room>;
  listRecent(limit: number): Promise<Room[]>;
  listForDevice(deviceId: string, limit: number): Promise<Room[]>;
  saveHistory(entry: HistoryEntry): Promise<void>;
  listHistory(deviceId: string, limit: number): Promise<HistoryEntry[]>;
}

export interface HistoryEntry {
  id: string;
  roomCode: string;
  mode: CompetitionMode;
  seasonLabel: string;
  completedAt: number;
  championName: string;
  championOwner: string | null;
  runnerUpName: string | null;
  /** Device ids of everyone who took part, so each friend group sees its own trophy room. */
  participants: string[];
  summary: {
    entries: { name: string; owner: string | null; avatar: string | null; position: number; points: number; goalsFor: number; goalsAgainst: number }[];
    topScorer: { name: string; goals: number } | null;
    biggestWin: string | null;
    bestAttack: string | null;
    bestDefence: string | null;
  };
  achievements: { deviceId: string; achievementId: string }[];
}

// ---------------------------------------------------------------------------
// Memory store
// ---------------------------------------------------------------------------

const g = globalThis as unknown as {
  __golazoRooms?: Map<string, Room>;
  __golazoHistory?: HistoryEntry[];
};

function memoryStore(): Store {
  g.__golazoRooms ??= new Map();
  g.__golazoHistory ??= [];
  const rooms = g.__golazoRooms;
  const history = g.__golazoHistory;

  return {
    kind: 'memory',
    async init() {},
    async get(code) {
      return rooms.get(code) ?? null;
    },
    async put(room) {
      rooms.set(room.code, room);
    },
    async update(code, fn) {
      const current = rooms.get(code);
      if (!current) throw new RoomNotFound(code);
      const next = await fn(structuredClone(current));
      next.updatedAt = Date.now();
      next.version = current.version + 1;
      rooms.set(code, next);
      return next;
    },
    async listRecent(limit) {
      return [...rooms.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
    },
    async listForDevice(deviceId, limit) {
      return [...rooms.values()]
        .filter((r) => r.members.some((m) => m.deviceId === deviceId))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
    },
    async saveHistory(entry) {
      history.unshift(entry);
    },
    async listHistory(deviceId, limit) {
      return history.filter((h) => h.participants.includes(deviceId)).slice(0, limit);
    },
  };
}

// ---------------------------------------------------------------------------
// Postgres store
// ---------------------------------------------------------------------------

export class RoomNotFound extends Error {
  constructor(code: string) {
    super(`Room ${code} not found`);
    this.name = 'RoomNotFound';
  }
}

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  '';

async function postgresStore(): Promise<Store> {
  const { default: postgres } = await import('postgres');
  const sql = postgres(CONNECTION_STRING, {
    max: 3,
    idle_timeout: 20,
    ssl: CONNECTION_STRING.includes('localhost') ? false : 'require',
    // Serverless-friendly: never hold a transaction open between requests.
    prepare: false,
  });

  const init = async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL
      )`;
    await sql`CREATE INDEX IF NOT EXISTS rooms_updated_at_idx ON rooms (updated_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS competition_history (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        completed_at BIGINT NOT NULL,
        participants TEXT[] NOT NULL,
        data JSONB NOT NULL
      )`;
    await sql`CREATE INDEX IF NOT EXISTS history_completed_idx ON competition_history (completed_at DESC)`;
  };

  let ready: Promise<void> | null = null;
  const ensure = () => (ready ??= init());

  const rowToRoom = (row: { data: Room; version: number }): Room => ({ ...row.data, version: row.version });

  return {
    kind: 'postgres',
    init: ensure,
    async get(code) {
      await ensure();
      const rows = await sql<{ data: Room; version: number }[]>`
        SELECT data, version FROM rooms WHERE code = ${code}`;
      return rows.length ? rowToRoom(rows[0]) : null;
    },
    async put(room) {
      await ensure();
      await sql`
        INSERT INTO rooms (code, created_at, updated_at, version, data)
        VALUES (${room.code}, ${room.createdAt}, ${room.updatedAt}, ${room.version}, ${sql.json(room as never)})
        ON CONFLICT (code) DO UPDATE
          SET updated_at = EXCLUDED.updated_at, version = EXCLUDED.version, data = EXCLUDED.data`;
    },
    async update(code, fn) {
      await ensure();
      // Optimistic concurrency: only write when the version we read is still current.
      for (let attempt = 0; attempt < 6; attempt++) {
        const rows = await sql<{ data: Room; version: number }[]>`
          SELECT data, version FROM rooms WHERE code = ${code}`;
        if (!rows.length) throw new RoomNotFound(code);
        const current = rowToRoom(rows[0]);
        const next = await fn(structuredClone(current));
        next.updatedAt = Date.now();
        next.version = current.version + 1;
        const written = await sql`
          UPDATE rooms
             SET updated_at = ${next.updatedAt}, version = ${next.version}, data = ${sql.json(next as never)}
           WHERE code = ${code} AND version = ${current.version}
          RETURNING code`;
        if (written.length) return next;
        await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
      }
      throw new Error('Room is busy, please retry');
    },
    async listRecent(limit) {
      await ensure();
      const rows = await sql<{ data: Room; version: number }[]>`
        SELECT data, version FROM rooms ORDER BY updated_at DESC LIMIT ${limit}`;
      return rows.map(rowToRoom);
    },
    async listForDevice(deviceId, limit) {
      await ensure();
      const rows = await sql<{ data: Room; version: number }[]>`
        SELECT data, version FROM rooms
         WHERE data -> 'members' @> ${sql.json([{ deviceId }] as never)}
         ORDER BY updated_at DESC LIMIT ${limit}`;
      return rows.map(rowToRoom);
    },
    async saveHistory(entry) {
      await ensure();
      await sql`
        INSERT INTO competition_history (id, room_code, completed_at, participants, data)
        VALUES (${entry.id}, ${entry.roomCode}, ${entry.completedAt}, ${entry.participants}, ${sql.json(entry as never)})
        ON CONFLICT (id) DO NOTHING`;
    },
    async listHistory(deviceId, limit) {
      await ensure();
      const rows = await sql<{ data: HistoryEntry }[]>`
        SELECT data FROM competition_history
         WHERE ${deviceId} = ANY (participants)
         ORDER BY completed_at DESC LIMIT ${limit}`;
      return rows.map((r) => r.data);
    },
  };
}

let storePromise: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  storePromise ??= CONNECTION_STRING ? postgresStore() : Promise.resolve(memoryStore());
  return storePromise;
}

export function storageKind(): 'postgres' | 'memory' {
  return CONNECTION_STRING ? 'postgres' : 'memory';
}
