import {
  beginDraft,
  draftPick,
  draftReroll,
  joinRoom,
  revealMatchday,
  roomView,
  setStyle,
  startCompetition,
  touchMember,
} from '@/lib/server/rooms';
import { json, fail, withDevice } from '@/lib/server/respond';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** One endpoint for every room mutation, so the client only needs a single call shape. */
export const POST = withDevice(async (req, { deviceId, params }) => {
  const code = String(params.code).toUpperCase();
  const body = (await req.json()) as {
    action: string;
    name?: string;
    avatar?: string;
    playerId?: string;
    slotId?: string | null;
    style?: string;
    matchday?: number;
  };

  switch (body.action) {
    case 'join': {
      const room = await joinRoom(code, {
        deviceId,
        name: body.name || 'PLAYER',
        avatar: body.avatar || '⚽',
      });
      return json({ room: roomView(room, deviceId) });
    }
    case 'heartbeat': {
      await touchMember(code, deviceId);
      const store = await getStore();
      const room = await store.get(code);
      if (!room) return fail('Room not found', 404);
      return json({ room: roomView(room, deviceId) });
    }
    case 'begin-draft':
      return json({ room: roomView(await beginDraft(code, deviceId), deviceId) });
    case 'pick': {
      if (!body.playerId) return fail('Missing player');
      const room = await draftPick(code, deviceId, body.playerId, body.slotId ?? null);
      return json({ room: roomView(room, deviceId) });
    }
    case 'reroll':
      return json({ room: roomView(await draftReroll(code, deviceId), deviceId) });
    case 'style':
      return json({ room: roomView(await setStyle(code, deviceId, body.style || 'balanced'), deviceId) });
    case 'start':
      return json({ room: roomView(await startCompetition(code, deviceId), deviceId) });
    case 'reveal':
      return json({ room: roomView(await revealMatchday(code, deviceId, body.matchday ?? 0), deviceId) });
    default:
      return fail('Unknown action');
  }
});
