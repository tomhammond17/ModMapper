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
  orderBy: vi.fn(() => mockDb),
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
  createVersion,
  getVersionHistory,
  getVersion,
  compareVersions,
  checkDuplicateFilename,
  getLatestVersion,
} from "../../services/versions";

describe("Versions Service", () => {
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
    mockDb.orderBy.mockReturnValue(mockDb);
  });

  describe("createVersion", () => {
    it("should create a new version from existing document", async () => {
      const currentDoc = {
        id: "doc-123",
        userId: "user-123",
        folderId: null,
        filename: "registers.csv",
        sourceFormat: "csv",
        registers: [{ address: 1, name: "Reg1", datatype: "INT16", description: "", writable: false }],
        versionNumber: 1,
        isLatestVersion: true,
        parentDocumentId: null,
        createdAt: new Date(),
      };

      const newVersion = {
        ...currentDoc,
        id: "doc-456",
        versionNumber: 2,
        parentDocumentId: "doc-123",
        registers: [{ address: 1, name: "Reg1 Updated", datatype: "INT16", description: "", writable: true }],
      };

      mockDb.limit.mockResolvedValueOnce([currentDoc]); // Get current
      mockDb.returning.mockResolvedValueOnce([newVersion]); // Create new version

      const result = await createVersion("doc-123", "user-123", newVersion.registers);

      expect(result.versionNumber).toBe(2);
      expect(result.parentDocumentId).toBe("doc-123");
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should throw if document not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        createVersion("nonexistent", "user-123", [])
      ).rejects.toThrow("Document not found");
    });

    it("should throw when database not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      await expect(
        createVersion("doc-123", "user-123", [])
      ).rejects.toThrow("Database not available");
    });
  });

  describe("getVersionHistory", () => {
    it("should return all versions of a document", async () => {
      const versions = [
        {
          id: "doc-456",
          userId: "user-123",
          filename: "registers.csv",
          sourceFormat: "csv",
          registers: [],
          versionNumber: 2,
          isLatestVersion: true,
          parentDocumentId: "doc-123",
          createdAt: new Date(),
        },
        {
          id: "doc-123",
          userId: "user-123",
          filename: "registers.csv",
          sourceFormat: "csv",
          registers: [],
          versionNumber: 1,
          isLatestVersion: false,
          parentDocumentId: null,
          createdAt: new Date(),
        },
      ];

      mockDb.orderBy.mockResolvedValueOnce(versions);

      const history = await getVersionHistory("doc-123", "user-123");

      expect(history).toHaveLength(2);
      expect(history[0].versionNumber).toBe(2);
      expect(history[1].versionNumber).toBe(1);
    });

    it("should return empty array when database not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const history = await getVersionHistory("doc-123", "user-123");

      expect(history).toEqual([]);
    });
  });

  describe("getVersion", () => {
    it("should return specific version by number", async () => {
      const version = {
        id: "doc-123",
        userId: "user-123",
        filename: "registers.csv",
        sourceFormat: "csv",
        registers: [],
        versionNumber: 1,
        isLatestVersion: false,
        parentDocumentId: null,
        createdAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([version]);

      const result = await getVersion("doc-123", 1, "user-123");

      expect(result).not.toBeNull();
      expect(result?.versionNumber).toBe(1);
    });

    it("should return null if version not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await getVersion("doc-123", 99, "user-123");

      expect(result).toBeNull();
    });
  });

  describe("compareVersions", () => {
    it("should detect added registers", async () => {
      const v1 = {
        id: "doc-123",
        userId: "user-123",
        filename: "registers.csv",
        sourceFormat: "csv",
        registers: [
          { address: 1, name: "Reg1", datatype: "INT16", description: "", writable: false },
        ],
        versionNumber: 1,
        isLatestVersion: false,
        createdAt: new Date(),
      };

      const v2 = {
        ...v1,
        id: "doc-456",
        versionNumber: 2,
        registers: [
          { address: 1, name: "Reg1", datatype: "INT16", description: "", writable: false },
          { address: 2, name: "Reg2", datatype: "INT32", description: "New", writable: true },
        ],
      };

      mockDb.limit
        .mockResolvedValueOnce([v1]) // getVersion v1
        .mockResolvedValueOnce([v2]); // getVersion v2

      const comparison = await compareVersions("doc-123", 1, 2, "user-123");

      expect(comparison.summary.addedCount).toBe(1);
      expect(comparison.added[0].address).toBe(2);
    });

    it("should detect removed registers", async () => {
      const v1 = {
        id: "doc-123",
        userId: "user-123",
        filename: "registers.csv",
        sourceFormat: "csv",
        registers: [
          { address: 1, name: "Reg1", datatype: "INT16", description: "", writable: false },
          { address: 2, name: "Reg2", datatype: "INT32", description: "", writable: true },
        ],
        versionNumber: 1,
        isLatestVersion: false,
        createdAt: new Date(),
      };

      const v2 = {
        ...v1,
        id: "doc-456",
        versionNumber: 2,
        registers: [
          { address: 1, name: "Reg1", datatype: "INT16", description: "", writable: false },
        ],
      };

      mockDb.limit
        .mockResolvedValueOnce([v1])
        .mockResolvedValueOnce([v2]);

      const comparison = await compareVersions("doc-123", 1, 2, "user-123");

      expect(comparison.summary.removedCount).toBe(1);
      expect(comparison.removed[0].address).toBe(2);
    });

    it("should detect modified registers", async () => {
      const v1 = {
        id: "doc-123",
        userId: "user-123",
        filename: "registers.csv",
        sourceFormat: "csv",
        registers: [
          { address: 1, name: "Reg1", datatype: "INT16", description: "", writable: false },
        ],
        versionNumber: 1,
        isLatestVersion: false,
        createdAt: new Date(),
      };

      const v2 = {
        ...v1,
        id: "doc-456",
        versionNumber: 2,
        registers: [
          { address: 1, name: "Reg1 Updated", datatype: "INT32", description: "Changed", writable: true },
        ],
      };

      mockDb.limit
        .mockResolvedValueOnce([v1])
        .mockResolvedValueOnce([v2]);

      const comparison = await compareVersions("doc-123", 1, 2, "user-123");

      expect(comparison.summary.modifiedCount).toBe(1);
      expect(comparison.modified[0].address).toBe(1);
      expect(comparison.modified[0].changes).toContain("name");
      expect(comparison.modified[0].changes).toContain("datatype");
      expect(comparison.modified[0].changes).toContain("description");
      expect(comparison.modified[0].changes).toContain("writable");
    });

    it("should throw if version not found", async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        compareVersions("doc-123", 1, 2, "user-123")
      ).rejects.toThrow("Version not found");
    });
  });

  describe("checkDuplicateFilename", () => {
    it("should return exists true if duplicate found", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "existing-doc" }]);

      const result = await checkDuplicateFilename("user-123", "registers.csv");

      expect(result.exists).toBe(true);
      expect(result.documentId).toBe("existing-doc");
    });

    it("should return exists false if no duplicate", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await checkDuplicateFilename("user-123", "new-file.csv");

      expect(result.exists).toBe(false);
      expect(result.documentId).toBeUndefined();
    });

    it("should return false when database not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const result = await checkDuplicateFilename("user-123", "file.csv");

      expect(result.exists).toBe(false);
    });
  });

  describe("getLatestVersion", () => {
    it("should return the latest version of a document", async () => {
      const rootDoc = {
        id: "doc-123",
        userId: "user-123",
        parentDocumentId: null,
        createdAt: new Date(),
      };

      const latestVersion = {
        id: "doc-456",
        userId: "user-123",
        filename: "registers.csv",
        sourceFormat: "csv",
        registers: [],
        versionNumber: 3,
        isLatestVersion: true,
        parentDocumentId: "doc-123",
        createdAt: new Date(),
      };

      mockDb.limit
        .mockResolvedValueOnce([rootDoc]) // Get root
        .mockResolvedValueOnce([latestVersion]); // Get latest

      const result = await getLatestVersion("doc-123", "user-123");

      expect(result).not.toBeNull();
      expect(result?.versionNumber).toBe(3);
      expect(result?.isLatestVersion).toBe(true);
    });

    it("should return null if document not found", async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await getLatestVersion("nonexistent", "user-123");

      expect(result).toBeNull();
    });
  });
});
