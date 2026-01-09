import { createLogger } from "../logger";

const log = createLogger("retry");

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: (error) => {
    // Retry on network errors, rate limits, server errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("network") ||
        message.includes("timeout") ||
        message.includes("econnrefused") ||
        message.includes("econnreset") ||
        message.includes("etimedout") ||
        message.includes("rate limit") ||
        message.includes("429") ||
        message.includes("503") ||
        message.includes("500") ||
        message.includes("overloaded")
      );
    }
    return false;
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with automatic retry on transient failures
 * Uses exponential backoff with configurable options
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if error is not retryable
      if (!opts.retryableErrors(error)) {
        log.debug("Error not retryable", { error: String(error) });
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        log.warn("Max retries reached", {
          attempts: attempt + 1,
          error: String(error)
        });
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelayMs
      );

      log.info("Retrying after error", {
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs: delay,
        error: String(error)
      });

      await sleep(delay);
    }
  }

  throw lastError;
}
