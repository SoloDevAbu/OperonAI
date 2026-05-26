import { eq, and } from "drizzle-orm"
import type { Database } from "../client"
import { approvalRequests, type NewApprovalRequestRow } from "../schema"

/** Fetch pending approval requests for an organization, ordered by requested time. */
export const findPendingApprovalsByOrgId = async (
  db: Database,
  orgId: string
) => {
  return db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.orgId, orgId),
        eq(approvalRequests.status, "pending")
      )
    )
    .orderBy(approvalRequests.requestedAt)
}

/** Fetch a single pending approval request by ID and organization ID. */
export const findPendingApprovalById = async (
  db: Database,
  id: string,
  orgId: string
) => {
  const [approval] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.id, id),
        eq(approvalRequests.orgId, orgId),
        eq(approvalRequests.status, "pending")
      )
    )
    .limit(1)
  return approval ?? null
}

/** Update the status and completion details of an approval request. */
export const updateApprovalStatus = async (
  db: Database,
  id: string,
  status: "pending" | "approved" | "rejected" | "timed_out",
  extra?: { rejectionReason?: string; decidedAt?: Date }
) => {
  const decidedAt = extra?.decidedAt ?? new Date()
  await db
    .update(approvalRequests)
    .set({
      status,
      decidedAt,
      rejectionReason: extra?.rejectionReason,
    })
    .where(eq(approvalRequests.id, id))
}

/** Create a new approval request. */
export const createApprovalRequest = async (
  db: Database,
  data: NewApprovalRequestRow
) => {
  const [approval] = await db
    .insert(approvalRequests)
    .values(data)
    .returning()
  return approval
}
