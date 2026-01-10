import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import type { Pool } from "pg";
import type { RequestHandler } from "express";
import { createLogger } from "../logger";

const log = createLogger("session");

const PgSession = ConnectPgSimple(session);

/**
 * Create session middleware with PostgreSQL storage
 */
export function createSessionMiddleware(config: {
  sessionSecret?: string;
  nodeEnv: string;
  pool?: Pool;
}): RequestHandler {
  const { sessionSecret, nodeEnv, pool } = config;

  if (!sessionSecret) {
    log.warn("SESSION_SECRET not configured - using in-memory sessions (not recommended for production)");
  }

  // Use PostgreSQL session store if pool is available, otherwise fall back to memory store
  const store = pool
    ? new PgSession({
        pool,
        tableName: "sessions",
        createTableIfMissing: false, // We manage schema with Drizzle
      })
    : undefined;

  if (store) {
    log.info("Using PostgreSQL session store");
  } else {
    log.warn("Using in-memory session store - sessions will not persist across server restarts");
  }

  return session({
    store,
    secret: sessionSecret || "fallback-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: nodeEnv === "production", // HTTPS only in production
      httpOnly: true, // Prevent XSS attacks
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax", // CSRF protection
    },
    name: "modmapper.sid", // Custom session cookie name
  });
}
