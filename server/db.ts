import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    db = drizzle(pool, { schema });
  }
  return db;
}

export function isDatabaseAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}
