export interface Runbook {
    id: string;
    orgId: string;
    title: string;
    content: string;
    // embedding stored in pgvector, not returned in API responses
    tags: string[];
    sourceType: "manual" | "imported" | "generated";
    createdAt: Date;
    updatedAt: Date;
  }
  
  export interface CreateRunbookInput {
    orgId: string;
    title: string;
    content: string;
    tags?: string[];
    sourceType?: Runbook["sourceType"];
  }