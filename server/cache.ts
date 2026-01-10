import { createHash } from "crypto";
import type { PdfExtractionResult } from "./pdf-parser";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheConfig {
  ttlMinutes: number;
  maxEntries: number;
}

/**
 * Cache configuration with environment variable overrides.
 * 
 * Environment Variables:
 * - PDF_CACHE_TTL_MINUTES: How long cached entries remain valid (default: 30)
 * - PDF_CACHE_MAX_ENTRIES: Maximum number of entries before eviction (default: 100)
 */
function getCacheConfig(): CacheConfig {
  const ttlMinutes = parseInt(process.env.PDF_CACHE_TTL_MINUTES || "30", 10);
  const maxEntries = parseInt(process.env.PDF_CACHE_MAX_ENTRIES || "100", 10);

  return {
    ttlMinutes: isNaN(ttlMinutes) || ttlMinutes < 1 ? 30 : ttlMinutes,
    maxEntries: isNaN(maxEntries) || maxEntries < 1 ? 100 : maxEntries,
  };
}

/**
 * Simple in-memory cache with TTL expiration.
 * Used to cache PDF parsing results to avoid expensive re-processing.
 */
export class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttlMs: number;
  private maxEntries: number;

  constructor(config: CacheConfig) {
    this.ttlMs = config.ttlMinutes * 60 * 1000;
    this.maxEntries = config.maxEntries;
  }

  /**
   * Generate SHA-256 hash of buffer content for cache key.
   */
  getHash(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Get cached value if exists and not expired.
   */
  get(hash: string): T | undefined {
    const entry = this.cache.get(hash);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(hash);
      return undefined;
    }

    return entry.data;
  }

  /**
   * Store value in cache with current timestamp.
   */
  set(hash: string, data: T): void {
    // Limit cache size to prevent memory issues
    if (this.cache.size >= this.maxEntries) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(hash, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if a hash exists in cache (even if expired).
   */
  has(hash: string): boolean {
    return this.cache.has(hash);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache configuration for debugging/monitoring.
   */
  getConfig(): { ttlMs: number; maxEntries: number } {
    return {
      ttlMs: this.ttlMs,
      maxEntries: this.maxEntries,
    };
  }
}

// Export singleton instance for PDF parsing cache
export const pdfCache = new SimpleCache<PdfExtractionResult>(getCacheConfig());

// Export config function for testing
export { getCacheConfig };
