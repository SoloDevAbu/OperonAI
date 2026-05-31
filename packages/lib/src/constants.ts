// Headers
export const HEADER_INTERNAL_SECRET = "x-internal-secret";
export const HEADER_ORG_ID = "x-org-id";
export const HEADER_REAL_IP = "x-real-ip";
export const HEADER_AUTHORIZATION = "Authorization";

// Auth
export const JWT_COOKIE_NAME = "token";

// Queues & Jobs
export const JOB_PREFIX_INCIDENT = "incident-";

// SSE Channels
export const SSE_CHANNEL_INCIDENTS = "incidents";
export const SSE_CHANNEL_APPROVALS = "approvals";

// Incident Severities
export const INCIDENT_SEVERITY = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type IncidentSeverity = typeof INCIDENT_SEVERITY[keyof typeof INCIDENT_SEVERITY];

// Incident Statuses
export const INCIDENT_STATUS = {
  DETECTED: "detected",
  QUEUED: "queued",
  INVESTIGATING: "investigating",
  AWAITING_APPROVAL: "awaiting_approval",
  RESOLVED: "resolved",
} as const;

export type IncidentStatus = typeof INCIDENT_STATUS[keyof typeof INCIDENT_STATUS];

// Approval Statuses
export const APPROVAL_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  TIMED_OUT: "timed_out",
} as const;

export type ApprovalStatus = typeof APPROVAL_STATUS[keyof typeof APPROVAL_STATUS];
