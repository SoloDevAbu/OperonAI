import type { IncidentSeverity } from "@operonai/types";

export interface InvestigationJobData {
  incidentId: string;
  orgId: string;
  severity: IncidentSeverity;
  // Used for resume after approval wait
  // If set, agent skips already-completed steps
  resumeFromStep?: number;
  // Set when job is a resume after approval
  resolvedApprovalId?: string;
}

export interface InvestigationJobResult {
  incidentId: string;
  status: "concluded" | "escalated" | "failed";
  rootCause: string | null;
  stepsExecuted: number;
  durationMs: number;
}

export const JOB_NAMES = {
  INVESTIGATE: "investigate",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];