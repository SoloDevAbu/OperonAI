import { eq, and, desc } from "drizzle-orm"
import type { Database } from "../client"
import { incidents, type NewIncidentRow } from "../schema"

/** Find paginated, filterable incidents for an organization. */
export const findIncidents = async (
  db: Database,
  options: {
    orgId: string
    status?: string
    severity?: string
    limit: number
    offset: number
  }
) => {
  const conditions = [eq(incidents.orgId, options.orgId)]

  if (options.status) {
    conditions.push(eq(incidents.status, options.status))
  }
  if (options.severity) {
    conditions.push(eq(incidents.severity, options.severity))
  }

  return db
    .select()
    .from(incidents)
    .where(and(...conditions))
    .orderBy(desc(incidents.detectedAt))
    .limit(options.limit)
    .offset(options.offset)
}

/** Find a single incident by ID and organization ID. */
export const findIncidentById = async (
  db: Database,
  id: string,
  orgId: string
) => {
  const [incident] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.id, id), eq(incidents.orgId, orgId)))
    .limit(1)
  return incident ?? null
}

/** Verify if an incident exists and belongs to an organization, returning only its ID. */
export const findIncidentIdOnly = async (
  db: Database,
  id: string,
  orgId: string
) => {
  const [incident] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(and(eq(incidents.id, id), eq(incidents.orgId, orgId)))
    .limit(1)
  return incident ?? null
}

/** Create a new incident. */
export const createIncident = async (db: Database, data: NewIncidentRow) => {
  const [incident] = await db
    .insert(incidents)
    .values(data)
    .returning()
  return incident
}

/** Update the status of an incident. */
export const updateIncidentStatus = async (
  db: Database,
  id: string,
  status: string
) => {
  await db
    .update(incidents)
    .set({ status })
    .where(eq(incidents.id, id))
}
