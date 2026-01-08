/**
 * Validation middleware for Express routes.
 * 
 * Provides reusable validation functions for common patterns:
 * - File presence validation
 * - PDF file validation (extension + magic bytes)
 * - Page range validation
 * - Generic Zod schema body validation
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createLogger } from "../logger";

const log = createLogger("validation");

/**
 * Standard error response format for validation failures.
 */
function sendValidationError(res: Response, message: string): void {
  res.status(400).json({
    success: false,
    message,
  });
}

/**
 * Validate that a file was uploaded.
 */
export function validateFile(req: Request, res: Response, next: NextFunction): void {
  if (!req.file) {
    sendValidationError(res, "No file provided");
    return;
  }
  next();
}

/**
 * Validate that the uploaded file is a PDF.
 * Checks both extension and magic bytes.
 */
export function validatePdfFile(req: Request, res: Response, next: NextFunction): void {
  if (!req.file) {
    sendValidationError(res, "No file provided");
    return;
  }

  const filename = req.file.originalname;
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));

  if (ext !== ".pdf") {
    sendValidationError(res, "This endpoint only accepts PDF files");
    return;
  }

  // Check PDF magic bytes: %PDF
  const header = req.file.buffer.slice(0, 5).toString("ascii");
  if (!header.startsWith("%PDF")) {
    sendValidationError(res, "Invalid PDF file: missing PDF header");
    return;
  }

  next();
}

/**
 * Validate page range string format.
 * Valid formats: "1-10", "5", "1-5, 10, 15-20"
 */
export function validatePageRanges(req: Request, res: Response, next: NextFunction): void {
  const pageRangesStr = req.body?.pageRanges;

  if (!pageRangesStr || typeof pageRangesStr !== "string" || pageRangesStr.trim() === "") {
    sendValidationError(res, "Page ranges are required (e.g., '54-70' or '10, 15-20')");
    return;
  }

  // Parse and validate page ranges
  const parts = pageRangesStr.split(",").map((s: string) => s.trim()).filter(Boolean);
  
  if (parts.length === 0) {
    sendValidationError(res, "Invalid page range format. Use formats like '54-70' or '10, 15-20, 25'");
    return;
  }

  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s: string) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      
      if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
        sendValidationError(res, `Invalid page range: "${part}". Start must be >= 1 and end >= start`);
        return;
      }
    } else {
      const page = parseInt(part, 10);
      if (isNaN(page) || page < 1) {
        sendValidationError(res, `Invalid page number: "${part}". Page numbers must be >= 1`);
        return;
      }
    }
  }

  next();
}

/**
 * Format Zod validation errors into a user-friendly message.
 */
function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
  return issues.join("; ");
}

/**
 * Create a middleware that validates request body against a Zod schema.
 * 
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 * 
 * @example
 * const validateUser = createBodyValidator(z.object({
 *   name: z.string(),
 *   email: z.string().email(),
 * }));
 * 
 * app.post("/users", validateUser, (req, res) => {
 *   // req.body is now typed and validated
 * });
 */
export function createBodyValidator<T>(schema: z.ZodSchema<T>) {
  return function validateBody(req: Request, res: Response, next: NextFunction): void {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      const message = formatZodError(result.error);
      log.debug("Body validation failed", { errors: result.error.issues });
      sendValidationError(res, message);
      return;
    }

    // Replace body with parsed data (applies transformations)
    req.body = result.data;
    next();
  };
}

/**
 * Validate file content matches expected format based on extension.
 * Returns validation result object.
 */
export function validateFileContent(buffer: Buffer, ext: string): { valid: boolean; error?: string } {
  if (ext === ".pdf") {
    const header = buffer.slice(0, 5).toString("ascii");
    if (!header.startsWith("%PDF")) {
      return { valid: false, error: "Invalid PDF file: missing PDF header" };
    }
    return { valid: true };
  }

  const content = buffer.toString("utf-8");

  if (ext === ".json") {
    try {
      JSON.parse(content);
      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid JSON file: malformed JSON structure" };
    }
  }

  if (ext === ".xml") {
    const trimmed = content.trim();
    if (!trimmed.startsWith("<?xml") && !trimmed.startsWith("<")) {
      return { valid: false, error: "Invalid XML file: missing XML structure" };
    }
    return { valid: true };
  }

  if (ext === ".csv") {
    const lines = content.trim().split(/\r?\n/);
    if (lines.length < 1 || lines[0].trim().length === 0) {
      return { valid: false, error: "Invalid CSV file: empty or malformed" };
    }
    return { valid: true };
  }

  return { valid: true };
}

