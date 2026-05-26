import type { Context, Next } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const cleanup = (): void => {
  const now = Date.now();

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
};

setInterval(cleanup, 60_000).unref();

export const rateLimitMiddleware =
  (limit: number, windowMs: number) =>
  async (c: Context, next: Next): Promise<void | Response> => {
    const orgId = c.get("orgId") as string | undefined;
    const ip = c.req.header("x-real-ip") ?? "unknown";
    const key = `${orgId ?? ip}:${c.req.path}`;
    const now = Date.now();

    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (entry.count >= limit) {
      return c.json(
        {
          error: "Rate limit exceeded",
          retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        },
        429
      );
    }

    entry.count++;
    await next();
  };
