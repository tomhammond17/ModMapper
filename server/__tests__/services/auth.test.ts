import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcrypt";

// Mock the database
vi.mock("../../db", () => ({
  getDb: vi.fn(() => mockDb),
}));

// Mock logger
vi.mock("../../logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Create mock database
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
  delete: vi.fn(() => mockDb),
};

// Create a separate mock for delete operations that resolves
const mockDeleteResult = Promise.resolve({ rowCount: 0 });

// Import after mocks
import {
  hashPassword,
  verifyPassword,
  createUser,
  authenticateUser,
  getUserById,
  getUserByEmail,
  createMagicLink,
  verifyMagicLink,
  verifyUserEmail,
  cleanupExpiredMagicLinks,
} from "../../services/auth";

describe("Auth Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockDb.delete.mockReturnValue(mockDb);
  });

  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should produce different hashes for the same password", async () => {
      const password = "testPassword123";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    it("should verify a correct password", async () => {
      const password = "testPassword123";
      const hash = await bcrypt.hash(password, 10);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const password = "testPassword123";
      const wrongPassword = "wrongPassword";
      const hash = await bcrypt.hash(password, 10);

      const isValid = await verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe("createUser", () => {
    it("should create a new user with hashed password", async () => {
      const email = "test@example.com";
      const password = "password123";
      const mockUser = {
        id: "user-123",
        email,
        passwordHash: "hashed",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([]); // No existing user
      mockDb.returning.mockResolvedValueOnce([mockUser]); // User created
      mockDb.returning.mockResolvedValueOnce([]); // Subscription created

      const user = await createUser(email, password);

      expect(user.email).toBe(email);
      expect(user.id).toBe("user-123");
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should throw if user already exists", async () => {
      const email = "existing@example.com";
      const existingUser = { id: "existing-user", email };

      mockDb.limit.mockResolvedValueOnce([existingUser]);

      await expect(createUser(email, "password")).rejects.toThrow(
        "User with this email already exists"
      );
    });
  });

  describe("authenticateUser", () => {
    it("should authenticate valid credentials", async () => {
      const email = "test@example.com";
      const password = "password123";
      const hash = await bcrypt.hash(password, 10);
      const mockUser = {
        id: "user-123",
        email,
        passwordHash: hash,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockUser]);

      const user = await authenticateUser(email, password);

      expect(user).not.toBeNull();
      expect(user?.id).toBe("user-123");
      expect(user?.email).toBe(email);
    });

    it("should return null for non-existent user", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const user = await authenticateUser("nonexistent@example.com", "password");

      expect(user).toBeNull();
    });

    it("should return null for wrong password", async () => {
      const email = "test@example.com";
      const hash = await bcrypt.hash("correctPassword", 10);
      const mockUser = {
        id: "user-123",
        email,
        passwordHash: hash,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockUser]);

      const user = await authenticateUser(email, "wrongPassword");

      expect(user).toBeNull();
    });
  });

  describe("getUserById", () => {
    it("should return user by ID", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        passwordHash: "hash",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockUser]);

      const user = await getUserById("user-123");

      expect(user).not.toBeNull();
      expect(user?.id).toBe("user-123");
    });

    it("should return null if user not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const user = await getUserById("nonexistent");

      expect(user).toBeNull();
    });
  });

  describe("getUserByEmail", () => {
    it("should return user by email", async () => {
      const email = "test@example.com";
      const mockUser = {
        id: "user-123",
        email,
        passwordHash: "hash",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockUser]);

      const user = await getUserByEmail(email);

      expect(user).not.toBeNull();
      expect(user?.email).toBe(email);
    });

    it("should return null if email not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const user = await getUserByEmail("nonexistent@example.com");

      expect(user).toBeNull();
    });
  });

  describe("createMagicLink", () => {
    it("should create a magic link token", async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: "magic-link-123" }]);

      const token = await createMagicLink("user-123");

      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes as hex
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("verifyMagicLink", () => {
    it("should verify valid magic link and return user", async () => {
      const mockMagicLink = {
        id: "ml-123",
        userId: "user-123",
        token: "validtoken",
        expiresAt: new Date(Date.now() + 60000), // Future expiry
      };
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        passwordHash: "hash",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Set up mock chain - limit() calls for SELECT operations
      mockDb.limit.mockResolvedValueOnce([mockMagicLink]); // Magic link found
      mockDb.limit.mockResolvedValueOnce([mockUser]); // User found

      // For the DELETE operation, we need where() to be the terminal
      // Use mockImplementation to handle both SELECT chaining and DELETE termination
      let whereCallCount = 0;
      mockDb.where.mockImplementation(() => {
        whereCallCount++;
        // First two where() calls are for SELECT chains, return mockDb
        // Third where() call is for DELETE, return a Promise
        if (whereCallCount <= 2) {
          return mockDb;
        }
        return Promise.resolve({ rowCount: 1 });
      });

      const user = await verifyMagicLink("validtoken");

      expect(user).not.toBeNull();
      expect(user?.id).toBe("user-123");
    });

    it("should return null for invalid token", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const user = await verifyMagicLink("invalidtoken");

      expect(user).toBeNull();
    });
  });

  describe("verifyUserEmail", () => {
    it("should mark email as verified", async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await verifyUserEmail("user-123");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe("cleanupExpiredMagicLinks", () => {
    it("should delete expired magic links", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce({ rowCount: 5 });

      const count = await cleanupExpiredMagicLinks();

      expect(count).toBe(5);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("should return 0 if no expired links", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce({ rowCount: 0 });

      const count = await cleanupExpiredMagicLinks();

      expect(count).toBe(0);
    });
  });
});
