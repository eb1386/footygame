/** Room lifecycle: create, join, draft, start, and the season playback state. */

import { buildCompetition, FORMATS, type CompetitionEntry, type CompetitionState } from '../core/competition';
import { applyPick, applyReroll, autoPick, createDraft, rollOffer, runAiDraft, toSelection, type DraftOptions, type DraftState } from '../core/draft';
import { createRng, randomSeedString } from '../core/rng';
import type { CompetitionMode, PlayerSeason, Squad } from '../core/types';
import { competitionOption, competitionSquads, dataset, draftPool } from '../data/dataset';
import { getStore, RoomNotFound, type Room, type RoomMember, type RoomSettings } from './store';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let out = '';
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  for (let i = 0; i < 5; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export const AVATARS = ['⚽', '🔥', '🦁', '🐉', '🦅', '🐐', '👑', '💎', '🚀', '⚡', '🎯', '🧊', '🐺', '🦈', '🌪️', '☄️'];

export function defaultSettings(mode: CompetitionMode): RoomSettings {
  const option = competitionOption(mode);
  return {
    mode,
    seasonLabel: option.seasonLabel,
    maxHumans: 16,
    rerolls: 5,
    draftTimerSeconds: null,
    allowDuplicatePlayers: false,
    allowDuplicateSquads: false,
    revealOpponentSquads: false,
    aiDifficulty: 'normal',
    simulationSpeed: 'fast',
    homeAdvantage: 1,
    includeHistoricalSquads: false,
    isPrivate: true,
    seed: randomSeedString(12),
  };
}

function draftOptions(room: Room, memberId: string): DraftOptions {
  return {
    seed: `${room.settings.seed}:${memberId}`,
    squadPool: draftPool(room.settings.mode, room.settings.includeHistoricalSquads),
    rerolls: room.settings.rerolls,
    allowDuplicatePlayers: room.settings.allowDuplicatePlayers,
    allowDuplicateSquads: room.settings.allowDuplicateSquads,
  };
}

function deps() {
  const ds = dataset();
  return { playersById: ds.playersById, squadsById: ds.squadsById };
}

// ---------------------------------------------------------------------------
// Create / join
// ---------------------------------------------------------------------------

export async function createRoom(input: {
  deviceId: string;
  name: string;
  avatar: string;
  settings: Partial<RoomSettings> & { mode: CompetitionMode };
}): Promise<Room> {
  const store = await getStore();
  const settings = { ...defaultSettings(input.settings.mode), ...input.settings };
  const now = Date.now();
  const room: Room = {
    code: generateRoomCode(),
    createdAt: now,
    updatedAt: now,
    phase: 'lobby',
    settings,
    members: [makeMember(input.deviceId, input.name, input.avatar, true)],
    competition: null,
    revealedMatchday: 0,
    version: 0,
  };
  await store.put(room);
  return room;
}

function makeMember(deviceId: string, name: string, avatar: string, isHost: boolean): RoomMember {
  return {
    id: 'm_' + deviceId.slice(0, 10) + '_' + Math.random().toString(36).slice(2, 7),
    deviceId,
    name: name.trim().slice(0, 18) || 'PLAYER',
    avatar: avatar || AVATARS[0],
    isHost,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    draft: null,
    style: 'balanced',
    ready: false,
  };
}

export async function joinRoom(code: string, input: { deviceId: string; name: string; avatar: string }): Promise<Room> {
  const store = await getStore();
  return store.update(code.toUpperCase(), (room) => {
    const existing = room.members.find((m) => m.deviceId === input.deviceId);
    if (existing) {
      // Rejoining after a refresh or on another tab keeps the same seat.
      existing.lastSeen = Date.now();
      if (input.name) existing.name = input.name.trim().slice(0, 18);
      if (input.avatar) existing.avatar = input.avatar;
      return room;
    }
    if (room.phase !== 'lobby' && room.phase !== 'drafting') {
      throw new Error('This competition has already started.');
    }
    if (room.members.length >= room.settings.maxHumans) {
      throw new Error('This room is full (16 players max).');
    }
    room.members.push(makeMember(input.deviceId, input.name, input.avatar, false));
    return room;
  });
}

export async function touchMember(code: string, deviceId: string): Promise<void> {
  const store = await getStore();
  try {
    await store.update(code, (room) => {
      const member = room.members.find((m) => m.deviceId === deviceId);
      if (member) member.lastSeen = Date.now();
      return room;
    });
  } catch {
    /* heartbeat is best-effort */
  }
}

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

/** Host moves everyone from the lobby into the draft. */
export async function beginDraft(code: string, deviceId: string): Promise<Room> {
  const store = await getStore();
  return store.update(code, (room) => {
    requireHost(room, deviceId);
    if (room.phase !== 'lobby') return room;
    room.phase = 'drafting';
    for (const member of room.members) {
      member.draft = createDraft(draftOptions(room, member.id), deps());
      member.ready = false;
    }
    return room;
  });
}

export async function draftPick(
  code: string,
  deviceId: string,
  playerId: string,
  slotId: string | null,
): Promise<Room> {
  const store = await getStore();
  return store.update(code, (room) => {
    const member = requireMember(room, deviceId);
    if (!member.draft) throw new Error('Draft has not started');
    member.draft = applyPick(member.draft, playerId, slotId, draftOptions(room, member.id), deps());
    if (member.draft.complete) member.ready = true;
    return room;
  });
}

export async function draftReroll(code: string, deviceId: string): Promise<Room> {
  const store = await getStore();
  return store.update(code, (room) => {
    const member = requireMember(room, deviceId);
    if (!member.draft) throw new Error('Draft has not started');
    member.draft = applyReroll(member.draft, draftOptions(room, member.id), deps());
    return room;
  });
}

export async function setStyle(code: string, deviceId: string, style: string): Promise<Room> {
  const store = await getStore();
  return store.update(code, (room) => {
    const member = requireMember(room, deviceId);
    member.style = style;
    if (member.draft) member.draft.style = style;
    return room;
  });
}

// ---------------------------------------------------------------------------
// Starting the competition
// ---------------------------------------------------------------------------

export async function startCompetition(code: string, deviceId: string): Promise<Room> {
  const store = await getStore();
  return store.update(code, (room) => {
    requireHost(room, deviceId);
    if (room.phase === 'running' || room.phase === 'complete') return room;

    const d = deps();
    // Anyone who has not finished drafting gets a valid eleven completed for them.
    for (const member of room.members) {
      if (!member.draft) member.draft = createDraft(draftOptions(room, member.id), d);
      if (!member.draft.complete) {
        member.draft = autoPick(member.draft, draftOptions(room, member.id), d);
      }
      member.ready = true;
    }

    room.competition = generateCompetition(room);
    room.phase = 'running';
    room.revealedMatchday = 0;
    return room;
  });
}

/** Advance the season playback. Any member may advance; the furthest point wins. */
export async function revealMatchday(code: string, deviceId: string, matchday: number): Promise<Room> {
  const store = await getStore();
  return store.update(code, (room) => {
    requireMember(room, deviceId);
    if (!room.competition) return room;
    room.revealedMatchday = Math.max(room.revealedMatchday, Math.min(matchday, room.competition.totalMatchdays));
    if (room.revealedMatchday >= room.competition.totalMatchdays) room.phase = 'complete';
    return room;
  });
}

function requireMember(room: Room, deviceId: string): RoomMember {
  const member = room.members.find((m) => m.deviceId === deviceId);
  if (!member) throw new Error('You are not in this room');
  member.lastSeen = Date.now();
  return member;
}

function requireHost(room: Room, deviceId: string) {
  const member = requireMember(room, deviceId);
  if (!member.isHost) throw new Error('Only the host can do that');
}

// ---------------------------------------------------------------------------
// Building the field
// ---------------------------------------------------------------------------

function generateCompetition(room: Room): CompetitionState {
  const ds = dataset();
  const format = FORMATS[room.settings.mode];
  const option = competitionOption(room.settings.mode);
  const field = competitionSquads(room.settings.mode).slice(0, format.teamCount);
  const rng = createRng(room.settings.seed + ':field');

  // Every human gets a real club identity; the rest of the field is AI.
  const shuffledField = rng.shuffle(field);
  const entries: CompetitionEntry[] = [];
  const d = deps();

  // Rank the field by real club strength so AI difficulty can track it.
  const strengthRank = new Map(
    [...field]
      .sort((a, b) => b.strength - a.strength)
      .map((squad, i) => [squad.id, i / Math.max(1, field.length - 1)]),
  );

  shuffledField.forEach((squad, index) => {
    const member = room.members[index] ?? null;
    if (member && member.draft) {
      const selection = toSelection(member.draft, member.style);
      entries.push({
        id: 'e_' + squad.id,
        teamName: squad.teamName,
        teamCode: squad.teamCode,
        badge: squad.kind === 'nation' ? `flag:${squad.country}` : `crest:${squad.teamName}`,
        colors: ds.teamsById.get(squad.teamId)?.colors ?? { primary: '#111', secondary: '#fff', text: '#fff' },
        ownerId: member.id,
        ownerName: member.name,
        avatar: member.avatar,
        selection,
        strength: squadStrengthOfSelection(selection, d.playersById),
      });
    } else {
      // AI team: drafted with the same rules, from the same pool, with no advantages.
      const aiDraft = runAiDraft(
        {
          seed: `${room.settings.seed}:ai:${squad.id}`,
          squadPool: draftPool(room.settings.mode, room.settings.includeHistoricalSquads),
          rerolls: room.settings.rerolls,
          allowDuplicatePlayers: room.settings.allowDuplicatePlayers,
          allowDuplicateSquads: room.settings.allowDuplicateSquads,
        },
        d,
        aiDifficultyFor(room.settings.aiDifficulty, strengthRank.get(squad.id) ?? 0.5),
      );
      const selection = toSelection(aiDraft, aiDraft.style);
      entries.push({
        id: 'e_' + squad.id,
        teamName: squad.teamName,
        teamCode: squad.teamCode,
        badge: squad.kind === 'nation' ? `flag:${squad.country}` : `crest:${squad.teamName}`,
        colors: ds.teamsById.get(squad.teamId)?.colors ?? { primary: '#111', secondary: '#fff', text: '#fff' },
        ownerId: null,
        ownerName: null,
        avatar: null,
        selection,
        strength: squadStrengthOfSelection(selection, d.playersById),
      });
    }
  });

  return buildCompetition({
    mode: room.settings.mode,
    seasonLabel: option.seasonLabel,
    seed: room.settings.seed,
    entries,
    playersById: d.playersById,
    homeAdvantage: room.settings.homeAdvantage,
  });
}

/**
 * Scale an AI club's drafting ability by where it sits in the competition.
 * The room's setting is the baseline; the top of the field drafts a notch above it and the
 * bottom a notch below, so the table spreads out the way a real league does.
 */
function aiDifficultyFor(base: RoomSettings['aiDifficulty'], rank: number): 'casual' | 'normal' | 'ruthless' {
  const order: ('casual' | 'normal' | 'ruthless')[] = ['casual', 'normal', 'ruthless'];
  const baseIndex = order.indexOf(base);
  // rank 0 is the strongest club in the field, 1 the weakest.
  const shift = rank < 0.3 ? 1 : rank > 0.7 ? -1 : 0;
  return order[Math.max(0, Math.min(order.length - 1, baseIndex + shift))];
}

function squadStrengthOfSelection(
  selection: { picks: Record<string, string> },
  playersById: Map<string, PlayerSeason>,
): number {
  const overalls = Object.values(selection.picks)
    .map((id) => playersById.get(id)?.overall ?? 0)
    .filter(Boolean);
  if (!overalls.length) return 50;
  return Math.round(overalls.reduce((a, b) => a + b, 0) / overalls.length);
}

// ---------------------------------------------------------------------------
// Views sent to the client
// ---------------------------------------------------------------------------

export interface RoomView {
  code: string;
  phase: Room['phase'];
  settings: RoomSettings;
  version: number;
  revealedMatchday: number;
  you: {
    memberId: string;
    isHost: boolean;
    name: string;
    avatar: string;
    style: string;
  } | null;
  members: {
    id: string;
    name: string;
    avatar: string;
    isHost: boolean;
    picked: number;
    total: number;
    complete: boolean;
    online: boolean;
  }[];
  draft: DraftView | null;
  competition: CompetitionState | null;
}

export interface DraftView {
  formationId: string;
  round: number;
  rerollsLeft: number;
  complete: boolean;
  style: string;
  picks: Record<string, { playerId: string; name: string; position: string; overall: number; squadName: string; season: string; shirt: number | null }>;
  offer: {
    squadId: string;
    squadName: string;
    squadCode: string;
    season: string;
    kind: string;
    country: string | null;
    strength: number;
    players: {
      playerId: string;
      name: string;
      position: string;
      secondary: string[];
      overall: number;
      attack: number;
      defence: number;
      shirt: number | null;
      nationality: string | null;
      eligibleSlotIds: string[];
      legendary: boolean;
    }[];
  } | null;
}

export function roomView(room: Room, deviceId: string): RoomView {
  const ds = dataset();
  const me = room.members.find((m) => m.deviceId === deviceId) ?? null;
  const total = 11;
  const now = Date.now();

  return {
    code: room.code,
    phase: room.phase,
    settings: room.settings,
    version: room.version,
    revealedMatchday: room.revealedMatchday,
    you: me ? { memberId: me.id, isHost: me.isHost, name: me.name, avatar: me.avatar, style: me.style } : null,
    members: room.members.map((m) => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      isHost: m.isHost,
      picked: m.draft ? Object.keys(m.draft.picks).length : 0,
      total,
      complete: m.draft?.complete ?? false,
      online: now - m.lastSeen < 45_000,
    })),
    draft: me?.draft ? draftView(me.draft, ds) : null,
    competition: room.competition,
  };
}

function draftView(draft: DraftState, ds: ReturnType<typeof dataset>): DraftView {
  const picks: DraftView['picks'] = {};
  for (const [slotId, playerId] of Object.entries(draft.picks)) {
    const player = ds.playersById.get(playerId);
    const squad = player ? ds.squadsById.get(player.squadId) : null;
    if (!player) continue;
    picks[slotId] = {
      playerId,
      name: player.name,
      position: player.position,
      overall: player.overall,
      squadName: squad?.teamName ?? '',
      season: squad?.season ?? '',
      shirt: player.shirt,
    };
  }

  let offer: DraftView['offer'] = null;
  if (draft.currentOffer) {
    const squad = ds.squadsById.get(draft.currentOffer.squadId);
    if (squad) {
      offer = {
        squadId: squad.id,
        squadName: squad.teamName,
        squadCode: squad.teamCode,
        season: squad.season,
        kind: squad.kind,
        country: squad.country,
        strength: squad.strength,
        players: draft.currentOffer.players
          .map((entry) => {
            const player = ds.playersById.get(entry.playerId);
            if (!player) return null;
            return {
              playerId: player.id,
              name: player.name,
              position: player.position,
              secondary: player.secondary,
              overall: player.overall,
              attack: player.attack,
              defence: player.defence,
              shirt: player.shirt,
              nationality: player.nationality,
              eligibleSlotIds: entry.eligibleSlotIds,
              legendary: player.legendary,
            };
          })
          .filter(Boolean) as NonNullable<DraftView['offer']>['players'],
      };
    }
  }

  return {
    formationId: draft.formationId,
    round: draft.round,
    rerollsLeft: draft.rerollsLeft,
    complete: draft.complete,
    style: draft.style,
    picks,
    offer,
  };
}

export { RoomNotFound };
