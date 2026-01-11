// IMPORTANT: Import polyfills FIRST before any other imports
// This ensures DOMMatrix is available before pdfjs-dist loads
import "./pdf-parser/polyfills";

// Validate environment variables before anything else
import { validateEnv } from "./config/env";
const env = validateEnv();

import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import { registerSSERoutes, registerRoutes } from "./routes";
import { registerAuthRoutes } from "./routes/auth";
import { registerBillingRoutes, handleStripeWebhook } from "./routes/billing";
import { registerFolderRoutes } from "./routes/folders";
import { registerVersionRoutes } from "./routes/versions";
import { registerTemplateRoutes } from "./routes/templates";
import { serveStatic } from "./static";
import { createServer } from "http";
import { logger, logRequest, createLogger } from "./logger";
import { createSessionMiddleware } from "./middleware/session";
import { initializeEmailService } from "./services/email";
import { getDb } from "./db";
import { Pool } from "pg";

const log = createLogger("server");

const app = express();

// Trust first proxy (required for Replit and other proxy environments)
// This ensures express-rate-limit correctly identifies clients via X-Forwarded-For header
app.set("trust proxy", 1);

// Security headers middleware - protect against common web vulnerabilities
app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for dynamic theming
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  } : false, // Disable CSP in development for HMR
  hsts: env.NODE_ENV === "production" ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  } : false,
  frameguard: { action: "deny" }, // Prevent clickjacking
  noSniff: true, // Prevent MIME sniffing
  xssFilter: true, // Enable XSS filter (legacy browsers)
}));

// CORS configuration - control which origins can access the API
// In development, allow all origins for easy testing on Replit
const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    // In development, allow all origins (Replit uses dynamic URLs)
    if (env.NODE_ENV !== "production") {
      return callback(null, true);
    }

    // In production, require explicit ALLOWED_ORIGINS configuration
    if (allowedOrigins.length === 0) {
      log.warn("CORS: No allowed origins configured in production", { origin });
      return callback(new Error("Not allowed by CORS - configure ALLOWED_ORIGINS"));
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      log.warn("CORS blocked request from unauthorized origin", { origin, allowedOrigins });
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS", "PATCH", "PUT"],
  allowedHeaders: ["Content-Type", "Accept"],
}));

// Initialize email service for authentication
initializeEmailService({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : undefined,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
});

// Session management middleware (must come before auth routes)
// Get database pool if DATABASE_URL is configured
let pool: Pool | undefined;
if (env.DATABASE_URL) {
  try {
    const db = getDb();
    // Access the pool from drizzle instance (this is a workaround)
    // In a real implementation, we'd export the pool from db.ts
    pool = (db as any)._.session?.client?.pool;
  } catch (error) {
    log.warn("Failed to get database pool for sessions", { error });
  }
}

app.use(createSessionMiddleware({
  sessionSecret: env.SESSION_SECRET,
  nodeEnv: env.NODE_ENV,
  pool,
}));

const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Request logging middleware using structured logger (before everything for accurate timing)
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      logRequest(req.method, path, res.statusCode, duration, capturedJsonResponse);
    }
  });

  next();
});

// Register Stripe webhook BEFORE JSON body parser (needs raw body)
// This route uses express.raw() internally for signature verification
app.use("/api/v1/billing/webhook", express.raw({ type: "application/json" }));
handleStripeWebhook(app);

// Parse JSON and urlencoded bodies for all routes
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

(async () => {
  // IMPORTANT: Register SSE routes BEFORE compression middleware
  // This ensures SSE responses are never wrapped by compression
  await registerSSERoutes(httpServer, app);

  // Enable gzip/deflate compression for non-SSE responses
  // Reduces transfer size for JSON, XML, CSV responses
  app.use(compression({
    threshold: 1024,
    level: 6,
  }));

  // Register authentication routes
  registerAuthRoutes(app, {
    appUrl: env.APP_URL,
    fromEmail: env.FROM_EMAIL || "noreply@modmapper.com",
  });

  // Register billing routes
  registerBillingRoutes(app, {
    appUrl: env.APP_URL,
  });

  // Register folder routes (Pro-only document organization)
  registerFolderRoutes(app);

  // Register version routes (Pro-only version control)
  registerVersionRoutes(app);

  // Register template routes (Pro-only custom export templates)
  registerTemplateRoutes(app);

  // Register remaining routes (after compression so they get compressed)
  await registerRoutes(httpServer, app);

  app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, () => {
    logger.info(`Server started`, { port, env: process.env.NODE_ENV || "development" });
  });
})();
