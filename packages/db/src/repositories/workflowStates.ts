import { eq } from "drizzle-orm"
import type { Database } from "../client"
import { workflowStates, type NewWorkflowStateRow } from "../schema"

/** Fetch all workflow state transitions for a given incident ID, ordered by transition time. */
export const findWorkflowStatesByIncidentId = async (
  db: Database,
  incidentId: string
) => {
  return db
    .select()
    .from(workflowStates)
    .where(eq(workflowStates.incidentId, incidentId))
    .orderBy(workflowStates.transitionedAt)
}

/** Create a new workflow state transition record. */
export const createWorkflowState = async (
  db: Database,
  data: NewWorkflowStateRow
) => {
  const [workflowState] = await db
    .insert(workflowStates)
    .values(data)
    .returning()
  return workflowState
}
