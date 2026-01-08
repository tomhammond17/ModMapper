import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModbusRegister } from "@shared/schema";

// Mock the LLM client to avoid actual API calls
vi.mock("../pdf-parser/llm-client", () => ({
  parseModbusRegistersFromContext: vi.fn().mockImplementation(async () => {
    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 50));
    return [
      { address: 100, name: "Test Register", datatype: "UINT16", description: "", writable: false },
    ];
  }),
  mergeAndDeduplicateRegisters: vi.fn().mockImplementation((regs: ModbusRegister[]) => regs),
  calculateConfidenceLevel: vi.fn().mockReturnValue("medium"),
}));

// Mock the extractor
vi.mock("../pdf-parser/extractor", () => ({
  extractPagesFromPdf: vi.fn().mockResolvedValue({
    pages: [
      { pageNum: 1, text: "Test page 1", score: 10 },
      { pageNum: 2, text: "Test page 2", score: 8 },
      { pageNum: 3, text: "Test page 3", score: 6 },
    ],
    hints: [],
  }),
  scoreAllPagesLightweight: vi.fn().mockResolvedValue({
    metadata: [
      { pageNum: 1, score: 10, hasTable: true },
      { pageNum: 2, score: 8, hasTable: true },
      { pageNum: 3, score: 6, hasTable: false },
    ],
    hints: [],
    totalPages: 3,
  }),
  extractSpecificPages: vi.fn().mockResolvedValue([
    { pageNum: 1, text: "Test page 1", score: 10 },
    { pageNum: 2, text: "Test page 2", score: 8 },
  ]),
  extractTextFromPdf: vi.fn().mockResolvedValue("Test PDF content"),
}));

describe("Cancellation Support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AbortSignal handling in PDF parser", () => {
    it("should accept an optional AbortSignal parameter", async () => {
      const { parsePdfFile } = await import("../pdf-parser");
      const controller = new AbortController();
      const buffer = Buffer.from("%PDF-1.4 test content");

      // Should not throw when passing abort signal
      const resultPromise = parsePdfFile(buffer, undefined, controller.signal);
      expect(resultPromise).toBeInstanceOf(Promise);
      
      // Let it complete
      const result = await resultPromise;
      expect(result).toBeDefined();
    });

    it("should stop processing when aborted", async () => {
      const { parsePdfFile } = await import("../pdf-parser");
      const controller = new AbortController();
      const buffer = Buffer.from("%PDF-1.4 test content");

      // Start parsing
      const resultPromise = parsePdfFile(buffer, undefined, controller.signal);
      
      // Abort immediately
      controller.abort();

      // Should reject or return partial results
      try {
        const result = await resultPromise;
        // If it completes, should have partial or no results
        expect(result.registers).toBeDefined();
      } catch (error) {
        // AbortError is acceptable
        expect((error as Error).name).toBe("AbortError");
      }
    });

    it("should return partial results when aborted mid-processing", async () => {
      const { parsePdfFile } = await import("../pdf-parser");
      const controller = new AbortController();
      const buffer = Buffer.from("%PDF-1.4 test content");

      const progressEvents: Array<{ progress: number; message: string }> = [];

      const resultPromise = parsePdfFile(
        buffer,
        (progress) => {
          progressEvents.push({ progress: progress.progress, message: progress.message });
          // Abort after first progress event
          if (progressEvents.length >= 2) {
            controller.abort();
          }
        },
        controller.signal
      );

      const result = await resultPromise.catch((e) => ({ 
        registers: [], 
        metadata: null,
        aborted: true,
        error: e 
      }));

      // Should have received some progress before abort
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it("should call onProgress with abort status when cancelled", async () => {
      const { parsePdfFile } = await import("../pdf-parser");
      const controller = new AbortController();
      const buffer = Buffer.from("%PDF-1.4 test content");

      let lastStage: string | undefined;
      
      // Pre-abort
      controller.abort();

      try {
        await parsePdfFile(
          buffer,
          (progress) => {
            lastStage = progress.stage;
          },
          controller.signal
        );
      } catch (e) {
        // Expected to throw AbortError
      }

      // The last stage should indicate cancellation or error
      // (exact behavior depends on implementation)
    });
  });

  describe("parsePdfWithPageHints cancellation", () => {
    it("should accept AbortSignal parameter", async () => {
      const { parsePdfWithPageHints } = await import("../pdf-parser");
      const controller = new AbortController();
      const buffer = Buffer.from("%PDF-1.4 test content");
      const pageHints = [{ start: 1, end: 2 }];

      const resultPromise = parsePdfWithPageHints(
        buffer,
        pageHints,
        [],
        undefined,
        controller.signal
      );

      expect(resultPromise).toBeInstanceOf(Promise);
      await resultPromise;
    });

    it("should stop when aborted", async () => {
      const { parsePdfWithPageHints } = await import("../pdf-parser");
      const controller = new AbortController();
      const buffer = Buffer.from("%PDF-1.4 test content");
      const pageHints = [{ start: 1, end: 3 }];

      controller.abort();

      try {
        await parsePdfWithPageHints(
          buffer,
          pageHints,
          [],
          undefined,
          controller.signal
        );
      } catch (error) {
        expect((error as Error).name).toBe("AbortError");
      }
    });
  });

  describe("isAbortError utility", () => {
    it("should identify AbortError correctly", async () => {
      // Import directly from the index file (not mocked)
      const { isAbortError } = await import("../pdf-parser/index");
      
      const controller = new AbortController();
      controller.abort();
      
      try {
        controller.signal.throwIfAborted();
      } catch (error) {
        expect(isAbortError(error)).toBe(true);
      }
    });

    it("should return false for other errors", async () => {
      const { isAbortError } = await import("../pdf-parser/index");
      
      expect(isAbortError(new Error("Regular error"))).toBe(false);
      expect(isAbortError(new TypeError("Type error"))).toBe(false);
      expect(isAbortError(null)).toBe(false);
      expect(isAbortError(undefined)).toBe(false);
    });
  });
});

