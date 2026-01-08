import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("usePdfProcessing hook", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("cancel function", () => {
    it("should expose a cancel function", async () => {
      const { usePdfProcessing } = await import("../use-pdf-processing");
      const { result } = renderHook(() => usePdfProcessing());

      expect(result.current.cancel).toBeDefined();
      expect(typeof result.current.cancel).toBe("function");
    });

    it("should not be cancellable when not processing", async () => {
      const { usePdfProcessing } = await import("../use-pdf-processing");
      const { result } = renderHook(() => usePdfProcessing());

      // Initially should not be cancellable
      expect(result.current.state.isProcessing).toBe(false);
    });

    it("should abort the request when cancel is called", async () => {
      const { usePdfProcessing } = await import("../use-pdf-processing");
      
      // Mock a response that takes time
      let abortSignal: AbortSignal | undefined;
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        abortSignal = options?.signal;
        return new Promise((resolve) => {
          // Simulate a slow response
          setTimeout(() => {
            resolve({
              ok: true,
              body: {
                getReader: () => ({
                  read: () => Promise.resolve({ done: true }),
                }),
              },
            });
          }, 1000);
        });
      });

      const { result } = renderHook(() => usePdfProcessing());

      // Start processing
      const file = new File(["test content"], "test.pdf", { type: "application/pdf" });
      
      act(() => {
        result.current.parsePdfWithProgress(file).catch(() => {
          // Expected to throw on abort
        });
      });

      // Wait for processing to start
      await waitFor(() => {
        expect(result.current.state.isProcessing).toBe(true);
      }, { timeout: 100 }).catch(() => {});

      // Cancel the request
      act(() => {
        result.current.cancel();
      });

      // The abort signal should have been triggered
      expect(abortSignal?.aborted).toBe(true);
    });

    it("should reset state after cancellation", async () => {
      const { usePdfProcessing } = await import("../use-pdf-processing");
      
      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

      const { result } = renderHook(() => usePdfProcessing());

      const file = new File(["test content"], "test.pdf", { type: "application/pdf" });
      
      // Start and cancel
      await act(async () => {
        try {
          await result.current.parsePdfWithProgress(file);
        } catch {
          // Expected
        }
      });

      // State should be reset
      expect(result.current.state.step).toBe("upload");
    });
  });

  describe("processing state", () => {
    it("should track processing state", async () => {
      const { usePdfProcessing } = await import("../use-pdf-processing");
      const { result } = renderHook(() => usePdfProcessing());

      expect(result.current.state.step).toBe("upload");
      expect(result.current.state.isProcessing).toBe(false);
      expect(result.current.state.progress).toBe(0);
    });

    it("should provide setStep function", async () => {
      const { usePdfProcessing } = await import("../use-pdf-processing");
      const { result } = renderHook(() => usePdfProcessing());

      act(() => {
        result.current.setStep("pageIdentify");
      });

      expect(result.current.state.step).toBe("pageIdentify");
    });

    it("should provide reset function", async () => {
      const { usePdfProcessing } = await import("../use-pdf-processing");
      const { result } = renderHook(() => usePdfProcessing());

      // Change state
      act(() => {
        result.current.setStep("preview");
      });

      expect(result.current.state.step).toBe("preview");

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.state.step).toBe("upload");
    });
  });
});

