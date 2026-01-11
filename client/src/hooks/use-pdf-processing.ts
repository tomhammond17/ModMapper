import { useReducer, useCallback, useRef } from "react";
import { type SSEProgressData } from "@/lib/sse-parser";
import { apiEndpoints } from "@/lib/api";
import type { ConversionResult, ModbusRegister } from "@shared/schema";

export type ConversionStep = "upload" | "pageIdentify" | "converting" | "preview";

export type ProcessingStage = "uploading" | "extracting" | "scoring" | "analyzing" | "parsing" | "complete" | "error";

interface ProcessingState {
  step: ConversionStep;
  progress: number;
  statusMessage: string;
  isProcessing: boolean;
  startTime: number;
  stage: ProcessingStage;
  totalBatches: number;
  currentBatch: number;
  totalPages: number;
  pagesProcessed: number;
}

/**
 * Check if an error is an AbortError (from cancellation)
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

type ProcessingAction =
  | { type: "START_PROCESSING"; message?: string }
  | { type: "UPDATE_PROGRESS"; progress: number; message: string; extra?: SSEProgressData }
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
  stage: "uploading",
  totalBatches: 0,
  currentBatch: 0,
  totalPages: 0,
  pagesProcessed: 0,
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
        stage: "uploading",
        totalBatches: 0,
        currentBatch: 0,
        totalPages: 0,
        pagesProcessed: 0,
      };
    case "UPDATE_PROGRESS":
      return {
        ...state,
        progress: action.progress,
        statusMessage: action.message,
        stage: (action.extra?.stage as ProcessingStage) || state.stage,
        totalBatches: action.extra?.totalBatches ?? state.totalBatches,
        currentBatch: action.extra?.currentBatch ?? state.currentBatch,
        totalPages: action.extra?.totalPages ?? state.totalPages,
        pagesProcessed: action.extra?.pagesProcessed ?? state.pagesProcessed,
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
  
  // EventSource reference for cancellation
  const eventSourceRef = useRef<EventSource | null>(null);
  // AbortController for upload cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const parsePdfWithProgress = useCallback(
    async (
      file: File,
      pageRanges?: string,
      existingRegisters?: ModbusRegister[]
    ): Promise<ConversionResult | null> => {
      // Create new abort controller for upload
      abortControllerRef.current = new AbortController();
      
      dispatch({ type: "START_PROCESSING", message: "Uploading PDF..." });

      try {
        // Step 1: Upload the file
        const formData = new FormData();
        formData.append("file", file);

        if (pageRanges) {
          formData.append("pageRanges", pageRanges);
          formData.append(
            "existingRegisters",
            JSON.stringify(existingRegisters || [])
          );
        }

        const uploadResponse = await fetch(apiEndpoints.uploadPdf, {
          method: "POST",
          body: formData,
          signal: abortControllerRef.current.signal,
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.message || "Failed to upload PDF");
        }

        const uploadResult = await uploadResponse.json();
        const { fileId } = uploadResult;
        
        console.debug("[PDF] File uploaded, starting EventSource", { fileId });

        // Step 2: Connect via EventSource for real-time progress
        return new Promise<ConversionResult | null>((resolve, reject) => {
          const eventSource = new EventSource(apiEndpoints.processPdf(fileId));
          eventSourceRef.current = eventSource;
          
          let result: ConversionResult | null = null;

          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              console.debug("[SSE]", data.type, data.type === "progress" ? { stage: data.stage, progress: data.progress } : "");

              if (data.type === "progress") {
                dispatch({ 
                  type: "UPDATE_PROGRESS", 
                  progress: data.progress, 
                  message: data.message,
                  extra: {
                    stage: data.stage,
                    totalBatches: data.totalBatches,
                    currentBatch: data.currentBatch,
                    totalPages: data.totalPages,
                    pagesProcessed: data.pagesProcessed,
                  }
                });
              } else if (data.type === "complete") {
                result = data.result;
                dispatch({ type: "COMPLETE" });
                eventSource.close();
                eventSourceRef.current = null;
                resolve(result);
              } else if (data.type === "error") {
                eventSource.close();
                eventSourceRef.current = null;
                dispatch({ type: "ERROR" });
                reject(new Error(data.message));
              }
            } catch (e) {
              console.error("[SSE] Parse error:", e);
            }
          };

          eventSource.onerror = (event) => {
            console.error("[SSE] EventSource error:", event);
            eventSource.close();
            eventSourceRef.current = null;
            dispatch({ type: "ERROR" });
            reject(new Error("Connection to server lost"));
          };
        });
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
    // Cancel upload if in progress
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Close EventSource if connected
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    dispatch({ type: "ERROR" });
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
