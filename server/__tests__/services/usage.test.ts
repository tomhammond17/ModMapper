import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the database
const mockDb = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  limit: vi.fn(() => Promise.resolve([])),
  insert: vi.fn(() => mockDb),
  values: vi.fn(() => mockDb),
  returning: vi.fn(() => Promise.resolve([])),
  update: vi.fn(() => mockDb),
  set: vi.fn(() => mockDb),
};

let mockDatabaseAvailable = true;

vi.mock("../../db", () => ({
  getDb: vi.fn(() => mockDb),
  isDatabaseAvailable: vi.fn(() => mockDatabaseAvailable),
}));

// Mock logger
vi.mock("../../logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Import after mocks
import {
  getMonthlyUsage,
  checkUsageLimits,
  trackConversion,
  getUsageWithLimits,
  resetMonthlyUsage,
} from "../../services/usage";

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

describe("Usage Service", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDatabaseAvailable = true;
    // Reset the isDatabaseAvailable mock to return true
    const { isDatabaseAvailable } = await import("../../db");
    vi.mocked(isDatabaseAvailable).mockReturnValue(true);
    // Reset mock chain
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.limit.mockResolvedValue([]);
    mockDb.insert.mockReturnValue(mockDb);
    mockDb.values.mockReturnValue(mockDb);
    mockDb.returning.mockResolvedValue([]);
    mockDb.update.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
  });

  describe("getMonthlyUsage", () => {
    it("should return existing usage record", async () => {
      const mockUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 5,
        tokensUsed: 50000,
      };

      mockDb.limit.mockResolvedValueOnce([mockUsage]);

      const usage = await getMonthlyUsage("user-123");

      expect(usage.conversionsUsed).toBe(5);
      expect(usage.tokensUsed).toBe(50000);
      expect(usage.month).toBe(getCurrentMonth());
    });

    it("should create new record if none exists", async () => {
      const newUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 0,
        tokensUsed: 0,
      };

      mockDb.limit.mockResolvedValueOnce([]); // No existing record
      mockDb.returning.mockResolvedValueOnce([newUsage]); // Created record

      const usage = await getMonthlyUsage("user-123");

      expect(usage.conversionsUsed).toBe(0);
      expect(usage.tokensUsed).toBe(0);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should return zero usage when database is not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const usage = await getMonthlyUsage("user-123");

      expect(usage.conversionsUsed).toBe(0);
      expect(usage.tokensUsed).toBe(0);
    });
  });

  describe("checkUsageLimits", () => {
    it("should allow conversion when under free tier limit", async () => {
      const mockUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 5,
        tokensUsed: 50000,
      };

      mockDb.limit.mockResolvedValueOnce([mockUsage]);

      const result = await checkUsageLimits("user-123", "free", "csv");

      expect(result.allowed).toBe(true);
    });

    it("should block conversion when free tier limit reached", async () => {
      const mockUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 10, // At limit
        tokensUsed: 50000,
      };

      mockDb.limit.mockResolvedValueOnce([mockUsage]);

      const result = await checkUsageLimits("user-123", "free", "csv");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("10 conversions/month");
      expect(result.usage?.conversions.used).toBe(10);
      expect(result.usage?.conversions.limit).toBe(10);
    });

    it("should allow unlimited conversions for pro tier", async () => {
      const mockUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 1000,
        tokensUsed: 500000,
      };

      mockDb.limit.mockResolvedValueOnce([mockUsage]);

      const result = await checkUsageLimits("user-123", "pro", "csv");

      expect(result.allowed).toBe(true);
    });

    it("should block PDF conversion when token limit reached", async () => {
      const mockUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 5,
        tokensUsed: 200000, // At free tier token limit
      };

      mockDb.limit.mockResolvedValueOnce([mockUsage]);

      const result = await checkUsageLimits("user-123", "free", "pdf");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("AI tokens");
      expect(result.usage?.tokens.used).toBe(200000);
    });

    it("should allow on error to prevent blocking users", async () => {
      mockDb.limit.mockRejectedValueOnce(new Error("DB error"));

      const result = await checkUsageLimits("user-123", "free", "csv");

      expect(result.allowed).toBe(true);
    });
  });

  describe("trackConversion", () => {
    it("should log conversion and increment usage for non-PDF", async () => {
      const mockUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 5,
        tokensUsed: 0,
      };

      mockDb.limit.mockResolvedValue([mockUsage]);
      mockDb.where.mockResolvedValue({ rowCount: 1 });

      await trackConversion("user-123", "csv", "json", 0);

      expect(mockDb.insert).toHaveBeenCalled(); // Log entry
    });

    it("should track tokens for PDF conversions", async () => {
      const mockUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 5,
        tokensUsed: 10000,
      };

      mockDb.limit.mockResolvedValue([mockUsage]);
      mockDb.where.mockResolvedValue({ rowCount: 1 });

      await trackConversion("user-123", "pdf", "json", 5000);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should not throw when database is not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      await expect(
        trackConversion("user-123", "csv", "json", 0)
      ).resolves.not.toThrow();
    });
  });

  describe("getUsageWithLimits", () => {
    it("should return usage with free tier limits", async () => {
      const mockUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 5,
        tokensUsed: 50000,
      };

      mockDb.limit.mockResolvedValueOnce([mockUsage]);

      const result = await getUsageWithLimits("user-123", "free");

      expect(result.tier).toBe("free");
      expect(result.usage.conversions.used).toBe(5);
      expect(result.usage.conversions.limit).toBe(10);
      expect(result.usage.conversions.unlimited).toBe(false);
      expect(result.usage.tokens.limit).toBe(200000);
    });

    it("should return unlimited conversions for pro tier", async () => {
      const mockUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 100,
        tokensUsed: 500000,
      };

      mockDb.limit.mockResolvedValueOnce([mockUsage]);

      const result = await getUsageWithLimits("user-123", "pro");

      expect(result.tier).toBe("pro");
      expect(result.usage.conversions.unlimited).toBe(true);
      expect(result.usage.conversions.limit).toBeNull();
      expect(result.usage.tokens.limit).toBe(1000000);
    });

    it("should include period end date", async () => {
      const mockUsage = {
        userId: "user-123",
        month: getCurrentMonth(),
        conversionsUsed: 0,
        tokensUsed: 0,
      };

      mockDb.limit.mockResolvedValueOnce([mockUsage]);

      const result = await getUsageWithLimits("user-123", "free");

      expect(result.periodEnd).toBeDefined();
      // Should be first of next month
      const periodEnd = new Date(result.periodEnd);
      expect(periodEnd.getDate()).toBe(1);
    });
  });

  describe("resetMonthlyUsage", () => {
    it("should reset usage counters to zero", async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await resetMonthlyUsage("user-123");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          conversionsUsed: 0,
          tokensUsed: 0,
        })
      );
    });

    it("should not throw when database is not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      await expect(resetMonthlyUsage("user-123")).resolves.not.toThrow();
    });
  });
});
