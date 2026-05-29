import { eq } from "drizzle-orm"
import type { Database } from "../client"
import { organizations, type NewOrganization } from "../schema"

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

/** Fetch a single organization by slug. */
export const findOrganizationBySlug = async (db: Database, slug: string) => {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1)
  return org ?? null
}

/** Create a new organization. */
export const createOrganization = async (
  db: Database,
  data: NewOrganization
) => {
  const [org] = await db
    .insert(organizations)
    .values(data)
    .returning()
  if (!org) {
    throw new Error("Failed to create organization")
  }
  return org
}

/** Update an organization. */
export const updateOrganization = async (
  db: Database,
  id: string,
  data: Partial<Omit<NewOrganization, "id" | "createdAt">>
) => {
  const [org] = await db
    .update(organizations)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, id))
    .returning()
  return org ?? null
}

