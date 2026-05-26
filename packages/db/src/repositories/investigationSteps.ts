import { eq } from "drizzle-orm"
import type { Database } from "../client"
import { investigationSteps } from "../schema"

/** Fetch all investigation steps for a given incident ID ordered by step number. */
export const findStepsByIncidentId = async (
  db: Database,
  incidentId: string
) => {
  return db
    .select()
    .from(investigationSteps)
    .where(eq(investigationSteps.incidentId, incidentId))
    .orderBy(investigationSteps.stepNumber)
}
