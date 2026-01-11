/**
 * Service helper utilities for reducing boilerplate across service files.
 *
 * Provides utilities for:
 * - Database availability checks
 * - Error handling with logging
 * - Common query patterns
 */

import { getDb, isDatabaseAvailable } from "../db";
import type { Logger } from "winston";

// Re-export the database type for convenience
export type DbClient = ReturnType<typeof getDb>;

/**
 * Get the database client, throwing if database is not available.
 * Replaces the repeated pattern:
 * ```
 * if (!isDatabaseAvailable()) {
 *   throw new Error("Database not available");
 * }
 * const db = getDb();
 * ```
 *
 * @throws Error if DATABASE_URL is not configured
 * @returns The Drizzle database client
 */
export function requireDb(): DbClient {
  if (!isDatabaseAvailable()) {
    throw new Error("Database not available");
  }
  return getDb();
}

/**
 * Execute a database operation with a fallback for when database is not available.
 * Use this for read operations that can gracefully degrade.
 *
 * @param defaultValue - Value to return if database is not available
 * @param fn - Async function that receives the database client
 * @returns Result of fn or defaultValue if database is unavailable
 *
 * @example
 * const users = await withDbOrDefault([], async (db) => {
 *   return db.select().from(usersTable);
 * });
 */
export async function withDbOrDefault<T>(
  defaultValue: T,
  fn: (db: DbClient) => Promise<T>
): Promise<T> {
  if (!isDatabaseAvailable()) {
    return defaultValue;
  }
  return fn(getDb());
}

/**
 * Execute an async operation with standardized error logging.
 * Replaces the repeated try-catch pattern:
 * ```
 * try {
 *   // operation
 * } catch (error) {
 *   log.error("Failed to X", { error, ...context });
 *   throw error;
 * }
 * ```
 *
 * @param log - Logger instance
 * @param operation - Description of the operation (e.g., "create folder")
 * @param context - Additional context to include in error logs
 * @param fn - Async function to execute
 * @returns Result of fn
 * @throws Re-throws any error after logging
 *
 * @example
 * return withErrorLogging(log, "create folder", { userId, name }, async () => {
 *   const db = requireDb();
 *   return db.insert(folders).values({ ... });
 * });
 */
export async function withErrorLogging<T>(
  log: Logger,
  operation: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    log.error(`Failed to ${operation}`, {
      error: error instanceof Error ? error.message : String(error),
      ...context,
    });
    throw error;
  }
}

/**
 * Extract a user-friendly error message from an unknown error.
 *
 * @param error - The caught error
 * @param fallback - Default message if error is not an Error instance
 * @returns Error message string
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Format a page range for display.
 *
 * @param pageNums - Array of page numbers
 * @returns Formatted string like "1" or "1-5"
 */
export function formatPageRange(pageNums: number[]): string {
  if (pageNums.length === 0) return "";
  if (pageNums.length === 1) return String(pageNums[0]);
  return `${pageNums[0]}-${pageNums[pageNums.length - 1]}`;
}
