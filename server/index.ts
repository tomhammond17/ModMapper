// IMPORTANT: Import polyfills FIRST before any other imports
// This ensures DOMMatrix is available before pdfjs-dist loads
import "./pdf-parser/polyfills";

import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerSSERoutes, registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { logger, logRequest } from "./logger";

const app = express();

// Trust first proxy (required for Replit and other proxy environments)
// This ensures express-rate-limit correctly identifies clients via X-Forwarded-For header
app.set("trust proxy", 1);

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
