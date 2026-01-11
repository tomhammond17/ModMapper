import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the database
const mockDb = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  limit: vi.fn(() => Promise.resolve([])),
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
  })),
}));

// Import after mocks
import {
  getSubscription,
  getSubscriptionByStripeCustomer,
  updateStripeCustomerId,
  upgradeSubscription,
  scheduleDowngrade,
  immediateDowngrade,
  updateSubscriptionStatus,
  updateSubscriptionPeriod,
  updateSubscriptionByStripeCustomer,
} from "../../services/subscription";

describe("Subscription Service", () => {
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
    mockDb.update.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
  });

  describe("getSubscription", () => {
    it("should return subscription for user", async () => {
      const mockSubscription = {
        id: "sub-123",
        userId: "user-123",
        tier: "pro",
        status: "active",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockSubscription]);

      const subscription = await getSubscription("user-123");

      expect(subscription).not.toBeNull();
      expect(subscription?.userId).toBe("user-123");
      expect(subscription?.tier).toBe("pro");
      expect(subscription?.status).toBe("active");
    });

    it("should return null if subscription not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const subscription = await getSubscription("nonexistent");

      expect(subscription).toBeNull();
    });

    it("should return null when database is not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const subscription = await getSubscription("user-123");

      expect(subscription).toBeNull();
    });
  });

  describe("getSubscriptionByStripeCustomer", () => {
    it("should return subscription by Stripe customer ID", async () => {
      const mockSubscription = {
        id: "sub-123",
        userId: "user-123",
        tier: "pro",
        status: "active",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockSubscription]);

      const subscription = await getSubscriptionByStripeCustomer("cus_123");

      expect(subscription).not.toBeNull();
      expect(subscription?.stripeCustomerId).toBe("cus_123");
    });

    it("should return null if not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const subscription = await getSubscriptionByStripeCustomer("nonexistent");

      expect(subscription).toBeNull();
    });
  });

  describe("updateStripeCustomerId", () => {
    it("should update Stripe customer ID", async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await updateStripeCustomerId("user-123", "cus_new");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeCustomerId: "cus_new",
        })
      );
    });

    it("should not throw when database is not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      await expect(
        updateStripeCustomerId("user-123", "cus_new")
      ).resolves.not.toThrow();
    });
  });

  describe("upgradeSubscription", () => {
    it("should upgrade user to Pro tier", async () => {
      const periodStart = new Date();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await upgradeSubscription(
        "user-123",
        "sub_stripe",
        "cus_stripe",
        periodStart,
        periodEnd
      );

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: "pro",
          status: "active",
          stripeSubscriptionId: "sub_stripe",
          stripeCustomerId: "cus_stripe",
          cancelAtPeriodEnd: false,
        })
      );
    });
  });

  describe("scheduleDowngrade", () => {
    it("should set cancelAtPeriodEnd to true", async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await scheduleDowngrade("user-123");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          cancelAtPeriodEnd: true,
        })
      );
    });
  });

  describe("immediateDowngrade", () => {
    it("should downgrade to Free tier immediately", async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await immediateDowngrade("user-123");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: "free",
          status: "canceled",
          stripeSubscriptionId: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        })
      );
    });
  });

  describe("updateSubscriptionStatus", () => {
    it("should update subscription status", async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await updateSubscriptionStatus("user-123", "past_due");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "past_due",
        })
      );
    });
  });

  describe("updateSubscriptionPeriod", () => {
    it("should update subscription period dates", async () => {
      const periodStart = new Date();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await updateSubscriptionPeriod("user-123", periodStart, periodEnd);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        })
      );
    });
  });

  describe("updateSubscriptionByStripeCustomer", () => {
    it("should update subscription by Stripe customer ID", async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await updateSubscriptionByStripeCustomer("cus_123", {
        tier: "pro",
        status: "active",
        cancelAtPeriodEnd: false,
      });

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: "pro",
          status: "active",
          cancelAtPeriodEnd: false,
        })
      );
    });

    it("should handle partial updates", async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await updateSubscriptionByStripeCustomer("cus_123", {
        status: "canceled",
      });

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "canceled",
        })
      );
    });
  });
});
