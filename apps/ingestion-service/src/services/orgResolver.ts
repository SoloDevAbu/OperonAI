import { createHash } from "node:crypto";
import type { IORedis } from "@operonai/lib";
import type { Database } from "@operonai/db";
import { findOrganizationsByKeyPrefix } from "@operonai/db";
import bcrypt from "bcryptjs";

const CACHE_TTL_S = 3600; // 1 hour for valid keys
const NEG_CACHE_TTL_S = 300; // 5 min for invalid keys
const API_KEY_PREFIX_LENGTH = 8;

const cacheKey = (apiKey: string) =>
  `org:apikey:${createHash("sha256").update(apiKey).digest("hex")}`;

/**
 * Resolves an organization by API key using a high-performance
 * prefix-based DB lookup + Redis cache strategy.
 */
export const resolveOrgByApiKey = async (
  db: Database,
  redis: IORedis,
  apiKey: string
) => {
  const key = cacheKey(apiKey);

  const cached = await redis.get(key);
  if (cached !== null) {
    return cached === "null" ? null : JSON.parse(cached);
  }

  const prefix = apiKey.substring(0, API_KEY_PREFIX_LENGTH);
  const candidates = await findOrganizationsByKeyPrefix(db, prefix);

  for (const org of candidates) {
    const matches = await bcrypt.compare(apiKey, org.apiKeyHash);
    if (matches) {
      await redis.set(key, JSON.stringify(org), "EX", CACHE_TTL_S);
      return org;
    }
  }

  // 4. Negative cache — prevents brute-force CPU attacks
  await redis.set(key, "null", "EX", NEG_CACHE_TTL_S);
  return null;
};
