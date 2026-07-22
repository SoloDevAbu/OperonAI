# OperonAI: Autonomous AI-Ops & Incident Investigation Platform

[![Monorepo: Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white)](https://turbo.build)
[![Package Manager: pnpm](https://img.shields.io/badge/pnpm-Workspaces-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io)
[![Runtime: Node.js + Python](https://img.shields.io/badge/Runtime-Node.js%20%7C%20Python%203.11+-339933?style=for-the-badge&logo=node.js&logoColor=white)]()
[![Database: PostgreSQL + pgvector](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)]()
[![AI: Claude + Vercel AI SDK](https://img.shields.io/badge/AI-Anthropic%20Claude%20%7C%20Vercel%20AI-000000?style=for-the-badge&logo=anthropic&logoColor=white)]()

**OperonAI** (`ai-ops-agent`) is an enterprise-grade, autonomous self-healing and incident investigation platform. It ingests high-velocity telemetry, detects anomalies using a hybrid Rule Engine + ML Signal Processing pipeline, and dispatches autonomous AI agents powered by **Anthropic Claude** to investigate root causes, execute diagnostic tools, request human approvals for destructive actions, and document remediation workflows using vector-based memory (**RAG** with `pgvector`).

---

## Table of Contents

1. [Architecture Overview & High-Level Design (HLD)](#1-architecture-overview--high-level-design-hld)
2. [Technology Stack & Architectural Justification](#2-technology-stack--architectural-justification)
3. [Microservices Breakdown](#3-microservices-breakdown)
   - [`ingestion-service` (Node.js + Fastify)](#31-ingestion-service-nodejs--fastify)
   - [`anomaly-service` (Python + FastAPI)](#32-anomaly-service-python--fastapi)
   - [`agent-service` (Node.js + Fastify + BullMQ + Claude)](#33-agent-service-nodejs--fastify--bullmq--claude)
   - [`api-service` (Node.js + Hono)](#34-api-service-nodejs--hono)
   - [`web` (Next.js + TypeScript)](#35-web-nextjs--typescript)
4. [Low-Level Design (LLD) & Data Architecture](#4-low-level-design-lld--data-architecture)
   - [Relational & Vector Data Model (ER Diagram)](#41-relational--vector-data-model-er-diagram)
   - [Workflow State Machine](#42-workflow-state-machine)
   - [Agent Tool Layer Contract](#43-agent-tool-layer-contract)
   - [Inter-Service Communication & Lifecycle](#44-inter-service-communication--lifecycle)
   - [Human-in-the-Loop Approval Pause / Resume](#45-human-in-the-loop-approval-pause--resume)
   - [Agent Crash Recovery & State Persistence](#46-agent-crash-recovery--state-persistence)
   - [API Service Routes](#47-api-service-routes)
5. [Monorepo Directory Structure](#5-monorepo-directory-structure)
6. [Network & Port Mapping](#6-network--port-mapping)
7. [Getting Started & Local Development](#7-getting-started--local-development)

---

## 1. Architecture Overview & High-Level Design (HLD)

The platform is designed around a **separation of concerns** principle across five specialized microservices tied together by a central **PostgreSQL (`pgvector`)** persistence layer, a **BullMQ/Redis** distributed job queue, and an **Nginx** reverse proxy entry point.

```mermaid
flowchart TB
    subgraph Sources["Signal Sources"]
        APP[App Logs]
        PG_SRC[PostgreSQL]
        BQ_SRC[BullMQ / Redis]
    end

    subgraph ingestion["ingestion-service (Fastify)"]
        WH[Webhook Receiver]
        PO[Pollers]
        NR[Normalizer]
        BF[Batch Buffer]
    end

    subgraph anomaly["anomaly-service (Python + FastAPI)"]
        RE[Rule Engine]
        ML[ML Signal Processor]
        DC[Decider]
    end

    subgraph agent["agent-service (Fastify)"]
        WK[BullMQ Worker]
        IL[Investigation Loop]
        TL[Tool Layer]
        MM[Memory Layer]
        WF[Workflow Engine]
        AG[Approval Gate]
    end

    subgraph api["api-service (Hono)"]
        IR[Incidents Router]
        AR[Approvals Router]
        RB[Runbooks Router]
        SE[SSE Streams]
    end

    subgraph web["web (Next.js)"]
        DASH[Incident Feed]
        DETAIL[Incident Detail]
        APPR[Approval UI]
    end

    subgraph storage["Storage"]
        DB[(PostgreSQL + pgvector)]
        RD[(Redis)]
    end

    subgraph obs["Observability"]
        LF[Langfuse]
    end

    APP -->|POST /ingest/logs| WH
    PG_SRC -->|poll 30s| PO
    BQ_SRC -->|poll 15s| PO

    WH --> NR
    PO --> NR
    NR --> BF
    BF -->|POST /analyze batch| anomaly

    RE --> DC
    ML --> DC
    DC -->|anomaly confirmed| api

    api -->|create incident + enqueue job| RD
    RD -->|dequeue| WK
    WK --> IL
    IL <-->|calls| TL
    IL <-->|read/write| MM
    IL -->|needs approval| AG
    AG -->|create approval request| api
    IL -->|trace| LF

    TL --> DB
    TL --> RD
    TL -->|safe actions| Sources

    MM <-->|embeddings| DB

    WF -->|state transitions| DB

    IR --> DB
    AR --> DB
    SE -->|push events| DASH

    DASH --> SE
    DETAIL --> IR
    APPR --> AR

    api -->|resume job on approval| RD
    agent -->|write incidents, steps| DB
    ingestion -->|write raw events| DB
```

### Architectural Flow Summary
1. **Telemetry Capture**: `ingestion-service` receives real-time log webhooks and continuously polls internal databases/queues. Events are normalized into a unified schema and buffered in memory.
2. **Signal Evaluation**: Batched events are sent to `anomaly-service` where deterministic rules (error rates, pool exhaustion) and statistical ML algorithms (Z-scores, rolling windows) compute an anomaly score.
3. **Incident Creation**: Confirmed anomalies trigger `api-service` to create an `Incident` record in PostgreSQL and enqueue an investigation job in BullMQ (`Redis`).
4. **Autonomous AI Investigation**: `agent-service` workers dequeue the job, load vector embeddings of similar historical incidents and runbooks (`pgvector`), and execute a tool-assisted investigation loop using **Anthropic Claude**.
5. **Human Sign-Off Gate**: If Claude decides to run a destructive tool (e.g., `restart_worker` or `clear_failed_jobs`), execution pauses automatically. An `ApprovalRequest` is generated, and the job re-enqueues as delayed until signed off via the Next.js control plane.

---

## 2. Technology Stack & Architectural Justification

| Layer | Choice | Architectural Justification |
| :--- | :--- | :--- |
| **Monorepo Management** | **Turborepo + pnpm workspaces** | Industry standard for polyglot monorepos. Provides zero-copy symlinked dependency management, deterministic builds, and robust artifact caching across Node.js services and shared packages. |
| **Ingestion Hot Path** | **Node.js + Fastify** | Fastify offers industry-leading throughput (`~30k+ req/sec`) with JSON schema validation, ideal for buffering and normalizing high-volume log webhooks without blocking the event loop. |
| **Signal & ML Processing** | **Python + FastAPI** | Native integration with `numpy`, `pandas`, and `scikit-learn` for Z-score calculations, rate-of-change analysis, and statistical window processing. |
| **AI Investigation Loop** | **Node.js + Fastify + Vercel AI SDK** | TypeScript-first architecture leveraging the **Vercel AI SDK** for structured tool calling, streaming responses, and seamless integration with **Anthropic Claude**. |
| **REST API Gateway** | **Node.js + Hono** | Ultra-lightweight, high-performance web framework providing fast route matching and native Server-Sent Events (SSE) support for low-latency frontend pushes. |
| **Control Plane UI** | **Next.js + TypeScript** | React Server Components, server actions, and dynamic client components for a responsive real-time dashboard, interactive incident timelines, and approval gates. |
| **Primary & Vector DB** | **PostgreSQL + Drizzle ORM + `pgvector`** | Single source of truth combining relational integrity (`Drizzle ORM`) with high-performance vector similarity searches (`pgvector`) for historical incident and runbook RAG. |
| **Job Queue & State** | **BullMQ + Redis** | Reliable distributed task execution with exponential backoff, delayed jobs, step pausing/resuming, and concurrency controls across multi-node worker pools. |
| **AI & LLM Engine** | **Anthropic Claude** | State-of-the-art reasoning and tool-calling capabilities essential for multi-step diagnostic investigations and root cause analysis (RCA). |
| **Observability** | **Langfuse** | Deep tracing of agent reasoning loops, token usage, tool latency, and prompt performance across multi-step investigations. |
| **Containers & Reverse Proxy** | **Docker + Nginx** | Service isolation ensuring zero-conflict deployment between Node and Python runtimes, unified behind Nginx as a single entry point (`Port 80`). |

---

## 3. Microservices Breakdown

### 3.1 `ingestion-service` (Node.js + Fastify)
The hot-path entry point responsible for gathering telemetry from disparate systems without dropping packets or overloading downstream analyzers.

```mermaid
flowchart TD
    subgraph Receivers
        R1[POST /ingest/logs]
        R2[POST /ingest/events]
        R3[Cron: PG poller 30s]
        R4[Cron: BullMQ poller 15s]
    end

    subgraph Normalizer
        N1[Detect source type]
        N2[Extract fields]
        N3[Map to RawEvent schema]
        N4[Enrich metadata]
    end

    subgraph Buffer
        B1[In-memory batch buffer]
        B2[Flush every 2s or 100 events]
    end

    subgraph Forwarder
        F1[POST /analyze to anomaly-service]
        F2[Write RawEvents to DB]
    end

    R1 --> N1
    R2 --> N1
    R3 --> N1
    R4 --> N1

    N1 --> N2 --> N3 --> N4 --> B1
    B1 --> B2
    B2 --> F1
    B2 --> F2
```

* **Webhook Receivers**: High-speed endpoints accepting application logs and external event payloads.
* **Pollers**: Cron-driven jobs pulling state (`30s` for Postgres slow queries/connections, `15s` for BullMQ queue depths/failed counts).
* **Normalizer**: Standardizes disparate incoming payloads into the canonical `RawEvent` schema (`source`, `sourceType`, `normalizedType`, `payload`, `metadata`).
* **Batch Buffer**: Accumulates events in memory (`flushing every 2 seconds OR at 100 items`) to optimize database inserts and minimize HTTP overhead when communicating with the `anomaly-service`.

---

### 3.2 `anomaly-service` (Python + FastAPI)
The quantitative analysis brain that evaluates batched telemetry to filter noise and identify genuine incidents.

```mermaid
flowchart TD
    IN[POST /analyze - batch RawEvents]

    subgraph RuleEngine["Rule Engine"]
        R1[Error rate threshold]
        R2[Queue depth threshold]
        R3[Slow query count]
        R4[Connection pool exhaustion]
        R5[Worker crash count]
    end

    subgraph MLProcessor["ML Processor"]
        M1[Z-score detection]
        M2[Rate-of-change detection]
        M3[Rolling window stats]
    end

    subgraph Decider
        D1[Combine rule + ML scores]
        D2[Apply severity matrix]
        D3{Score above threshold?}
    end

    IN --> R1 & R2 & R3 & R4 & R5
    IN --> M1 & M2 & M3

    R1 & R2 & R3 & R4 & R5 --> D1
    M1 & M2 & M3 --> D1

    D1 --> D2 --> D3
    D3 -->|yes| O1[POST /internal/incidents to api-service]
    D3 -->|no| O2[Discard]
```

* **Rule Engine**: Deterministic checks enforcing operational boundaries (`error_rate > threshold`, `queue_depth > max`, `connection_pool_waiting > 0`, `worker_crash_count >= 3`).
* **ML Processor**: Statistical anomaly detection operating on rolling telemetry windows:
  * **Z-Score Detection**: Identifies spikes outside standard deviations.
  * **Rate-of-Change Detection**: Flags sudden velocity shifts (e.g., memory leak acceleration).
  * **Rolling Window Stats**: Tracks multi-minute baseline trends.
* **Decider**: Aggregates scores from both engines. If the composite `anomalyScore` exceeds the severity matrix threshold, it triggers `POST /internal/incidents` on `api-service` to initiate an automated investigation.

---

### 3.3 `agent-service` (Node.js + Fastify + BullMQ + Claude)
The core autonomous AI engine. It executes multi-step investigation loops, interacts with live infrastructure via safe/destructive tools, leverages RAG memory, and enforces safety gates.

```mermaid
flowchart TD
    A[Job dequeued from BullMQ]
    B[Load incident from DB]
    C[Load existing InvestigationSteps - crash recovery]
    D[Retrieve similar incidents from pgvector]
    E[Retrieve relevant runbooks from pgvector]
    F[Build prompt with context + memory + steps]
    G[Start Langfuse trace]

    A --> B --> C --> D --> E --> F --> G

    G --> H{Agent reasoning step}

    H --> I[Select tool]
    I --> J[Validate tool input schema]
    J --> K{Requires approval?}

    K -->|no| L[Execute tool]
    K -->|yes| M[Create ApprovalRequest in DB]
    M --> N[Update incident: awaiting_approval]
    N --> O[Re-enqueue job as delayed]
    O --> P[Exit cleanly]

    P -->|human approves via dashboard| Q[API promotes delayed job]
    P -->|timeout 1hr| Q

    Q --> B

    L --> R[Write InvestigationStep to DB]
    R --> S[Add result to agent context]
    S --> T[Update Langfuse span]
    T --> U{Agent decision}

    U -->|need more data| H
    U -->|conclusion reached| V[Generate RCA + remediation]
    U -->|cannot conclude| W[Escalate incident]

    V --> X[Update incident in DB]
    X --> Y[Generate + store IncidentMemory embedding]
    Y --> Z[Transition workflow to Documented]
    Z --> AA[End Langfuse trace]
```

* **Investigation Loop**: Powered by the **Vercel AI SDK** and **Anthropic Claude**. The agent evaluates context, executes diagnostic tools iteratively, and decides whether more context is required, a root cause has been found, or human escalation is needed.
* **Memory & RAG Layer**: Before reasoning, the agent queries `pgvector` (`cosine similarity`) to fetch:
  1. Similar historical `IncidentMemory` summaries and root causes.
  2. Standard operating `Runbook` procedures matching the affected service or error pattern.
* **Langfuse Tracing**: Every step, tool selection, token expenditure, and latency metric is emitted to Langfuse for full end-to-end observability and auditing.

---

### 3.4 `api-service` (Node.js + Hono)
The central data gateway connecting backend services to the web interface.

* **Lightweight REST Router**: Exposes clean CRUD endpoints for incidents, investigation steps, timelines, runbooks, and pending approvals.
* **Server-Sent Events (SSE)**: Maintains persistent HTTP connections (`/stream/incidents`, `/stream/approvals`) with the Next.js frontend, broadcasting state changes instantly without polling.
* **Internal Security**: Protects `/internal/*` routes (`POST /internal/incidents`, `POST /internal/approvals`) so only authenticated internal microservices (`anomaly-service`, `agent-service`) can trigger workflow transitions.

---

### 3.5 `web` (Next.js + TypeScript)
The operator control plane built with Next.js 14+ App Router.

* **Live Incident Feed (`LiveFeed.tsx`)**: Real-time ticker driven by SSE streams (`SSE /stream/incidents`), displaying active anomalies by severity (`Critical`, `High`, `Medium`, `Low`).
* **Interactive Timeline (`AgentTimeline.tsx`)**: Visualizes the AI agent’s step-by-step investigation journey, including tool execution inputs/outputs, token costs, latency, and Claude's exact reasoning transcripts.
* **Human Sign-Off Control (`ApprovalModal.tsx`)**: Renders pending destructive actions (`Action Description`, `Payload`, `Reasoning`), allowing engineers to approve or reject with write-in feedback right from the browser.

---

## 4. Low-Level Design (LLD) & Data Architecture

### 4.1 Relational & Vector Data Model (ER Diagram)
The database schema managed by **Drizzle ORM** combines relational tables with **pgvector** embedding columns (`vector(1536)`).

```mermaid
erDiagram
    RawEvent {
        uuid id PK
        string source
        string sourceType
        string normalizedType
        jsonb payload
        jsonb metadata
        float anomalyScore
        timestamp receivedAt
    }

    Incident {
        uuid id PK
        string status
        string severity
        string title
        string[] affectedServices
        jsonb initialContext
        uuid[] rawEventIds
        string rootCause
        float confidenceScore
        jsonb remediationOptions
        timestamp detectedAt
        timestamp resolvedAt
    }

    InvestigationStep {
        uuid id PK
        uuid incidentId FK
        int stepNumber
        string stepType
        string toolName
        jsonb toolInput
        jsonb toolOutput
        string agentReasoning
        int tokensUsed
        int durationMs
        timestamp executedAt
    }

    ApprovalRequest {
        uuid id PK
        uuid incidentId FK
        string actionType
        string actionDescription
        jsonb actionPayload
        string status
        string decidedBy
        string rejectionReason
        timestamp requestedAt
        timestamp decidedAt
    }

    IncidentMemory {
        uuid id PK
        uuid incidentId FK
        text summary
        vector embedding
        string[] tags
        jsonb metadata
        timestamp createdAt
    }

    Runbook {
        uuid id PK
        string title
        text content
        vector embedding
        string[] tags
        string sourceType
        timestamp createdAt
    }

    WorkflowState {
        uuid id PK
        uuid incidentId FK
        string currentState
        string previousState
        jsonb stateData
        timestamp transitionedAt
    }

    RawEvent ||--o{ Incident : triggers
    Incident ||--o{ InvestigationStep : has
    Incident ||--o{ ApprovalRequest : has
    Incident ||--|| IncidentMemory : stored_as
    Incident ||--o{ WorkflowState : tracked_by
```

#### Entity Definitions
* **`RawEvent`**: Immutable telemetry audit log with pre-computed anomaly scores.
* **`Incident`**: The central case file tracking status (`Detected`, `Queued`, `Investigating`, `AwaitingApproval`, `Concluded`, `Executing`, `Documented`, `Escalated`), confidence scores, and root causes.
* **`InvestigationStep`**: Immutable audit ledger of each action taken by Claude during the investigation loop. Enables step-by-step UI playback and robust crash recovery.
* **`ApprovalRequest`**: Tracks human authorization requests for destructive tool execution (`status: pending | approved | rejected`).
* **`IncidentMemory` & `Runbook`**: Vector-indexed RAG tables (`vector embedding`) enabling semantic similarity queries during agent initialization.
* **`WorkflowState`**: Immutable state transition ledger tracking exact timestamps and reasons for every status change.

---

### 4.2 Workflow State Machine
Incidents follow a strictly enforced state machine tracked by `WorkflowState`.

```mermaid
flowchart TD
    START((Start)) -->|Anomaly confirmed| DET([Detected])
    DET -->|Incident created & job enqueued| QUE([Queued])
    QUE -->|Job picked up by worker| INV([Investigating])
    INV -->|Destructive action needed| APP([Awaiting Approval])
    APP -->|Approved or rejected - job resumed| INV
    INV -->|RCA & remediation generated| CON([Concluded])
    CON -->|Actions to run| EXE([Executing])
    EXE -->|Action needs sign-off| APP
    EXE -->|Actions complete| DOC([Documented])
    CON -->|No actions needed| DOC
    INV -->|Max steps - no conclusion| ESC([Escalated])
    DOC --> END_DOC((End))
    ESC --> END_ESC((End))
```

---

### 4.3 Agent Tool Layer Contract
All tools conform to a strict TypeScript contract (`BaseTool`) with explicit **Zod validation schemas** and safety flags.

```mermaid
flowchart TB
    subgraph Contract["BaseTool Contract"]
        BT["BaseTool Interface<br>---<br>+name: string<br>+description: string<br>+inputSchema: ZodSchema<br>+outputSchema: ZodSchema<br>+requiresApproval: boolean<br>+execute(input, context): Promise"]
    end

    subgraph Safe["Safe Diagnostic Tools (requiresApproval: false)"]
        T1["fetch_recent_logs<br>Input: service, timeRangeMs, level, limit<br>Output: LogEntry[]"]
        T2["get_slow_queries<br>Input: thresholdMs, limit, timeRangeMs<br>Output: SlowQuery[]"]
        T3["get_queue_stats<br>Input: queueName<br>Output: active, waiting, failed, delayed"]
        T4["check_redis_health<br>Output: connected, memoryUsage, clients"]
        T5["get_connection_pool_stats<br>Output: total, idle, waiting, max"]
        T6["get_deployment_history<br>Input: service, limit<br>Output: Deployment[]"]
    end

    subgraph Destructive["Destructive Remediation Tools (requiresApproval: true)"]
        D1["restart_worker<br>Input: workerName, reason<br>Output: success, pid"]
        D2["clear_failed_jobs<br>Input: queueName, limit<br>Output: clearedCount"]
    end

    Contract --> Safe
    Contract --> Destructive
```

#### Tool Categorization
* **Safe Diagnostic Tools (`requiresApproval: false`)**: Read-only queries executed immediately (`fetch_recent_logs`, `get_slow_queries`, `get_queue_stats`, `check_redis_health`, `get_connection_pool_stats`, `get_deployment_history`).
* **Destructive Remediation Tools (`requiresApproval: true`)**: State-altering operations requiring explicit operator sign-off (`restart_worker`, `clear_failed_jobs`).

---

### 4.4 Inter-Service Communication & Lifecycle
The end-to-end journey of an incident from telemetry capture to RAG documentation:

```mermaid
sequenceDiagram
    participant IS as ingestion-service
    participant AS as anomaly-service
    participant API as api-service
    participant Q as BullMQ / Redis
    participant AGT as agent-service
    participant DB as PostgreSQL
    participant H as Human

    IS->>AS: POST /analyze (batch RawEvents)
    Note over AS: Score events (Rule Engine + ML)
    AS->>API: POST /internal/incidents
    API->>DB: Create Incident + WorkflowState
    API->>Q: Enqueue investigation job
    Q->>AGT: Dequeue job
    AGT->>DB: Load incident + existing steps
    AGT->>DB: pgvector similarity search
    Note over AGT: Run investigation loop (Claude AI)
    AGT->>DB: Write InvestigationStep after each tool
    AGT->>API: POST /internal/approvals (if needed)
    API->>DB: Create ApprovalRequest
    AGT->>Q: Re-enqueue self as delayed job
    H->>API: POST /approvals/:id/approve
    API->>DB: Update ApprovalRequest
    API->>Q: Promote delayed job to active
    Q->>AGT: Job resumed
    AGT->>DB: Load incident + steps + approval decision
    Note over AGT: Continue loop & execute action
    AGT->>DB: Write RCA, update Incident
    AGT->>DB: Write IncidentMemory embedding
```

---

### 4.5 Human-in-the-Loop Approval Pause / Resume
To prevent worker threads from blocking or holding memory during long human approval cycles, OperonAI leverages **BullMQ delayed jobs** as a non-blocking state machine pause mechanism:

```mermaid
sequenceDiagram
    participant IL as Investigation Loop
    participant AG as Approval Gate
    participant DB as PostgreSQL
    participant Q as BullMQ
    participant API as api-service
    participant H as Human

    IL->>AG: requestApproval(action, payload)
    AG->>DB: Create ApprovalRequest status=pending
    AG->>DB: Update Incident status=awaiting_approval
    AG->>Q: Re-enqueue job delayed 30s poll interval
    AG->>IL: return - exit cleanly

    loop Every 30s until resolved or timeout
        Q->>IL: Job fires
        IL->>DB: Check ApprovalRequest status
        DB->>IL: still pending
        IL->>Q: Re-enqueue delayed again
    end

    H->>API: POST /approvals/:id/approve
    API->>DB: Update status=approved
    API->>Q: Promote job to active immediately

    Q->>IL: Job fires
    IL->>DB: Check ApprovalRequest status
    DB->>IL: approved
    Note over IL: Execute action & continue loop
```

1. When Claude invokes a tool with `requiresApproval: true`, the `ApprovalGate` creates an `ApprovalRequest` (`status: pending`) and updates `Incident` to `AwaitingApproval`.
2. The current worker **exits cleanly**, scheduling a recurring delayed BullMQ check (`every 30 seconds`).
3. When the operator clicks **Approve** on the Next.js UI (`POST /approvals/:id/approve`), `api-service` updates the DB record and **promotes** the delayed job to active immediately in Redis (`job.promote()`).
4. The worker dequeues the job, sees `status: approved`, executes the destructive tool (`restart_worker`), and continues the investigation loop seamlessly.

---

### 4.6 Agent Crash Recovery & State Persistence
Because every step of Claude's reasoning and tool output is written immediately to `InvestigationStep`, workers can survive process crashes, out-of-memory errors, or node restarts with **zero context loss**:

```mermaid
sequenceDiagram
    participant Q as BullMQ
    participant IL as Investigation Loop
    participant TL as Tool Layer
    participant DB as PostgreSQL

    Q->>IL: Start job
    IL->>DB: Load incident
    IL->>DB: Load existing InvestigationSteps (empty first run)
    IL->>TL: Execute Tool 1
    TL-->>IL: Return Tool 1 Output
    IL->>DB: Write Step 1
    IL->>TL: Execute Tool 2
    TL-->>IL: Return Tool 2 Output
    IL->>DB: Write Step 2
    Note over IL: CRASH - Process dies unexpectedly

    Note over Q: Exponential backoff delay & retry
    Q->>IL: Restart job
    IL->>DB: Load incident
    IL->>DB: Load existing InvestigationSteps (Step 1 and Step 2)
    Note over IL: Reconstruct context from existing steps
    Note over IL: Continue cleanly from Step 3
```

When BullMQ automatically retries the crashed job after exponential backoff, `agent-service` reloads the completed steps from PostgreSQL, hydrates Claude's conversation history (`Vercel AI SDK context`), and resumes precisely at Step 3 without repeating diagnostic steps or incurring redundant LLM token charges.

---

### 4.7 API Service Routes
All routes exposed by `api-service` (`Hono`) mapped across public operator access and protected internal service access:

```mermaid
flowchart LR
    subgraph Public["Public (Operator / Web Dashboard)"]
        G1[GET /incidents]
        G2[GET /incidents/:id]
        G3[GET /incidents/:id/steps]
        G4[GET /incidents/:id/timeline]
        A1[GET /approvals/pending]
        A2[POST /approvals/:id/approve]
        A3[POST /approvals/:id/reject]
        RB1[GET /runbooks]
        RB2[POST /runbooks]
        RB3[DELETE /runbooks/:id]
        S1[GET /stream/incidents - SSE]
        S2[GET /stream/approvals - SSE]
    end

    subgraph Internal["Internal (Microservice-to-Microservice Only)"]
        I1[POST /internal/incidents]
        I2[POST /internal/approvals]
    end
```

---

## 5. Monorepo Directory Structure

```jsx
ai-ops-agent/ (OperonAI)
├── apps/
│   ├── ingestion-service/         # Node.js + Fastify (High throughput hot path)
│   │   ├── src/
│   │   │   ├── routes/            # Webhook receivers (/ingest/logs, /ingest/events)
│   │   │   ├── normalizer/        # Payload standardization pipelines
│   │   │   ├── pollers/           # Cron-driven state gatherers (PG 30s, BullMQ 15s)
│   │   │   ├── buffer/            # In-memory batch buffer (2s / 100 items flush)
│   │   │   └── forwarder/         # Forwarding client to anomaly-service & DB
│   │   └── Dockerfile
│   │
│   ├── anomaly-service/           # Python + FastAPI (ML & statistical analysis)
│   │   ├── app/
│   │   │   ├── routes/            # POST /analyze endpoint
│   │   │   ├── rules/             # Deterministic rules (error rates, pool depth)
│   │   │   ├── ml/                # Statistical models (Z-score, rate-of-change)
│   │   │   ├── models/            # Pydantic validation schemas
│   │   │   └── decider.py         # Composite score aggregation & threshold matrix
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   ├── agent-service/             # Node.js + Fastify + BullMQ (Autonomous AI Agent)
│   │   ├── src/
│   │   │   ├── worker/            # BullMQ job consumers
│   │   │   ├── investigator/      # Claude reasoning loop & context builders
│   │   │   ├── tools/             # Tool registry & safe/destructive implementations
│   │   │   ├── memory/            # RAG vector embedder & pgvector similarity search
│   │   │   ├── workflow/          # Workflow state machine transitions
│   │   │   └── approval/          # Human-in-the-loop gate & pause/resume logic
│   │   └── Dockerfile
│   │
│   ├── api-service/               # Node.js + Hono (REST Gateway + Real-time SSE)
│   │   ├── src/
│   │   │   ├── routes/            # Public CRUD routers & SSE event streams
│   │   │   ├── internal/          # Protected inter-service triggers
│   │   │   └── middleware/        # Authentication & rate limiting
│   │   └── Dockerfile
│   │
│   └── web/                       # Next.js + TypeScript (Operations Control Plane)
│       ├── app/
│       │   ├── incidents/         # Live feed & multi-step investigation timelines
│       │   └── approvals/         # Pending approval management interface
│       ├── components/            # IncidentCard, AgentTimeline, ApprovalModal, LiveFeed
│       └── Dockerfile
│
├── packages/                      # Shared pnpm Workspace Packages
│   ├── shared-types/              # Canonical Zod schemas & TS interfaces across all apps
│   ├── db/                        # Drizzle ORM schema, migrations & DB client
│   │   └── src/schema/            # rawEvents, incidents, steps, approvals, memory, runbooks
│   ├── queue/                     # BullMQ queue descriptors & job payload definitions
│   └── logger/                    # Unified structured JSON logger (Pino)
│
├── infrastructure/                # Container orchestration & configs
│   ├── docker-compose.yml         # Production multi-service orchestration
│   ├── docker-compose.dev.yml     # Local development setup with live reload
│   ├── nginx/nginx.conf           # Unified reverse proxy entry point (Port 80)
│   └── postgres/init.sql          # Extension initialization (pgvector, uuid-ossp)
│
├── scripts/                       # Operational & utility scripts
│   ├── seed-runbooks.ts           # RAG vector database initialization
│   └── simulate-incident.ts       # Synthetic chaos engine for local testing
│
├── turbo.json                     # Turborepo build & caching pipelines
├── pnpm-workspace.yaml            # Monorepo workspace declarations
└── package.json                   # Root scripts & dev dependencies
```

---

## 6. Network & Port Mapping

When running locally or via Docker Compose, services are mapped to the following standard ports:

| Service | Port | Description |
| :--- | :--- | :--- |
| **Nginx Reverse Proxy** | `80` | Unified gateway routing web traffic and external webhooks to internal services. |
| **`web` (Next.js)** | `3000` | Operator Dashboard and approval control plane. |
| **`ingestion-service`** | `3001` | Telemetry intake, webhooks, and polling pipelines. |
| **`agent-service`** | `3002` | Worker pool health endpoints and internal agent metrics. |
| **`api-service`** | `3003` | REST API endpoints, internal triggers, and SSE real-time streams. |
| **`anomaly-service`** | `8000` | Python FastAPI signal processing and ML scoring server. |
| **PostgreSQL (`pgvector`)** | `5432` | Primary relational database and high-dimensional vector store. |
| **Redis** | `6379` | BullMQ job queue storage, task state, and distributed locking. |

---

## 7. Getting Started & Local Development

### Prerequisites
* **Node.js**: `v20.x` or higher
* **pnpm**: `v9.x` (`npm install -g pnpm`)
* **Python**: `3.11+` (for `anomaly-service` local development)
* **Docker & Docker Compose**: Required for running local PostgreSQL (`pgvector`) and Redis containers.
* **Anthropic API Key**: Required for Claude reasoning (`ANTHROPIC_API_KEY`).

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/SoloDevAbu/OperonAI.git
cd OperonAI

# Install all workspace dependencies across Node.js services and packages
pnpm install
```

### Step 2: Environment Configuration
Copy the sample environment file to the root:
```bash
cp .env.example .env
```
Ensure the following core keys are populated in your `.env` file:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/operon_ai
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-api03-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
```

### Step 3: Start Infrastructure Services
Launch PostgreSQL (with `pgvector` pre-configured via `init.sql`) and Redis:
```bash
docker-compose -f infrastructure/docker-compose.dev.yml up -d postgres redis
```

### Step 4: Run Database Migrations & Seed RAG Runbooks
Push the Drizzle schema to your local database and seed standard incident runbooks with embeddings:
```bash
# Push Drizzle ORM schema to Postgres
pnpm --filter @operonai/db run db:push

# Seed vector embeddings for default troubleshooting runbooks
pnpm run seed:runbooks
```

### Step 5: Launch the Polyglot Monorepo
Use Turborepo to start all Node.js and Python microservices with live reload enabled simultaneously:
```bash
pnpm dev
```
* The **Operator Dashboard** will be live at: [http://localhost:3000](http://localhost:3000)
* The **API Service** docs will be live at: [http://localhost:3003](http://localhost:3003)

### Step 6: Simulate a Live Anomaly & Investigation
To test the autonomous self-healing loop locally, run the built-in chaos simulation script:
```bash
# Triggers a synthetic memory leak & database connection exhaustion event
pnpm run simulate:incident
```
1. Watch the event flow through `ingestion-service` (`3001`) and get scored by `anomaly-service` (`8000`).
2. Open the **Next.js Dashboard (`http://localhost:3000`)** to see the new incident appear via real-time SSE.
3. Observe Claude (`agent-service` on `3002`) execute diagnostic tools, query similar past incidents (`pgvector`), and pause at the **Approval Gate** when attempting to restart the affected worker.
4. Click **Approve** on the dashboard modal to watch Claude resume execution and document the complete **Root Cause Analysis (RCA)**!

---

## License
Proprietary & Confidential — **OperonAI** / SoloDevAbu. All rights reserved.
