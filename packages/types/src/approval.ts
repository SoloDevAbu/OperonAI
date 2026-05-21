// ─── Approval status ──────────────────────────────────────────────────────────

export type ApprovalStatus = "pending" | "approved" | "rejected" | "timed_out";

export type ApprovalActionType =
  | "restart_worker"
  | "clear_failed_jobs"
  | "rollback_deployment"
  | "scale_service"
  | "custom";

// ─── Approval request ─────────────────────────────────────────────────────────

export interface ApprovalRequest {
  id: string;
  orgId: string;
  incidentId: string;
  actionType: ApprovalActionType;
  actionDescription: string;
  actionPayload: Record<string, unknown>;
  status: ApprovalStatus;
  rejectionReason: string | null;
  requestedAt: Date;
  decidedAt: Date | null;
  expiresAt: Date;
}

// ─── API request/response ────────────────────────────────────────────────────

export interface ApproveActionInput {
  approvalId: string;
}

export interface RejectActionInput {
  approvalId: string;
  reason: string;
}