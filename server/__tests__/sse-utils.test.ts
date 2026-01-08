import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSSEConnection, SSE_CONFIG } from "../sse-utils";
import type { Response } from "express";

// Mock Response object
function createMockResponse(): Response & {
  writtenData: string[];
  headers: Record<string, string>;
  simulateClose: () => void;
  ended: boolean;
} {
  const writtenData: string[] = [];
  const headers: Record<string, string> = {};
  let closeCallback: (() => void) | null = null;
  let ended = false;

  const mockRes = {
    writtenData,
    headers,
    ended,
    simulateClose: () => {
      if (closeCallback) {
        closeCallback();
      }
    },
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    flushHeaders: vi.fn(),
    write: vi.fn((data: string) => {
      if (!ended) {
        writtenData.push(data);
      }
      return true;
    }),
    end: vi.fn(() => {
      ended = true;
    }),
    on: vi.fn((event: string, callback: () => void) => {
      if (event === "close") {
        closeCallback = callback;
      }
    }),
  };

  return mockRes as unknown as Response & {
    writtenData: string[];
    headers: Record<string, string>;
    simulateClose: () => void;
    ended: boolean;
  };
}

describe("SSE Utils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createSSEConnection", () => {
    it("should set correct SSE headers", () => {
      const mockRes = createMockResponse();
      createSSEConnection(mockRes);

      expect(mockRes.headers["Content-Type"]).toBe("text/event-stream");
      expect(mockRes.headers["Cache-Control"]).toBe("no-cache");
      expect(mockRes.headers["Connection"]).toBe("keep-alive");
      expect(mockRes.flushHeaders).toHaveBeenCalled();
    });

    it("should send progress messages correctly", () => {
      const mockRes = createMockResponse();
      const sse = createSSEConnection(mockRes);

      sse.sendProgress(50, "Processing...", "Page 5 of 10");

      expect(mockRes.writtenData.length).toBe(1);
      const data = JSON.parse(mockRes.writtenData[0].replace("data: ", "").replace("\n\n", ""));
      expect(data.type).toBe("progress");
      expect(data.progress).toBe(50);
      expect(data.message).toBe("Processing...");
      expect(data.details).toBe("Page 5 of 10");
    });

    it("should send complete messages and end connection", () => {
      const mockRes = createMockResponse();
      const sse = createSSEConnection(mockRes);

      const result = { success: true, registers: [] };
      sse.sendComplete(result);

      expect(mockRes.writtenData.length).toBe(1);
      const data = JSON.parse(mockRes.writtenData[0].replace("data: ", "").replace("\n\n", ""));
      expect(data.type).toBe("complete");
      expect(data.result).toEqual(result);
      expect(mockRes.end).toHaveBeenCalled();
    });

    it("should send error messages and end connection", () => {
      const mockRes = createMockResponse();
      const sse = createSSEConnection(mockRes);

      sse.sendError("Something went wrong");

      expect(mockRes.writtenData.length).toBe(1);
      const data = JSON.parse(mockRes.writtenData[0].replace("data: ", "").replace("\n\n", ""));
      expect(data.type).toBe("error");
      expect(data.message).toBe("Something went wrong");
      expect(mockRes.end).toHaveBeenCalled();
    });

    it("should report isActive correctly", () => {
      const mockRes = createMockResponse();
      const sse = createSSEConnection(mockRes);

      expect(sse.isActive()).toBe(true);

      sse.end();

      expect(sse.isActive()).toBe(false);
    });

    it("should send heartbeat every 30 seconds", () => {
      const mockRes = createMockResponse();
      createSSEConnection(mockRes);

      // Initial state - no heartbeat yet
      expect(mockRes.writtenData.length).toBe(0);

      // Advance 30 seconds
      vi.advanceTimersByTime(30 * 1000);

      // Should have sent one heartbeat
      expect(mockRes.writtenData.length).toBe(1);
      expect(mockRes.writtenData[0]).toBe(": heartbeat\n\n");

      // Advance another 30 seconds
      vi.advanceTimersByTime(30 * 1000);

      // Should have sent two heartbeats
      expect(mockRes.writtenData.length).toBe(2);
    });

    it("should timeout after default timeout period", () => {
      const mockRes = createMockResponse();
      const onTimeout = vi.fn();
      createSSEConnection(mockRes, { onTimeout });

      // Advance to just before timeout (5 minutes - 1 second)
      vi.advanceTimersByTime(SSE_CONFIG.DEFAULT_TIMEOUT_MS - 1000);
      expect(onTimeout).not.toHaveBeenCalled();

      // Advance past timeout
      vi.advanceTimersByTime(2000);

      // Should have called onTimeout and sent error
      expect(onTimeout).toHaveBeenCalled();
      expect(mockRes.end).toHaveBeenCalled();

      // Find the timeout error message
      const errorMessage = mockRes.writtenData.find((d) => d.includes("timed out"));
      expect(errorMessage).toBeDefined();
    });

    it("should use custom timeout when provided", () => {
      const mockRes = createMockResponse();
      const onTimeout = vi.fn();
      const customTimeout = 60 * 1000; // 1 minute

      createSSEConnection(mockRes, { timeoutMs: customTimeout, onTimeout });

      // Advance 30 seconds
      vi.advanceTimersByTime(30 * 1000);
      expect(onTimeout).not.toHaveBeenCalled();

      // Advance past custom timeout
      vi.advanceTimersByTime(31 * 1000);
      expect(onTimeout).toHaveBeenCalled();
    });

    it("should cleanup on client disconnect", () => {
      const mockRes = createMockResponse();
      const onClose = vi.fn();
      const sse = createSSEConnection(mockRes, { onClose });

      // Simulate client disconnect
      mockRes.simulateClose();

      expect(onClose).toHaveBeenCalled();
      expect(sse.isActive()).toBe(false);
    });

    it("should not send messages after connection ends", () => {
      const mockRes = createMockResponse();
      const sse = createSSEConnection(mockRes);

      sse.end();
      const initialCount = mockRes.writtenData.length;

      // Try to send more messages
      sse.sendProgress(50, "Test");
      sse.sendComplete({ data: "test" });
      sse.sendError("Error");

      // Should not have written any more data
      expect(mockRes.writtenData.length).toBe(initialCount);
    });
  });

  describe("SSE_CONFIG", () => {
    it("should export default timeout value", () => {
      expect(SSE_CONFIG.DEFAULT_TIMEOUT_MS).toBe(5 * 60 * 1000); // 5 minutes
    });

    it("should export heartbeat interval value", () => {
      expect(SSE_CONFIG.HEARTBEAT_INTERVAL_MS).toBe(30 * 1000); // 30 seconds
    });
  });
});

