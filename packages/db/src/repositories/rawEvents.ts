import type { Database } from "../client"
import { rawEvents, type NewRawEventRow } from "../schema"

/** Batch-insert raw events into the database. */
export const insertRawEvents = async (
  db: Database,
  rows: NewRawEventRow[]
) => {
  if (rows.length === 0) return
  await db.insert(rawEvents).values(rows)
}
