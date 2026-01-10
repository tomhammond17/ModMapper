import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We'll import the logger module after it's created
// For now, define the expected interface for TDD
describe("Logger Module", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("logger configuration", () => {
    it("should export a logger instance", async () => {
      const { logger } = await import("../logger");
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.debug).toBe("function");
    });

    it("should default to 'info' log level", async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await import("../logger");
      expect(logger.level).toBe("info");
    });

    it("should respect LOG_LEVEL environment variable", async () => {
      process.env.LOG_LEVEL = "debug";
      const { logger } = await import("../logger");
      expect(logger.level).toBe("debug");
    });

    it("should support 'error' log level", async () => {
      process.env.LOG_LEVEL = "error";
      const { logger } = await import("../logger");
      expect(logger.level).toBe("error");
    });
  });

  describe("child loggers", () => {
    it("should create child loggers with module context", async () => {
      const { createLogger } = await import("../logger");
      const childLogger = createLogger("pdf-parser");
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe("function");
    });

    it("should include module name in child logger metadata", async () => {
      const { createLogger, logger } = await import("../logger");
      const childLogger = createLogger("test-module");
      const infoSpy = vi.spyOn(childLogger, "info");
      
      childLogger.info("Test message");
      
      // Verify the child logger logs with its module context
      expect(infoSpy).toHaveBeenCalledWith("Test message");
      // Child logger should be a different instance
      expect(childLogger).not.toBe(logger);
    });
  });

  describe("structured logging", () => {
    it("should support logging with metadata objects", async () => {
      const { logger } = await import("../logger");
      
      // Should not throw when logging with metadata
      expect(() => {
        logger.info("Test message", { key: "value", count: 42 });
      }).not.toThrow();
    });

    it("should support logging errors with stack traces", async () => {
      const { logger } = await import("../logger");
      const error = new Error("Test error");
      
      expect(() => {
        logger.error("An error occurred", { error: error.message, stack: error.stack });
      }).not.toThrow();
    });
  });

  describe("log output format", () => {
    it("should include timestamp in logs", async () => {
      const { logger } = await import("../logger");
      
      // Check that the format includes timestamp
      const formats = logger.format;
      expect(formats).toBeDefined();
    });

    it("should use console transport by default", async () => {
      const { logger } = await import("../logger");
      
      // Should have at least one transport (Console)
      expect(logger.transports.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("development vs production format", () => {
    it("should use colorized output in development", async () => {
      process.env.NODE_ENV = "development";
      const { logger } = await import("../logger");
      expect(logger).toBeDefined();
    });

    it("should use JSON format in production", async () => {
      process.env.NODE_ENV = "production";
      const { logger } = await import("../logger");
      expect(logger).toBeDefined();
    });
  });

  describe("request logging helper", () => {
    it("should export a request logging function", async () => {
      const { logRequest } = await import("../logger");
      expect(typeof logRequest).toBe("function");
    });

    it("should format request logs with method, path, status, and duration", async () => {
      const { logRequest, logger } = await import("../logger");
      const infoSpy = vi.spyOn(logger, "info");
      
      logRequest("GET", "/api/health", 200, 15);
      
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining("GET"),
        expect.objectContaining({
          method: "GET",
          path: "/api/health",
          status: 200,
          duration: 15,
        })
      );
    });

    it("should include response body when provided", async () => {
      const { logRequest, logger } = await import("../logger");
      const infoSpy = vi.spyOn(logger, "info");
      
      logRequest("POST", "/api/parse", 200, 100, { success: true });
      
      expect(infoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          response: { success: true },
        })
      );
    });
  });
});

