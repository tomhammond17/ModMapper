import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import type { InsertModbusDocument } from "@shared/schema";

describe("MemStorage", () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  const createTestDocument = (): InsertModbusDocument => ({
    filename: "test.csv",
    sourceFormat: "csv",
    registers: [
      { address: 100, name: "Reg1", datatype: "UINT16", description: "Test", writable: false },
      { address: 101, name: "Reg2", datatype: "INT16", description: "Test2", writable: true },
    ],
  });

  describe("createDocument", () => {
    it("should create a document with auto-generated id and timestamp", async () => {
      const input = createTestDocument();
      const doc = await storage.createDocument(input);

      expect(doc.id).toBeDefined();
      expect(doc.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(doc.filename).toBe("test.csv");
      expect(doc.sourceFormat).toBe("csv");
      expect(doc.registers).toHaveLength(2);
      expect(doc.createdAt).toBeInstanceOf(Date);
    });

    it("should generate unique ids for each document", async () => {
      const doc1 = await storage.createDocument(createTestDocument());
      const doc2 = await storage.createDocument(createTestDocument());

      expect(doc1.id).not.toBe(doc2.id);
    });
  });

  describe("getDocument", () => {
    it("should retrieve a document by id", async () => {
      const created = await storage.createDocument(createTestDocument());
      const retrieved = await storage.getDocument(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.filename).toBe(created.filename);
    });

    it("should return undefined for non-existent id", async () => {
      const result = await storage.getDocument("non-existent-id");

      expect(result).toBeUndefined();
    });
  });

  describe("getAllDocuments", () => {
    it("should return empty array when no documents exist", async () => {
      const docs = await storage.getAllDocuments();

      expect(docs).toEqual([]);
    });

    it("should return all documents sorted by createdAt descending", async () => {
      const doc1 = await storage.createDocument({ ...createTestDocument(), filename: "first.csv" });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const doc2 = await storage.createDocument({ ...createTestDocument(), filename: "second.csv" });

      const docs = await storage.getAllDocuments();

      expect(docs).toHaveLength(2);
      expect(docs[0].filename).toBe("second.csv"); // Most recent first
      expect(docs[1].filename).toBe("first.csv");
    });
  });

  describe("deleteDocument", () => {
    it("should delete an existing document and return true", async () => {
      const doc = await storage.createDocument(createTestDocument());
      const result = await storage.deleteDocument(doc.id);

      expect(result).toBe(true);

      const retrieved = await storage.getDocument(doc.id);
      expect(retrieved).toBeUndefined();
    });

    it("should return false when deleting non-existent document", async () => {
      const result = await storage.deleteDocument("non-existent-id");

      expect(result).toBe(false);
    });
  });
});
