import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer, { MulterError } from "multer";
import { storage } from "./storage";
import { parseFile, detectFormat } from "./parsers";
import { parsePdfFile, parsePdfWithPageHints, parsePageRanges, type PdfParseProgress } from "./pdf-parser";
import { scoreAllPagesLightweight } from "./pdf-parser/extractor";
import { pdfCache } from "./cache";
import { pdfParseLimiter, fileParseLimiter, documentLimiter } from "./rate-limit";
import { createSSEConnection, SSE_CONFIG } from "./sse-utils";
import type { ConversionResult, ModbusSourceFormat, ModbusRegister } from "@shared/schema";
import { createLogger } from "./logger";
import { validateFileContent, validatePdfFile, validatePageRanges } from "./middleware/validation";
import { isAbortError } from "./pdf-parser";

const log = createLogger("routes");

// MIME types allowed per file extension
const allowedMimeTypes: Record<string, string[]> = {
  ".csv": ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"],
  ".json": ["application/json", "text/plain"],
  ".xml": ["application/xml", "text/xml", "text/plain"],
  ".pdf": ["application/pdf"],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for PDFs
  },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    const validExtensions = Object.keys(allowedMimeTypes);

    if (!validExtensions.includes(ext)) {
      cb(new Error("Invalid file type. Allowed types: CSV, JSON, XML, PDF"));
      return;
    }

    // Validate MIME type matches extension
    const expectedMimes = allowedMimeTypes[ext];
    if (!expectedMimes.includes(file.mimetype)) {
      cb(new Error(`MIME type mismatch for ${ext} file. Expected: ${expectedMimes.join(", ")}, got: ${file.mimetype}`));
      return;
    }

    cb(null, true);
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
  app.post("/api/parse", fileParseLimiter, upload.single("file"), handleMulterError, async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file provided",
        });
      }

      const filename = req.file.originalname;
      const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));

      // Validate file content matches expected format
      const validation = validateFileContent(req.file.buffer, ext);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.error,
        });
      }

      // Handle PDF files separately
      if (ext === ".pdf") {
        try {
          // Check cache first
          const cacheKey = pdfCache.getHash(req.file.buffer);
          const cached = pdfCache.get(cacheKey);

          let registers: ModbusRegister[];
          let metadata;
          let fromCache = false;

          if (cached) {
            registers = cached.registers;
            metadata = cached.metadata;
            fromCache = true;
          } else {
            const parseResult = await parsePdfFile(req.file.buffer);
            registers = parseResult.registers;
            metadata = parseResult.metadata;

            // Cache successful results
            if (registers.length > 0) {
              pdfCache.set(cacheKey, parseResult);
            }
          }

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
            message: fromCache
              ? `Retrieved ${registers.length} registers from cache`
              : `Successfully extracted ${registers.length} registers from PDF`,
            registers,
            sourceFormat: "pdf" as ModbusSourceFormat,
            filename,
            extractionMetadata: metadata,
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

  // Analyze PDF for page suggestions (lightweight scoring, no LLM calls)
  // Rate limited: 30 requests per 15 minutes (cheaper than parsing)
  // Uses validation middleware: validatePdfFile
  app.post("/api/analyze-pdf", fileParseLimiter, upload.single("file"), handleMulterError, validatePdfFile, async (req: Request, res: Response) => {
    try {
      const { metadata, hints, totalPages } = await scoreAllPagesLightweight(req.file!.buffer);

      // Sort by score descending and filter to relevant pages
      const sortedPages = [...metadata].sort((a, b) => b.score - a.score);
      
      // Include pages with high score (>5) or medium score with tables (>2)
      const suggestedPages = sortedPages
        .filter(p => p.score > 5 || (p.hasTable && p.score > 2))
        .map(p => ({
          pageNum: p.pageNum,
          score: p.score,
          hasTable: p.hasTable,
          sectionTitle: p.sectionTitle,
        }));

      return res.json({
        success: true,
        totalPages,
        suggestedPages,
        hints: hints.slice(0, 5), // Limit hints to top 5
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyze PDF";
      log.error("PDF analysis failed", { error: message });
      return res.status(400).json({
        success: false,
        message,
      });
    }
  });

  // Stream PDF parsing with progress updates (Server-Sent Events)
  // Rate limited: 10 requests per 15 minutes (expensive Claude API calls)
  // Uses validation middleware: validatePdfFile
  // Supports cancellation via client disconnect
  app.post("/api/parse-pdf-stream", pdfParseLimiter, upload.single("file"), handleMulterError, validatePdfFile, async (req: Request, res: Response) => {
    // File validated by middleware
    const filename = req.file!.originalname;

    // Create abort controller for cancellation support
    const abortController = new AbortController();

    // Check cache before starting SSE
    const cacheKey = pdfCache.getHash(req.file!.buffer);
    const cached = pdfCache.get(cacheKey);

    // Set up SSE with timeout (5 minutes default)
    // Use res.on("close") via SSE utility to detect client disconnect (not req.on("close"))
    const sse = createSSEConnection(res, {
      timeoutMs: SSE_CONFIG.DEFAULT_TIMEOUT_MS,
      onTimeout: () => {
        log.warn("SSE timeout during PDF parsing", { filename });
        abortController.abort();
      },
      onClose: () => {
        log.info("Client disconnected, aborting PDF processing", { filename });
        abortController.abort();
      },
    });

    // If cached, return immediately
    if (cached && cached.registers.length > 0) {
      sse.sendProgress(100, "Retrieved from cache");

      await storage.createDocument({
        filename,
        sourceFormat: "pdf" as ModbusSourceFormat,
        registers: cached.registers,
      });

      const result: ConversionResult = {
        success: true,
        message: `Retrieved ${cached.registers.length} registers from cache`,
        registers: cached.registers,
        sourceFormat: "pdf" as ModbusSourceFormat,
        filename,
        extractionMetadata: cached.metadata,
      };

      sse.sendComplete(result);
      return;
    }

    const sendProgress = (progress: PdfParseProgress) => {
      if (sse.isActive()) {
        sse.sendProgress(progress.progress, progress.message, progress.details, {
          stage: progress.stage,
          totalBatches: progress.totalBatches,
          currentBatch: progress.currentBatch,
          totalPages: progress.totalPages,
          pagesProcessed: progress.pagesProcessed,
        });
      }
    };

    try {
      const parseResult = await parsePdfFile(req.file!.buffer, sendProgress, abortController.signal);
      const { registers, metadata } = parseResult;

      if (!sse.isActive()) {
        // Client disconnected or timed out during processing
        return;
      }

      if (registers.length === 0) {
        sse.sendError("No Modbus registers found in the PDF");
        return;
      }

      // Cache successful results
      pdfCache.set(cacheKey, parseResult);

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

      sse.sendComplete(result);
    } catch (error) {
      if (isAbortError(error)) {
        log.info("PDF processing cancelled", { filename });
        sse.sendError("Processing cancelled");
      } else {
      const message = error instanceof Error ? error.message : "Failed to parse PDF";
      sse.sendError(message);
      }
    }
  });

  // Re-extract with page hints - targeted extraction on specific pages
  // Rate limited: 10 requests per 15 minutes (expensive Claude API calls)
  // Uses validation middleware: validatePdfFile, validatePageRanges
  // Supports cancellation via client disconnect
  app.post("/api/parse-pdf-with-hints", pdfParseLimiter, upload.single("file"), handleMulterError, validatePdfFile, validatePageRanges, async (req: Request, res: Response) => {
    // File and page ranges validated by middleware
    const filename = req.file!.originalname;
    const pageHints = parsePageRanges(req.body.pageRanges);

    // Create abort controller for cancellation support
    const abortController = new AbortController();

    // Parse existing registers from request body
    let existingRegisters: ModbusRegister[] = [];
    try {
      if (req.body.existingRegisters) {
        existingRegisters = JSON.parse(req.body.existingRegisters);
      }
    } catch {
      // Ignore parse errors, start fresh
    }

    // Set up SSE with timeout (5 minutes default)
    // Use res.on("close") via SSE utility to detect client disconnect (not req.on("close"))
    const sse = createSSEConnection(res, {
      timeoutMs: SSE_CONFIG.DEFAULT_TIMEOUT_MS,
      onTimeout: () => {
        log.warn("SSE timeout during PDF parsing with hints", { filename });
        abortController.abort();
      },
      onClose: () => {
        log.info("Client disconnected, aborting PDF processing with hints", { filename });
        abortController.abort();
      },
    });

    const sendProgress = (progress: PdfParseProgress) => {
      if (sse.isActive()) {
        sse.sendProgress(progress.progress, progress.message, progress.details, {
          stage: progress.stage,
          totalBatches: progress.totalBatches,
          currentBatch: progress.currentBatch,
          totalPages: progress.totalPages,
          pagesProcessed: progress.pagesProcessed,
        });
      }
    };

    try {
      const { registers, metadata } = await parsePdfWithPageHints(
        req.file!.buffer, 
        pageHints, 
        existingRegisters,
        sendProgress,
        abortController.signal
      );

      if (!sse.isActive()) {
        // Client disconnected or timed out during processing
        return;
      }

      if (registers.length === 0) {
        sse.sendError("No Modbus registers found in the specified pages");
        return;
      }

      await storage.createDocument({
        filename,
        sourceFormat: "pdf" as ModbusSourceFormat,
        registers,
      });

      const result: ConversionResult = {
        success: true,
        message: `Successfully extracted ${registers.length} registers from specified pages`,
        registers,
        sourceFormat: "pdf" as ModbusSourceFormat,
        filename,
        extractionMetadata: metadata,
      };

      sse.sendComplete(result);
    } catch (error) {
      if (isAbortError(error)) {
        log.info("PDF processing with hints cancelled", { filename });
        sse.sendError("Processing cancelled");
      } else {
      const message = error instanceof Error ? error.message : "Failed to parse PDF";
      sse.sendError(message);
      }
    }
  });

  app.get("/api/documents", documentLimiter, async (req, res) => {
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

  app.get("/api/documents/:id", documentLimiter, async (req, res) => {
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

  app.delete("/api/documents/:id", documentLimiter, async (req, res) => {
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
