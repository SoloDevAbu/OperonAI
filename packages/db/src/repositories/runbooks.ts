import { eq, and } from "drizzle-orm"
import type { Database } from "../client"
import { runbooks, type NewRunbookRow } from "../schema"

/** Find runbooks for an organization, excluding large fields (content and embedding). */
export const findRunbooksByOrgId = async (
  db: Database,
  orgId: string
) => {
  return db
    .select({
      id: runbooks.id,
      orgId: runbooks.orgId,
      title: runbooks.title,
      tags: runbooks.tags,
      sourceType: runbooks.sourceType,
      createdAt: runbooks.createdAt,
      updatedAt: runbooks.updatedAt,
    })
    .from(runbooks)
    .where(eq(runbooks.orgId, orgId))
    .orderBy(runbooks.createdAt)
}

/** Find a single runbook by ID, excluding raw embedding vector. */
export const findRunbookById = async (
  db: Database,
  id: string,
  orgId: string
) => {
  const [runbook] = await db
    .select({
      id: runbooks.id,
      orgId: runbooks.orgId,
      title: runbooks.title,
      content: runbooks.content,
      tags: runbooks.tags,
      sourceType: runbooks.sourceType,
      createdAt: runbooks.createdAt,
      updatedAt: runbooks.updatedAt,
    })
    .from(runbooks)
    .where(and(eq(runbooks.id, id), eq(runbooks.orgId, orgId)))
    .limit(1)
  return runbook ?? null
}

/** Create a new runbook and return metadata/attributes without embedding. */
export const createRunbook = async (
  db: Database,
  data: NewRunbookRow
) => {
  const [runbook] = await db
    .insert(runbooks)
    .values(data)
    .returning({
      id: runbooks.id,
      orgId: runbooks.orgId,
      title: runbooks.title,
      tags: runbooks.tags,
      sourceType: runbooks.sourceType,
      createdAt: runbooks.createdAt,
      updatedAt: runbooks.updatedAt,
    })
  return runbook
}

/** Delete a runbook by ID and organization ID. */
export const deleteRunbook = async (
  db: Database,
  id: string,
  orgId: string
) => {
  const [deleted] = await db
    .delete(runbooks)
    .where(and(eq(runbooks.id, id), eq(runbooks.orgId, orgId)))
    .returning({ id: runbooks.id })
  return deleted ?? null
}
