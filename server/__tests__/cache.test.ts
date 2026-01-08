import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SimpleCache, getCacheConfig } from "../cache";

describe("Cache", () => {
  describe("getCacheConfig", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should use default values when env vars not set", () => {
      delete process.env.PDF_CACHE_TTL_MINUTES;
      delete process.env.PDF_CACHE_MAX_ENTRIES;

      const config = getCacheConfig();

      expect(config.ttlMinutes).toBe(30);
      expect(config.maxEntries).toBe(100);
    });

    it("should use env var values when set", () => {
      process.env.PDF_CACHE_TTL_MINUTES = "60";
      process.env.PDF_CACHE_MAX_ENTRIES = "200";

      const config = getCacheConfig();

      expect(config.ttlMinutes).toBe(60);
      expect(config.maxEntries).toBe(200);
    });

    it("should fall back to defaults for invalid values", () => {
      process.env.PDF_CACHE_TTL_MINUTES = "invalid";
      process.env.PDF_CACHE_MAX_ENTRIES = "not-a-number";

      const config = getCacheConfig();

      expect(config.ttlMinutes).toBe(30);
      expect(config.maxEntries).toBe(100);
    });

    it("should fall back to defaults for zero or negative values", () => {
      process.env.PDF_CACHE_TTL_MINUTES = "0";
      process.env.PDF_CACHE_MAX_ENTRIES = "-5";

      const config = getCacheConfig();

      expect(config.ttlMinutes).toBe(30);
      expect(config.maxEntries).toBe(100);
    });
  });

  describe("SimpleCache", () => {
    it("should store and retrieve values", () => {
      const cache = new SimpleCache<string>({ ttlMinutes: 30, maxEntries: 100 });
      const hash = "test-hash";

      cache.set(hash, "test-value");

      expect(cache.get(hash)).toBe("test-value");
    });

    it("should return undefined for non-existent keys", () => {
      const cache = new SimpleCache<string>({ ttlMinutes: 30, maxEntries: 100 });

      expect(cache.get("non-existent")).toBeUndefined();
    });

    it("should expire entries after TTL", () => {
      vi.useFakeTimers();

      const cache = new SimpleCache<string>({ ttlMinutes: 1, maxEntries: 100 });
      const hash = "test-hash";

      cache.set(hash, "test-value");
      expect(cache.get(hash)).toBe("test-value");

      // Advance time past TTL
      vi.advanceTimersByTime(61 * 1000); // 61 seconds

      expect(cache.get(hash)).toBeUndefined();

      vi.useRealTimers();
    });

    it("should evict oldest entry when max entries reached", () => {
      const cache = new SimpleCache<string>({ ttlMinutes: 30, maxEntries: 3 });

      cache.set("hash1", "value1");
      cache.set("hash2", "value2");
      cache.set("hash3", "value3");

      expect(cache.size).toBe(3);

      // Adding 4th entry should evict oldest
      cache.set("hash4", "value4");

      expect(cache.size).toBe(3);
      expect(cache.get("hash1")).toBeUndefined(); // Evicted
      expect(cache.get("hash2")).toBe("value2");
      expect(cache.get("hash3")).toBe("value3");
      expect(cache.get("hash4")).toBe("value4");
    });

    it("should generate consistent hashes for same content", () => {
      const cache = new SimpleCache<string>({ ttlMinutes: 30, maxEntries: 100 });
      const buffer = Buffer.from("test content");

      const hash1 = cache.getHash(buffer);
      const hash2 = cache.getHash(buffer);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it("should generate different hashes for different content", () => {
      const cache = new SimpleCache<string>({ ttlMinutes: 30, maxEntries: 100 });

      const hash1 = cache.getHash(Buffer.from("content 1"));
      const hash2 = cache.getHash(Buffer.from("content 2"));

      expect(hash1).not.toBe(hash2);
    });

    it("should check existence with has()", () => {
      const cache = new SimpleCache<string>({ ttlMinutes: 30, maxEntries: 100 });
      const hash = "test-hash";

      expect(cache.has(hash)).toBe(false);

      cache.set(hash, "test-value");

      expect(cache.has(hash)).toBe(true);
    });

    it("should clear all entries", () => {
      const cache = new SimpleCache<string>({ ttlMinutes: 30, maxEntries: 100 });

      cache.set("hash1", "value1");
      cache.set("hash2", "value2");

      expect(cache.size).toBe(2);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get("hash1")).toBeUndefined();
    });

    it("should report config correctly", () => {
      const cache = new SimpleCache<string>({ ttlMinutes: 45, maxEntries: 50 });
      const config = cache.getConfig();

      expect(config.ttlMs).toBe(45 * 60 * 1000);
      expect(config.maxEntries).toBe(50);
    });
  });
});

