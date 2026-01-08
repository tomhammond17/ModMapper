export interface SSEProgressEvent {
  type: "progress";
  progress: number;
  message: string;
  details?: string;
}

export interface SSECompleteEvent<T> {
  type: "complete";
  result: T;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
}

export type SSEEvent<T> = SSEProgressEvent | SSECompleteEvent<T> | SSEErrorEvent;

export interface SSECallbacks<T> {
  onProgress: (progress: number, message: string) => void;
  onComplete: (result: T) => void;
  onError: (error: Error) => void;
}

export async function parseSSEStream<T>(
  response: Response,
  callbacks: SSECallbacks<T>
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to read response stream");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6)) as SSEEvent<T>;

            if (data.type === "progress") {
              callbacks.onProgress(data.progress, data.message);
            } else if (data.type === "complete") {
              callbacks.onComplete(data.result);
            } else if (data.type === "error") {
              callbacks.onError(new Error(data.message));
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
