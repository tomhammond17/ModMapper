import type { Response } from "express";

// Default timeout for SSE connections (5 minutes)
const DEFAULT_SSE_TIMEOUT_MS = 5 * 60 * 1000;

// Heartbeat interval to keep connection alive (30 seconds)
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

export interface SSEProgressData {
  stage?: string;
  totalBatches?: number;
  currentBatch?: number;
  totalPages?: number;
  pagesProcessed?: number;
}

export interface SSEConnection {
  send: (event: string, data: Record<string, unknown>) => void;
  sendProgress: (progress: number, message: string, details?: string, extra?: SSEProgressData) => void;
  sendComplete: (result: unknown) => void;
  sendError: (message: string) => void;
  end: () => void;
  isActive: () => boolean;
}

export interface SSEOptions {
  timeoutMs?: number;
  onTimeout?: () => void;
  onClose?: () => void;
}

/**
 * Creates an SSE connection with built-in timeout and heartbeat.
 * 
 * - Sends heartbeat comments every 30s to keep connection alive
 * - Automatically closes connection after timeout (default 5 min)
 * - Cleans up resources when client disconnects
 */
export function createSSEConnection(
  res: Response,
  options: SSEOptions = {}
): SSEConnection {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SSE_TIMEOUT_MS;
  let isConnectionActive = true;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let timeoutTimer: NodeJS.Timeout | null = null;

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.setHeader("Content-Encoding", "identity"); // Prevent any encoding that might buffer
  res.flushHeaders();

  // Disable TCP Nagle algorithm for real-time delivery
  if (res.socket) {
    res.socket.setNoDelay(true);
  }

  // Cleanup function
  const cleanup = () => {
    isConnectionActive = false;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  };

  // Handle client disconnect
  res.on("close", () => {
    cleanup();
    options.onClose?.();
  });

  // Set up heartbeat to keep connection alive
  heartbeatTimer = setInterval(() => {
    if (isConnectionActive) {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        cleanup();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Set up timeout
  timeoutTimer = setTimeout(() => {
    if (isConnectionActive) {
      try {
        res.write(`data: ${JSON.stringify({
          type: "error",
          message: "Request timed out. The PDF processing is taking too long."
        })}\n\n`);
        res.end();
      } catch {
        // Connection already closed
      }
      cleanup();
      options.onTimeout?.();
    }
  }, timeoutMs);

  return {
    send: (event: string, data: Record<string, unknown>) => {
      if (isConnectionActive) {
        try {
          res.write(`data: ${JSON.stringify({ type: event, ...data })}\n\n`);
        } catch {
          cleanup();
        }
      }
    },

    sendProgress: (progress: number, message: string, details?: string, extra?: SSEProgressData) => {
      if (isConnectionActive) {
        try {
          res.write(`data: ${JSON.stringify({
            type: "progress",
            progress,
            message,
            details,
            ...extra
          })}\n\n`);
          // Force flush to ensure immediate delivery (critical for SSE)
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        } catch {
          cleanup();
        }
      }
    },

    sendComplete: (result: unknown) => {
      if (isConnectionActive) {
        try {
          res.write(`data: ${JSON.stringify({ type: "complete", result })}\n\n`);
          // Force flush before ending
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
          res.end();
        } catch {
          // Connection already closed
        }
        cleanup();
      }
    },

    sendError: (message: string) => {
      if (isConnectionActive) {
        try {
          res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
          // Force flush before ending
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
          res.end();
        } catch {
          // Connection already closed
        }
        cleanup();
      }
    },

    end: () => {
      if (isConnectionActive) {
        try {
          res.end();
        } catch {
          // Connection already closed
        }
        cleanup();
      }
    },

    isActive: () => isConnectionActive,
  };
}

// Configuration constants exported for documentation
export const SSE_CONFIG = {
  DEFAULT_TIMEOUT_MS: DEFAULT_SSE_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
};

