/**
 * Structured logging module using Winston.
 * 
 * Provides consistent, structured logging across the server application.
 * Supports different log levels, child loggers for modules, and
 * environment-aware formatting (colorized for dev, JSON for prod).
 */

import winston from "winston";

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for development - human readable with colors
const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  printf(({ level, message, timestamp, module, ...meta }) => {
    const moduleTag = module ? `[${module}]` : "[server]";
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${level} ${moduleTag} ${message}${metaStr}`;
  })
);

// JSON format for production - structured, machine-parseable
const prodFormat = combine(
  timestamp(),
  json()
);

// Determine format based on environment
const isProduction = process.env.NODE_ENV === "production";

/**
 * Main logger instance.
 * Use this for general server logging, or create child loggers for modules.
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { module: "server" },
  transports: [
    new winston.transports.Console()
  ],
});

/**
 * Create a child logger with module context.
 * 
 * @param moduleName - The name of the module (e.g., "pdf-parser", "routes")
 * @returns A child logger with the module name in metadata
 * 
 * @example
 * const log = createLogger("pdf-parser");
 * log.info("Processing PDF", { pages: 50 });
 */
export function createLogger(moduleName: string): winston.Logger {
  return logger.child({ module: moduleName });
}

/**
 * Log an HTTP request with structured metadata.
 * 
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path
 * @param status - HTTP status code
 * @param duration - Request duration in milliseconds
 * @param response - Optional response body for logging
 */
export function logRequest(
  method: string,
  path: string,
  status: number,
  duration: number,
  response?: Record<string, unknown>
): void {
  const meta: Record<string, unknown> = {
    method,
    path,
    status,
    duration,
  };

  if (response) {
    meta.response = response;
  }

  logger.info(`${method} ${path} ${status} in ${duration}ms`, meta);
}

export default logger;

