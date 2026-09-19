import { COMPETITIONS } from '@/lib/data/dataset';
import { createRoom, roomView } from '@/lib/server/rooms';
import { json, withDevice } from '@/lib/server/respond';
import { getStore } from '@/lib/server/store';
import type { CompetitionMode } from '@/lib/core/types';

export const dynamic = 'force-dynamic';

/** Recent public rooms plus the ones this device is already in. */
export const GET = withDevice(async (_req, { deviceId }) => {
  const store = await getStore();
  const mine = await store.listForDevice(deviceId, 8);
  return json({
    competitions: COMPETITIONS,
    storage: store.kind,
    rooms: mine.map((r) => ({
      code: r.code,
      phase: r.phase,
      mode: r.settings.mode,
      players: r.members.length,
      updatedAt: r.updatedAt,
      champion: r.competition?.championEntryId
        ? r.competition.entries.find((e) => e.id === r.competition!.championEntryId)?.teamName ?? null
        : null,
    })),
  });
});

export const POST = withDevice(async (req, { deviceId }) => {
  const body = (await req.json()) as {
    name?: string;
    avatar?: string;
    mode?: CompetitionMode;
    settings?: Record<string, unknown>;
  };
  if (!body.mode) return json({ error: 'Pick a competition' }, { status: 400 });
  const room = await createRoom({
    deviceId,
    name: body.name || 'HOST',
    avatar: body.avatar || '⚽',
    settings: { ...(body.settings || {}), mode: body.mode },
  });
  return json({ room: roomView(room, deviceId) });
});
