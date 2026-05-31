import type { Context, Next } from "hono";
import { createRedisClient, HEADER_REAL_IP } from "@operonai/lib";
import type { Logger } from "@operonai/lib";

const redis = createRedisClient();

export const rateLimitMiddleware =
  (limit: number, windowMs: number) =>
  async (c: Context, next: Next): Promise<void | Response> => {
    const logger = c.get("logger") as Logger | undefined;
    const orgId = c.get("orgId") as string | undefined;
    const ip = c.req.header(HEADER_REAL_IP) ?? "unknown";

    // Identifier per organization or IP if not authenticated yet
    const identifier = orgId ?? ip;
    const key = `ratelimit:${identifier}:${c.req.path}`;

    try {
      const multi = redis.multi();
      multi.incr(key);

      const results = await multi.exec();
      const count = results?.[0]?.[1] as number;

      if (count === 1) {
        // First request in window, set expiration
        await redis.pexpire(key, windowMs);
      }

      if (count > limit) {
        logger?.warn(
          { path: c.req.path, identifier, count },
          "rate limit exceeded"
        );
        const pttl = await redis.pttl(key);
        const retryAfter = Math.max(1, Math.ceil(pttl / 1000));

        return c.json(
          {
            error: "Rate limit exceeded",
            retryAfter,
          },
          429
        );
      }

      await next();
    } catch (err) {
      // Fallback: if Redis fails, log it and allow request to prevent full outage
      logger?.error({ err }, "Redis error during rate limiting, failing open");
      await next();
    }
  };
