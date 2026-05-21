import { Queue, Worker, QueueEvents, type Processor } from "bullmq"
import type { ConnectionOptions } from "bullmq"
import type { InvestigationJobData, InvestigationJobResult } from "../jobs/types"

export const INVESTIGATION_QUEUE_NAME = "investigation"

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
  removeOnComplete: {
    age: 7 * 24 * 60 * 60, // 7 days in seconds
    count: 1000,
  },
  removeOnFail: {
    age: 30 * 24 * 60 * 60, // 30 days in seconds
  },
}

export const createInvestigationQueue = (connection: ConnectionOptions) => {
  return new Queue<InvestigationJobData, InvestigationJobResult>(
    INVESTIGATION_QUEUE_NAME,
    {
      connection,
      defaultJobOptions,
    }
  )
}

export const createInvestigationWorker = (
  connection: ConnectionOptions,
  processor: Processor<InvestigationJobData, InvestigationJobResult>
) => {
  return new Worker<InvestigationJobData, InvestigationJobResult>(
    INVESTIGATION_QUEUE_NAME,
    processor,
    {
      connection,
      concurrency: 5,
      lockDuration: 2 * 60 * 1000, // 2 minutes
    }
  )
}

export const createInvestigationQueueEvents = (connection: ConnectionOptions) => {
    return new QueueEvents(INVESTIGATION_QUEUE_NAME, {
        connection,
    })
}