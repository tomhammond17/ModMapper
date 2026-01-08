import { useReducer, useCallback, useRef } from "react";
import { parseSSEStream } from "@/lib/sse-parser";
import type { ConversionResult, ModbusRegister } from "@shared/schema";

export type ConversionStep = "upload" | "pageIdentify" | "converting" | "preview";

interface ProcessingState {
  step: ConversionStep;
  progress: number;
  statusMessage: string;
  isProcessing: boolean;
  startTime: number;
}

/**
 * Check if an error is an AbortError (from cancellation)
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

type ProcessingAction =
  | { type: "START_PROCESSING"; message?: string }
  | { type: "UPDATE_PROGRESS"; progress: number; message: string }
  | { type: "COMPLETE" }
  | { type: "ERROR" }
  | { type: "SET_STEP"; step: ConversionStep }
  | { type: "RESET" };

const initialState: ProcessingState = {
  step: "upload",
  progress: 0,
  statusMessage: "",
  isProcessing: false,
  startTime: 0,
};

function processingReducer(state: ProcessingState, action: ProcessingAction): ProcessingState {
  switch (action.type) {
    case "START_PROCESSING":
      return {
        ...state,
        step: "converting",
        progress: 10,
        statusMessage: action.message || "Processing...",
        isProcessing: true,
        startTime: Date.now(),
      };
    case "UPDATE_PROGRESS":
      return {
        ...state,
        progress: action.progress,
        statusMessage: action.message,
      };
    case "COMPLETE":
      return {
        ...state,
        step: "preview",
        progress: 100,
        statusMessage: "Complete!",
        isProcessing: false,
      };
    case "ERROR":
      return {
        ...state,
        step: "upload",
        progress: 0,
        statusMessage: "",
        isProcessing: false,
      };
    case "SET_STEP":
      return {
        ...state,
        step: action.step,
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export interface UsePdfProcessingResult {
  state: ProcessingState;
  parsePdfWithProgress: (
    file: File,
    pageRanges?: string,
    existingRegisters?: ModbusRegister[]
  ) => Promise<ConversionResult | null>;
  setStep: (step: ConversionStep) => void;
  reset: () => void;
  /** Cancel the current PDF processing operation */
  cancel: () => void;
}

export function usePdfProcessing(): UsePdfProcessingResult {
  const [state, dispatch] = useReducer(processingReducer, initialState);
  
  // AbortController reference for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const parsePdfWithProgress = useCallback(
    async (
      file: File,
      pageRanges?: string,
      existingRegisters?: ModbusRegister[]
    ): Promise<ConversionResult | null> => {
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      dispatch({ type: "START_PROCESSING", message: "Uploading PDF..." });

      try {
        const formData = new FormData();
        formData.append("file", file);

        const endpoint = pageRanges
          ? "/api/parse-pdf-with-hints"
          : "/api/parse-pdf-stream";

        if (pageRanges) {
          formData.append("pageRanges", pageRanges);
          formData.append(
            "existingRegisters",
            JSON.stringify(existingRegisters || [])
          );
        }

        const response = await fetch(endpoint, {
          method: "POST",
          body: formData,
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to parse PDF");
        }

        let result: ConversionResult | null = null;

        await parseSSEStream<ConversionResult>(response, {
          onProgress: (progress, message) => {
            dispatch({ type: "UPDATE_PROGRESS", progress, message });
          },
          onComplete: (data) => {
            result = data;
            dispatch({ type: "COMPLETE" });
          },
          onError: (error) => {
            throw error;
          },
        });

        return result;
      } catch (error) {
        // Handle abort errors gracefully
        if (isAbortError(error)) {
          dispatch({ type: "ERROR" });
          return null;
        }
        dispatch({ type: "ERROR" });
        throw error;
      } finally {
        abortControllerRef.current = null;
      }
    },
    []
  );
  
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const setStep = useCallback((step: ConversionStep) => {
    dispatch({ type: "SET_STEP", step });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return {
    state,
    parsePdfWithProgress,
    setStep,
    reset,
    cancel,
  };
}
