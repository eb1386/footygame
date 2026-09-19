import { deviceIdFrom, withDeviceCookie } from './session';

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(init?.headers || {}) },
  });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, { status });
}

/** Wrap a handler so every response carries the guest device cookie. */
export function withDevice(
  handler: (req: Request, ctx: { deviceId: string; params: Record<string, string> }) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const { id, isNew } = deviceIdFrom(req);
    try {
      const params = ctx?.params ? await ctx.params : {};
      const res = await handler(req, { deviceId: id, params });
      return withDeviceCookie(res, id, isNew);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      return withDeviceCookie(fail(message, 400), id, isNew);
    }
  };
}
