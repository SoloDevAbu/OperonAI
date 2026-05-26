import { createDb, closeDb } from "@operonai/db";

const { db, pool } = createDb();

export { db, pool, closeDb };
export type { Database } from "@operonai/db";
