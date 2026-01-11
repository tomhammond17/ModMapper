import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Mock the database
const mockDb = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  limit: vi.fn(() => Promise.resolve([])),
};

vi.mock("../../db", () => ({
  getDb: vi.fn(() => mockDb),
}));

// Mock the auth service
vi.mock("../../services/auth", () => ({
  getUserById: vi.fn(),
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
  requireAuth,
  optionalAuth,
  loadSubscription,
  requirePro,
} from "../../middleware/auth";
import { getUserById } from "../../services/auth";

// Helper to create mock request
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    session: {},
    ...overrides,
  } as unknown as Request;
}

// Helper to create mock response
function createMockResponse(): Response {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe("Auth Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock chain
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.limit.mockResolvedValue([]);
  });

  describe("requireAuth", () => {
    it("should return 401 if no session userId", async () => {
      const req = createMockRequest({ session: {} });
      const res = createMockResponse();
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "AUTHENTICATION_REQUIRED",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should attach user and call next if user exists", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        passwordHash: "hash",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(getUserById).mockResolvedValueOnce(mockUser);

      const req = createMockRequest({
        session: { userId: "user-123" } as any,
      });
      const res = createMockResponse();
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });

    it("should return 401 if user not found", async () => {
      vi.mocked(getUserById).mockResolvedValueOnce(null);

      const req = createMockRequest({
        session: {
          userId: "deleted-user",
          destroy: vi.fn((cb) => cb()),
        } as any,
      });
      const res = createMockResponse();
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 500 on error", async () => {
      vi.mocked(getUserById).mockRejectedValueOnce(new Error("DB error"));

      const req = createMockRequest({
        session: { userId: "user-123" } as any,
      });
      const res = createMockResponse();
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "INTERNAL_ERROR",
        })
      );
    });
  });

  describe("optionalAuth", () => {
    it("should call next without user if no session", async () => {
      const req = createMockRequest({ session: {} });
      const res = createMockResponse();
      const next = vi.fn();

      await optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it("should attach user if session exists and user found", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        passwordHash: "hash",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(getUserById).mockResolvedValueOnce(mockUser);

      const req = createMockRequest({
        session: { userId: "user-123" } as any,
      });
      const res = createMockResponse();
      const next = vi.fn();

      await optionalAuth(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });

    it("should continue without error if user lookup fails", async () => {
      vi.mocked(getUserById).mockRejectedValueOnce(new Error("DB error"));

      const req = createMockRequest({
        session: { userId: "user-123" } as any,
      });
      const res = createMockResponse();
      const next = vi.fn();

      await optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("loadSubscription", () => {
    it("should call next without loading if no user", async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      await loadSubscription(req, res, next);

      expect(req.subscription).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it("should attach subscription if user exists", async () => {
      const mockSubscription = {
        id: "sub-123",
        userId: "user-123",
        tier: "pro",
        status: "active",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_stripe",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockSubscription]);

      const req = createMockRequest();
      req.user = { id: "user-123" } as any;
      const res = createMockResponse();
      const next = vi.fn();

      await loadSubscription(req, res, next);

      expect(req.subscription).toBeDefined();
      expect(req.subscription?.tier).toBe("pro");
      expect(next).toHaveBeenCalled();
    });

    it("should continue on error", async () => {
      mockDb.limit.mockRejectedValueOnce(new Error("DB error"));

      const req = createMockRequest();
      req.user = { id: "user-123" } as any;
      const res = createMockResponse();
      const next = vi.fn();

      await loadSubscription(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("requirePro", () => {
    it("should return 403 if no subscription", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      requirePro(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PRO_FEATURE",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 if subscription is free tier", () => {
      const req = createMockRequest();
      req.subscription = { tier: "free", status: "active" } as any;
      const res = createMockResponse();
      const next = vi.fn();

      requirePro(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PRO_FEATURE",
        })
      );
    });

    it("should return 403 if pro subscription is inactive", () => {
      const req = createMockRequest();
      req.subscription = { tier: "pro", status: "canceled" } as any;
      const res = createMockResponse();
      const next = vi.fn();

      requirePro(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "SUBSCRIPTION_INACTIVE",
        })
      );
    });

    it("should call next for active pro subscription", () => {
      const req = createMockRequest();
      req.subscription = { tier: "pro", status: "active" } as any;
      const res = createMockResponse();
      const next = vi.fn();

      requirePro(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should call next for trialing pro subscription", () => {
      const req = createMockRequest();
      req.subscription = { tier: "pro", status: "trialing" } as any;
      const res = createMockResponse();
      const next = vi.fn();

      requirePro(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
