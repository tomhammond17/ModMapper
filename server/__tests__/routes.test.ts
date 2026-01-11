import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { createServer } from "http";

// Mock the pdf-parser module before importing routes
vi.mock("../pdf-parser", () => ({
  parsePdfFile: vi.fn().mockResolvedValue({
    registers: [
      { address: 100, name: "Test", datatype: "UINT16", description: "Test register", writable: false },
    ],
    metadata: {
      totalPages: 10,
      pagesAnalyzed: 5,
      registersFound: 1,
      highRelevancePages: 2,
      confidenceLevel: "high",
      processingTimeMs: 1000,
    },
  }),
  parsePdfWithPageHints: vi.fn().mockResolvedValue({
    registers: [
      { address: 100, name: "Test", datatype: "UINT16", description: "Test register", writable: false },
    ],
    metadata: {
      totalPages: 10,
      pagesAnalyzed: 2,
      registersFound: 1,
      highRelevancePages: 1,
      confidenceLevel: "medium",
      processingTimeMs: 500,
    },
  }),
  parsePageRanges: vi.fn().mockReturnValue([{ start: 1, end: 5 }]),
}));

// Mock the cache module
vi.mock("../cache", () => ({
  pdfCache: {
    getHash: vi.fn().mockReturnValue("mock-hash"),
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  },
}));

// Mock the storage module
vi.mock("../storage", () => ({
  storage: {
    createDocument: vi.fn().mockResolvedValue({
      id: "mock-id-123",
      filename: "test.csv",
      sourceFormat: "csv",
      registers: [],
      createdAt: new Date(),
    }),
    getDocument: vi.fn().mockImplementation((id: string) => {
      if (id === "existing-id") {
        return Promise.resolve({
          id: "existing-id",
          filename: "test.csv",
          sourceFormat: "csv",
          registers: [{ address: 100, name: "Test", datatype: "UINT16", description: "", writable: false }],
          createdAt: new Date(),
        });
      }
      return Promise.resolve(undefined);
    }),
    getAllDocuments: vi.fn().mockResolvedValue([
      {
        id: "doc-1",
        filename: "test1.csv",
        sourceFormat: "csv",
        registers: [],
        createdAt: new Date(),
      },
    ]),
    deleteDocument: vi.fn().mockImplementation((id: string) => {
      return Promise.resolve(id === "existing-id");
    }),
  },
}));

import { registerRoutes } from "../routes";

// Helper to create test app
async function createTestApp() {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return app;
}

describe("API Routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();
  });

  // =========================================================================
  // Health Check
  // =========================================================================
  describe("GET /api/v1/health", () => {
    it("should return healthy status", async () => {
      const response = await request(app).get("/api/v1/health");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("healthy");
      expect(response.body.service).toBe("modbus-converter");
    });
  });

  // =========================================================================
  // File Parsing - CSV
  // =========================================================================
  describe("POST /api/v1/parse - CSV files", () => {
    it("should parse a valid CSV file", async () => {
      const csvContent = `address,name,datatype,description,writable
100,Temperature,UINT16,Current temperature,false
101,Setpoint,INT16,Target temperature,true`;

      const response = await request(app)
        .post("/api/v1/parse")
        .attach("file", Buffer.from(csvContent), {
          filename: "test.csv",
          contentType: "text/csv",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.registers).toHaveLength(2);
      expect(response.body.sourceFormat).toBe("csv");
    });

    it("should return error for CSV without address column", async () => {
      const csvContent = `name,datatype,description,writable
Temperature,UINT16,Current temperature,false`;

      const response = await request(app)
        .post("/api/v1/parse")
        .attach("file", Buffer.from(csvContent), {
          filename: "test.csv",
          contentType: "text/csv",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("address column");
    });

    it("should return error when no file is provided", async () => {
      const response = await request(app).post("/api/v1/parse");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("No file provided");
    });
  });

  // =========================================================================
  // File Parsing - JSON
  // =========================================================================
  describe("POST /api/v1/parse - JSON files", () => {
    it("should parse a valid JSON array", async () => {
      const jsonContent = JSON.stringify([
        { address: 100, name: "Temp", datatype: "UINT16", description: "Desc", writable: false },
        { address: 101, name: "Pressure", datatype: "INT16", description: "Desc", writable: true },
      ]);

      const response = await request(app)
        .post("/api/v1/parse")
        .attach("file", Buffer.from(jsonContent), {
          filename: "test.json",
          contentType: "application/json",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.registers).toHaveLength(2);
      expect(response.body.sourceFormat).toBe("json");
    });

    it("should parse JSON with registers property", async () => {
      const jsonContent = JSON.stringify({
        registers: [
          { address: 100, name: "Temp", datatype: "UINT16", description: "Desc", writable: false },
        ],
      });

      const response = await request(app)
        .post("/api/v1/parse")
        .attach("file", Buffer.from(jsonContent), {
          filename: "test.json",
          contentType: "application/json",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.registers).toHaveLength(1);
    });

    it("should return error for invalid JSON", async () => {
      const response = await request(app)
        .post("/api/v1/parse")
        .attach("file", Buffer.from("not valid json {"), {
          filename: "test.json",
          contentType: "application/json",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // =========================================================================
  // File Parsing - XML
  // =========================================================================
  describe("POST /api/v1/parse - XML files", () => {
    it("should parse a valid XML file", async () => {
      const xmlContent = `<?xml version="1.0"?>
<registers>
  <register>
    <address>100</address>
    <name>Temperature</name>
    <datatype>UINT16</datatype>
    <description>Current temp</description>
    <writable>false</writable>
  </register>
</registers>`;

      const response = await request(app)
        .post("/api/v1/parse")
        .attach("file", Buffer.from(xmlContent), {
          filename: "test.xml",
          contentType: "application/xml",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.registers).toHaveLength(1);
      expect(response.body.sourceFormat).toBe("xml");
    });

    it("should return error for XML without registers", async () => {
      const xmlContent = `<?xml version="1.0"?><root><data>test</data></root>`;

      const response = await request(app)
        .post("/api/v1/parse")
        .attach("file", Buffer.from(xmlContent), {
          filename: "test.xml",
          contentType: "application/xml",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("No valid registers");
    });
  });

  // =========================================================================
  // Document Operations
  // =========================================================================
  describe("GET /api/v1/documents", () => {
    it("should return list of documents", async () => {
      const response = await request(app).get("/api/v1/documents");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.documents).toBeInstanceOf(Array);
    });
  });

  describe("GET /api/v1/documents/:id", () => {
    it("should return document by ID", async () => {
      const response = await request(app).get("/api/v1/documents/existing-id");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.document).toBeDefined();
      expect(response.body.data.document.id).toBe("existing-id");
    });

    it("should return 404 for non-existent document", async () => {
      const response = await request(app).get("/api/v1/documents/non-existent");

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Document not found");
    });
  });

  describe("DELETE /api/v1/documents/:id", () => {
    it("should delete existing document", async () => {
      const response = await request(app).delete("/api/v1/documents/existing-id");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe("Document deleted");
    });

    it("should return 404 when deleting non-existent document", async () => {
      const response = await request(app).delete("/api/v1/documents/non-existent");

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Document not found");
    });
  });

  // =========================================================================
  // File Type Validation
  // =========================================================================
  describe("File type validation", () => {
    it("should reject unsupported file types", async () => {
      const response = await request(app)
        .post("/api/v1/parse")
        .attach("file", Buffer.from("some content"), {
          filename: "test.txt",
          contentType: "text/plain",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});

