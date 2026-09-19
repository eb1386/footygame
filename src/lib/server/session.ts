/** Guest identity. A signed-in account is optional; a device cookie is enough to play. */
import { cookies } from 'next/headers';

const COOKIE = 'nip_device';

export async function deviceId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;
  return newDeviceId();
}

export function newDeviceId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Read the device id from a request, minting one when the browser has never been here. */
export function deviceIdFrom(req: Request): { id: string; isNew: boolean } {
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/nip_device=([a-f0-9]{16,64})/);
  if (match) return { id: match[1], isNew: false };
  return { id: newDeviceId(), isNew: true };
}

export function withDeviceCookie(res: Response, id: string, isNew: boolean): Response {
  if (!isNew) return res;
  res.headers.append(
    'Set-Cookie',
    `${COOKIE}=${id}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`,
  );
  return res;
}
