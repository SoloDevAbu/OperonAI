import { eq } from "drizzle-orm"
import type { Database } from "../client"
import { organizations } from "../schema"

/** Fetch organizations matching the given API key prefix (first 8 chars). */
export const findOrganizationsByKeyPrefix = async (
  db: Database,
  prefix: string
) => {
  return db
    .select()
    .from(organizations)
    .where(eq(organizations.apiKeyPrefix, prefix))
}

/** Fetch a single organization by ID. */
export const findOrganizationById = async (db: Database, id: string) => {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1)
  return org ?? null
}
