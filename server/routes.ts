import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { parseFile, detectFormat } from "./parsers";
import type { ConversionResult, ModbusFileFormat } from "@shared/schema";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [".csv", ".json", ".xml"];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed types: CSV, JSON, XML"));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/parse", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file provided",
        });
      }

      const filename = req.file.originalname;
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
