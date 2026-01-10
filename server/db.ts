import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { createLogger } from "./logger";
import { withRetry } from "./utils/retry";

const log = createLogger("database");

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let pool: Pool | null = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

export function getDb() {
  if (!db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }

    if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
      throw new Error(`Failed to connect to database after ${MAX_CONNECTION_ATTEMPTS} attempts`);
    }

    try {
      connectionAttempts++;

      // Configure connection pool
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20, // Maximum pool size
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection cannot be established
      });

      // Handle pool errors
      pool.on('error', (err) => {
        log.error('Unexpected database pool error', { error: err.message });
      });

      db = drizzle(pool, { schema });
      log.info("Database connection established", { attempt: connectionAttempts });
      connectionAttempts = 0; // Reset on success
    } catch (error) {
      log.error("Database connection failed", {
        attempt: connectionAttempts,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  return db;
}

export function isDatabaseAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * Check database connection health
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false; // Using in-memory storage
  }

  try {
    const db = getDb();
    // Simple query to test connection
    await db.execute('SELECT 1');
    return true;
  } catch (error) {
    log.error("Database health check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    db = null;
    pool = null;
    log.info("Database connection closed");
  }
}

