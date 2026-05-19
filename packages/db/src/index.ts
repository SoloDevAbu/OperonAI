import { drizzle as drizzleNode } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const DATABASE_URL = process.env.DATABASE_URL!

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set")
}

const db = drizzleNode({
  client: new Pool({
    connectionString: DATABASE_URL,
    max: 50,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  }),
  schema,
})

export { db }
export * from "./schema"
