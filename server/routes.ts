import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer, { MulterError } from "multer";
import { storage } from "./storage";
import { parseFile, detectFormat } from "./parsers";
import { parsePdfFile, type PdfParseProgress } from "./pdf-parser";
import type { ConversionResult, ModbusSourceFormat } from "@shared/schema";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for PDFs
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [".csv", ".json", ".xml", ".pdf"];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed types: CSV, JSON, XML, PDF"));
    }
  },
});

// Error handling middleware for multer
function handleMulterError(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File is too large. Maximum size is 50MB.",
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Parse regular files (CSV, JSON, XML)
  app.post("/api/parse", upload.single("file"), handleMulterError, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file provided",
        });
      }

      const filename = req.file.originalname;
      const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));

      // Handle PDF files separately
      if (ext === ".pdf") {
        try {
          const registers = await parsePdfFile(req.file.buffer);

          if (registers.length === 0) {
            return res.status(400).json({
              success: false,
              message: "No Modbus registers found in the PDF. The document may not contain recognizable register tables.",
            });
          }

          await storage.createDocument({
            filename,
            sourceFormat: "pdf" as ModbusSourceFormat,
            registers,
          });

          const result: ConversionResult = {
            success: true,
            message: `Successfully extracted ${registers.length} registers from PDF`,
            registers,
            sourceFormat: "pdf" as ModbusSourceFormat,
            filename,
          };

          return res.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to parse PDF";
          return res.status(400).json({
            success: false,
            message,
          });
        }
      }

      // Handle regular files (CSV, JSON, XML)
      const content = req.file.buffer.toString("utf-8");
      const format = detectFormat(filename);

      const registers = parseFile(content, format);

      if (registers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid registers found in the file",
        });
      }

      await storage.createDocument({
        filename,
        sourceFormat: format,
        registers,
      });

      const result: ConversionResult = {
        success: true,
        message: `Successfully parsed ${registers.length} registers`,
        registers,
        sourceFormat: format,
        filename,
      };

      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse file";
      return res.status(400).json({
        success: false,
        message,
      });
    }
  });

  // Stream PDF parsing with progress updates (Server-Sent Events)
  app.post("/api/parse-pdf-stream", upload.single("file"), handleMulterError, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file provided",
      });
    }

    const filename = req.file.originalname;
    const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));

    if (ext !== ".pdf") {
      return res.status(400).json({
        success: false,
        message: "This endpoint only accepts PDF files",
      });
    }

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendProgress = (progress: PdfParseProgress) => {
      res.write(`data: ${JSON.stringify({ type: "progress", ...progress })}\n\n`);
    };

    try {
      const { registers, metadata } = await parsePdfFile(req.file.buffer, sendProgress);

      if (registers.length === 0) {
        res.write(`data: ${JSON.stringify({ 
          type: "error", 
          message: "No Modbus registers found in the PDF" 
        })}\n\n`);
        return res.end();
      }

      await storage.createDocument({
        filename,
        sourceFormat: "pdf" as ModbusSourceFormat,
        registers,
      });

      const result: ConversionResult = {
        success: true,
        message: `Successfully extracted ${registers.length} registers from PDF`,
        registers,
        sourceFormat: "pdf" as ModbusSourceFormat,
        filename,
        extractionMetadata: metadata,
      };

      res.write(`data: ${JSON.stringify({ type: "complete", result })}\n\n`);
      return res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse PDF";
      res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      return res.end();
    }
  });

  app.get("/api/documents", async (req, res) => {
    try {
      const documents = await storage.getAllDocuments();
      return res.json({ success: true, documents });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch documents",
      });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const document = await storage.getDocument(req.params.id);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }
      return res.json({ success: true, document });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch document",
      });
    }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteDocument(req.params.id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }
      return res.json({ success: true, message: "Document deleted" });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to delete document",
      });
    }
  });

  app.get("/api/health", (req, res) => {
    return res.json({ status: "healthy", service: "modbus-converter" });
  });

  return httpServer;
}
