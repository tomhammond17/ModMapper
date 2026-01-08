import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";

// We'll import the validation middleware after it's created
// For now, define the expected interface for TDD
describe("Validation Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = vi.fn();
    mockReq = {
      body: {},
      file: undefined,
    };
  });

  describe("validatePageRanges middleware", () => {
    it("should pass valid page range string", async () => {
      const { validatePageRanges } = await import("../middleware/validation");
      mockReq.body = { pageRanges: "1-10" };

      validatePageRanges(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it("should pass comma-separated page ranges", async () => {
      const { validatePageRanges } = await import("../middleware/validation");
      mockReq.body = { pageRanges: "1-5, 10, 15-20" };

      validatePageRanges(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should reject empty page range", async () => {
      const { validatePageRanges } = await import("../middleware/validation");
      mockReq.body = { pageRanges: "" };

      validatePageRanges(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("Page ranges"),
        })
      );
    });

    it("should reject missing page range", async () => {
      const { validatePageRanges } = await import("../middleware/validation");
      mockReq.body = {};

      validatePageRanges(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("should reject invalid page range format", async () => {
      const { validatePageRanges } = await import("../middleware/validation");
      mockReq.body = { pageRanges: "abc-xyz" };

      validatePageRanges(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );
    });

    it("should reject negative page numbers", async () => {
      const { validatePageRanges } = await import("../middleware/validation");
      mockReq.body = { pageRanges: "-5-10" };

      validatePageRanges(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe("validateFile middleware", () => {
    it("should pass when file is present", async () => {
      const { validateFile } = await import("../middleware/validation");
      mockReq.file = {
        originalname: "test.pdf",
        buffer: Buffer.from("test"),
        mimetype: "application/pdf",
      } as Express.Multer.File;

      validateFile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it("should reject when file is missing", async () => {
      const { validateFile } = await import("../middleware/validation");
      mockReq.file = undefined;

      validateFile(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("file"),
        })
      );
    });
  });

  describe("validatePdfFile middleware", () => {
    it("should pass valid PDF file", async () => {
      const { validatePdfFile } = await import("../middleware/validation");
      mockReq.file = {
        originalname: "test.pdf",
        buffer: Buffer.from("%PDF-1.4 test content"),
        mimetype: "application/pdf",
      } as Express.Multer.File;

      validatePdfFile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should reject non-PDF file by extension", async () => {
      const { validatePdfFile } = await import("../middleware/validation");
      mockReq.file = {
        originalname: "test.csv",
        buffer: Buffer.from("a,b,c"),
        mimetype: "text/csv",
      } as Express.Multer.File;

      validatePdfFile(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("PDF"),
        })
      );
    });

    it("should reject file without PDF magic bytes", async () => {
      const { validatePdfFile } = await import("../middleware/validation");
      mockReq.file = {
        originalname: "fake.pdf",
        buffer: Buffer.from("not a pdf file"),
        mimetype: "application/pdf",
      } as Express.Multer.File;

      validatePdfFile(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("PDF"),
        })
      );
    });
  });

  describe("validateJsonBody middleware", () => {
    it("should validate body against schema", async () => {
      const { createBodyValidator } = await import("../middleware/validation");
      const { z } = await import("zod");
      
      const schema = z.object({
        name: z.string(),
        count: z.number(),
      });
      
      const validator = createBodyValidator(schema);
      mockReq.body = { name: "test", count: 42 };

      validator(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should reject invalid body", async () => {
      const { createBodyValidator } = await import("../middleware/validation");
      const { z } = await import("zod");
      
      const schema = z.object({
        name: z.string(),
        count: z.number(),
      });
      
      const validator = createBodyValidator(schema);
      mockReq.body = { name: 123, count: "not a number" };

      validator(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );
    });

    it("should provide useful error messages", async () => {
      const { createBodyValidator } = await import("../middleware/validation");
      const { z } = await import("zod");
      
      const schema = z.object({
        email: z.string().email(),
      });
      
      const validator = createBodyValidator(schema);
      mockReq.body = { email: "not-an-email" };

      validator(mockReq as Request, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("email"),
        })
      );
    });
  });

  describe("error response format", () => {
    it("should return consistent error format", async () => {
      const { validateFile } = await import("../middleware/validation");

      validateFile(mockReq as Request, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: expect.any(String),
      });
    });
  });
});

