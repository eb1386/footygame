import { roomView } from '@/lib/server/rooms';
import { json, fail, withDevice } from '@/lib/server/respond';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export const GET = withDevice(async (_req, { deviceId, params }) => {
  const store = await getStore();
  const room = await store.get(String(params.code).toUpperCase());
  if (!room) return fail('Room not found', 404);
  return json({ room: roomView(room, deviceId) });
});
