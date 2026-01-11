import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer, { MulterError } from "multer";
import { storage, tempFileStorage } from "./storage";
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
import { optionalAuth, loadSubscription, requireAuth, requirePro } from "./middleware/auth";
import { usageMiddleware } from "./middleware/usage";
import { jsonError, jsonSuccess, jsonNotFound, jsonServerError } from "./utils/response-helpers";

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
      return jsonError(res, "File is too large. Maximum size is 50MB.");
    }
    return jsonError(res, err.message);
  }
  if (err) {
    return jsonError(res, err.message);
  }
  next();
}

/**
 * Register SSE routes BEFORE compression middleware.
 * These routes need unbuffered response streaming for real-time progress updates.
 */
export async function registerSSERoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Stream PDF parsing with progress updates (Server-Sent Events)
  // Rate limited: 10 requests per 15 minutes (expensive Claude API calls)
  // Uses validation middleware: validatePdfFile
  // Supports cancellation via client disconnect
  // Usage middleware: tracks for authenticated users, allows anonymous
  app.post("/api/v1/parse-pdf-stream", pdfParseLimiter, optionalAuth, loadSubscription, usageMiddleware, upload.single("file"), handleMulterError, validatePdfFile, async (req: Request, res: Response) => {
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

  // Re-extract with page hints - targeted extraction on specific pages (SSE)
  // Rate limited: 10 requests per 15 minutes (expensive Claude API calls)
  // Uses validation middleware: validatePdfFile, validatePageRanges
  // Supports cancellation via client disconnect
  // Usage middleware: tracks for authenticated users, allows anonymous
  app.post("/api/v1/parse-pdf-with-hints", pdfParseLimiter, optionalAuth, loadSubscription, usageMiddleware, upload.single("file"), handleMulterError, validatePdfFile, validatePageRanges, async (req: Request, res: Response) => {
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

  // =====================================================================
  // EventSource-based PDF processing (works better with proxies)
  // =====================================================================

  // Step 1: Upload PDF file and get a temporary file ID
  app.post("/api/v1/upload-pdf", pdfParseLimiter, optionalAuth, loadSubscription, usageMiddleware, upload.single("file"), handleMulterError, validatePdfFile, async (req: Request, res: Response) => {
    const filename = req.file!.originalname;
    
    // Parse optional page ranges and existing registers
    let pageRanges: string | undefined;
    let existingRegisters: ModbusRegister[] = [];
    
    if (req.body.pageRanges) {
      pageRanges = req.body.pageRanges;
    }
    
    try {
      if (req.body.existingRegisters) {
        existingRegisters = JSON.parse(req.body.existingRegisters);
      }
    } catch {
      // Ignore parse errors
    }
    
    // Store file temporarily
    const fileId = tempFileStorage.store(req.file!.buffer, filename, pageRanges, existingRegisters);
    
    log.info("PDF uploaded for processing", { fileId, filename, hasPageRanges: !!pageRanges });
    
    return res.json({
      success: true,
      fileId,
      filename,
      message: "File uploaded successfully. Connect to process endpoint for real-time progress.",
    });
  });

  // Step 2: Process PDF via EventSource (GET request for SSE compatibility)
  app.get("/api/v1/process-pdf/:fileId", async (req: Request, res: Response) => {
    const { fileId } = req.params;
    
    // Retrieve the uploaded file
    const tempFile = tempFileStorage.get(fileId);
    if (!tempFile) {
      return res.status(404).json({
        success: false,
        error: "FILE_NOT_FOUND",
        message: "File not found or expired. Please re-upload.",
      });
    }
    
    const { buffer, filename, pageRanges, existingRegisters } = tempFile;
    
    // Create abort controller for cancellation support
    const abortController = new AbortController();
    
    // Set up SSE connection
    const sse = createSSEConnection(res, {
      timeoutMs: SSE_CONFIG.DEFAULT_TIMEOUT_MS,
      onTimeout: () => {
        log.warn("SSE timeout during PDF processing", { fileId, filename });
        abortController.abort();
      },
      onClose: () => {
        log.info("Client disconnected during PDF processing", { fileId, filename });
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
      let parseResult;
      
      if (pageRanges) {
        // Parse with page hints
        const hints = parsePageRanges(pageRanges);
        parseResult = await parsePdfWithPageHints(
          buffer,
          hints,
          existingRegisters || [],
          sendProgress,
          abortController.signal
        );
      } else {
        // Check cache first
        const cacheKey = pdfCache.getHash(buffer);
        const cached = pdfCache.get(cacheKey);
        
        if (cached && cached.registers.length > 0) {
          sse.sendProgress(100, "Retrieved from cache", undefined, { stage: "complete" });
          
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
          tempFileStorage.delete(fileId);
          return;
        }
        
        // Full parse
        parseResult = await parsePdfFile(buffer, sendProgress, abortController.signal);
        
        // Cache successful results
        if (parseResult.registers.length > 0) {
          pdfCache.set(cacheKey, parseResult);
        }
      }
      
      const { registers, metadata } = parseResult;
      
      if (!sse.isActive()) {
        return;
      }
      
      if (registers.length === 0) {
        sse.sendError("No Modbus registers found in the PDF");
        tempFileStorage.delete(fileId);
        return;
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
      
      sse.sendComplete(result);
      tempFileStorage.delete(fileId);
    } catch (error) {
      tempFileStorage.delete(fileId);
      if (isAbortError(error)) {
        log.info("PDF processing cancelled", { fileId, filename });
        sse.sendError("Processing cancelled");
      } else {
        const message = error instanceof Error ? error.message : "Failed to parse PDF";
        sse.sendError(message);
      }
    }
  });

  return httpServer;
}

/**
 * Register remaining routes AFTER compression middleware.
 * These routes benefit from response compression.
 */
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Parse regular files (CSV, JSON, XML, PDF)
  // Usage middleware: tracks for authenticated users, allows anonymous
  app.post("/api/v1/parse", fileParseLimiter, optionalAuth, loadSubscription, usageMiddleware, upload.single("file"), handleMulterError, async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return jsonError(res, "No file provided");
      }

      const filename = req.file.originalname;
      const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));

      // Validate file content matches expected format
      const validation = validateFileContent(req.file.buffer, ext);
      if (!validation.valid) {
        return jsonError(res, validation.error!);
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
            return jsonError(res, "No Modbus registers found in the PDF. The document may not contain recognizable register tables.");
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
          return jsonError(res, message);
        }
      }

      // Handle regular files (CSV, JSON, XML)
      const content = req.file.buffer.toString("utf-8");
      const format = detectFormat(filename);

      const registers = parseFile(content, format);

      if (registers.length === 0) {
        return jsonError(res, "No valid registers found in the file");
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
      return jsonError(res, message);
    }
  });

  // Analyze PDF for page suggestions (lightweight scoring, no LLM calls)
  // Rate limited: 30 requests per 15 minutes (cheaper than parsing)
  // Uses validation middleware: validatePdfFile
  app.post("/api/v1/analyze-pdf", fileParseLimiter, upload.single("file"), handleMulterError, validatePdfFile, async (req: Request, res: Response) => {
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

      return jsonSuccess(res, { totalPages, suggestedPages, hints: hints.slice(0, 5) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyze PDF";
      log.error("PDF analysis failed", { error: message });
      return jsonError(res, message);
    }
  });

  // GET /api/v1/documents - List documents with optional folder filter
  // For authenticated users, filters by userId; for Pro users, can filter by folder
  app.get("/api/v1/documents", documentLimiter, optionalAuth, loadSubscription, async (req, res) => {
    try {
      const folderId = req.query.folderId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // Build filter
      const filter: { userId?: string; folderId?: string | null } = {};

      // If user is authenticated, filter by their userId
      if (req.user) {
        filter.userId = req.user.id;
      }

      // Handle folder filter (Pro only)
      if (folderId !== undefined && req.user) {
        // Check if user is Pro for folder filtering
        if (req.subscription?.tier === 'pro') {
          filter.folderId = folderId === 'root' ? null : folderId;
        }
      }

      const documents = await storage.getAllDocuments(filter, { limit, offset });
      return jsonSuccess(res, { documents });
    } catch (error) {
      return jsonServerError(res, "Failed to fetch documents");
    }
  });

  app.get("/api/v1/documents/:id", documentLimiter, optionalAuth, async (req, res) => {
    try {
      // If user is authenticated, verify ownership
      const userId = req.user?.id;
      const document = await storage.getDocument(req.params.id, userId);
      if (!document) {
        return jsonNotFound(res, "Document");
      }
      return jsonSuccess(res, { document });
    } catch (error) {
      return jsonServerError(res, "Failed to fetch document");
    }
  });

  app.delete("/api/v1/documents/:id", documentLimiter, optionalAuth, async (req, res) => {
    try {
      // If user is authenticated, verify ownership
      const userId = req.user?.id;
      const deleted = await storage.deleteDocument(req.params.id, userId);
      if (!deleted) {
        return jsonNotFound(res, "Document");
      }
      return jsonSuccess(res, { message: "Document deleted" });
    } catch (error) {
      return jsonServerError(res, "Failed to delete document");
    }
  });

  // POST /api/v1/documents/:id/move - Move document to folder (Pro only)
  app.post("/api/v1/documents/:id/move", requireAuth, loadSubscription, requirePro, async (req, res) => {
    try {
      const { folderId } = req.body;

      if (!storage.moveDocument) {
        return jsonError(res, "Document moving not supported", 501);
      }

      await storage.moveDocument(req.params.id, req.user!.id, folderId || null);
      return jsonSuccess(res, { message: "Document moved" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to move document";
      return jsonError(res, message);
    }
  });

  app.get("/api/v1/health", async (req, res) => {
    const { checkDatabaseConnection } = await import("./db");
    const dbHealthy = await checkDatabaseConnection();

    return res.json({
      status: "healthy",
      service: "modbus-converter",
      version: "v1",
      database: dbHealthy ? "connected" : "in-memory",
      timestamp: new Date().toISOString(),
    });
  });

  // Legacy routes (backward compatibility) - redirect to v1
  // Helper to create legacy route redirect middleware
  const createLegacyRedirect = (pattern: string) => (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/v1/")) {
      const newPath = req.path.replace("/api/", "/api/v1/");
      // Preserve query string for all redirects
      const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
      log.warn("Legacy API endpoint used, redirecting", { oldPath: req.path, newPath });
      res.redirect(307, newPath + queryString);
    } else {
      next();
    }
  };

  app.use("/api/parse*", createLegacyRedirect("/api/parse"));
  app.use("/api/documents*", createLegacyRedirect("/api/documents"));
  app.use("/api/analyze-pdf", createLegacyRedirect("/api/analyze-pdf"));
  app.use("/api/health", createLegacyRedirect("/api/health"));

  return httpServer;
}
