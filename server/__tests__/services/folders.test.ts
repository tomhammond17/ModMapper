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
  delete: vi.fn(() => mockDb),
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
  createFolder,
  getFolders,
  getFolder,
  renameFolder,
  deleteFolder,
  getChildFolders,
} from "../../services/folders";

describe("Folders Service", () => {
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
    mockDb.delete.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
  });

  describe("createFolder", () => {
    it("should create a root folder", async () => {
      const mockFolder = {
        id: "folder-123",
        userId: "user-123",
        name: "My Folder",
        parentId: null,
        path: "/",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([mockFolder]);

      const folder = await createFolder("user-123", "My Folder");

      expect(folder.name).toBe("My Folder");
      expect(folder.path).toBe("/");
      expect(folder.parentId).toBeNull();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should create a nested folder with correct path", async () => {
      const parentFolder = {
        id: "parent-123",
        userId: "user-123",
        name: "Parent",
        parentId: null,
        path: "/",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const childFolder = {
        id: "child-123",
        userId: "user-123",
        name: "Child",
        parentId: "parent-123",
        path: "/parent-123/",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([parentFolder]); // getFolder for parent
      mockDb.returning.mockResolvedValueOnce([childFolder]);

      const folder = await createFolder("user-123", "Child", "parent-123");

      expect(folder.name).toBe("Child");
      expect(folder.parentId).toBe("parent-123");
    });

    it("should throw if parent folder not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]); // No parent found

      await expect(
        createFolder("user-123", "Child", "nonexistent")
      ).rejects.toThrow("Parent folder not found");
    });

    it("should throw when database is not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      await expect(createFolder("user-123", "Test")).rejects.toThrow(
        "Database not available"
      );
    });
  });

  describe("getFolders", () => {
    it("should return all folders for user", async () => {
      const mockFolders = [
        {
          id: "folder-1",
          userId: "user-123",
          name: "Folder 1",
          parentId: null,
          path: "/",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "folder-2",
          userId: "user-123",
          name: "Folder 2",
          parentId: "folder-1",
          path: "/folder-1/",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb.orderBy.mockResolvedValueOnce(mockFolders);

      const folders = await getFolders("user-123");

      expect(folders).toHaveLength(2);
      expect(folders[0].name).toBe("Folder 1");
      expect(folders[1].name).toBe("Folder 2");
    });

    it("should return empty array when database not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const folders = await getFolders("user-123");

      expect(folders).toEqual([]);
    });
  });

  describe("getFolder", () => {
    it("should return folder by ID with ownership check", async () => {
      const mockFolder = {
        id: "folder-123",
        userId: "user-123",
        name: "My Folder",
        parentId: null,
        path: "/",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockFolder]);

      const folder = await getFolder("folder-123", "user-123");

      expect(folder).not.toBeNull();
      expect(folder?.id).toBe("folder-123");
    });

    it("should return null if folder not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const folder = await getFolder("nonexistent", "user-123");

      expect(folder).toBeNull();
    });

    it("should return null if user does not own folder", async () => {
      // Query returns empty because of userId mismatch in WHERE clause
      mockDb.limit.mockResolvedValueOnce([]);

      const folder = await getFolder("folder-123", "wrong-user");

      expect(folder).toBeNull();
    });
  });

  describe("renameFolder", () => {
    it("should rename folder", async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      await renameFolder("folder-123", "user-123", "New Name");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Name",
        })
      );
    });

    it("should throw when database not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      await expect(
        renameFolder("folder-123", "user-123", "New Name")
      ).rejects.toThrow("Database not available");
    });
  });

  describe("deleteFolder", () => {
    it("should delete folder and contents", async () => {
      const mockFolder = {
        id: "folder-123",
        userId: "user-123",
        name: "To Delete",
        parentId: null,
        path: "/",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // getFolder call uses limit()
      mockDb.limit.mockResolvedValueOnce([mockFolder]);

      // Track where() calls to handle different contexts
      let whereCallCount = 0;
      mockDb.where.mockImplementation(() => {
        whereCallCount++;
        // 1st where: getFolder SELECT chain, return mockDb for .limit()
        if (whereCallCount === 1) {
          return mockDb;
        }
        // 2nd where: get foldersToDelete SELECT (no .limit()), return array
        if (whereCallCount === 2) {
          return Promise.resolve([{ id: "folder-123" }]);
        }
        // Subsequent where: DELETE operations, return Promise
        return Promise.resolve({ rowCount: 1 });
      });

      await deleteFolder("folder-123", "user-123");

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("should throw if folder not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(deleteFolder("nonexistent", "user-123")).rejects.toThrow(
        "Folder not found"
      );
    });
  });

  describe("getChildFolders", () => {
    it("should return root level folders when parentId is null", async () => {
      const mockFolders = [
        {
          id: "folder-1",
          userId: "user-123",
          name: "Root 1",
          parentId: null,
          path: "/",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "folder-2",
          userId: "user-123",
          name: "Root 2",
          parentId: null,
          path: "/",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // The mock chain ends with orderBy returning the result
      mockDb.orderBy.mockResolvedValueOnce(mockFolders);

      const folders = await getChildFolders("user-123", null);

      expect(folders).toHaveLength(2);
    });

    it("should return children of specific folder", async () => {
      const mockFolders = [
        {
          id: "child-1",
          userId: "user-123",
          name: "Child 1",
          parentId: "parent-123",
          path: "/parent-123/",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb.orderBy.mockResolvedValueOnce(mockFolders);

      const folders = await getChildFolders("user-123", "parent-123");

      expect(folders).toHaveLength(1);
      expect(folders[0].parentId).toBe("parent-123");
    });

    it("should return empty array when database not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const folders = await getChildFolders("user-123");

      expect(folders).toEqual([]);
    });
  });
});
