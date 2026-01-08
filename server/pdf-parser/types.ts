/**
 * Shared types for PDF parsing module.
 */

import type { ModbusRegister, ExtractionMetadata } from "@shared/schema";

/**
 * Result of PDF extraction containing registers and metadata.
 */
export interface PdfExtractionResult {
  registers: ModbusRegister[];
  metadata: ExtractionMetadata;
}

/**
 * Progress update during PDF parsing.
 */
export interface PdfParseProgress {
  stage: "extracting" | "scoring" | "analyzing" | "parsing" | "complete" | "error";
  progress: number;
  message: string;
  details?: string;
}

/**
 * Data extracted from a single PDF page.
 */
export interface PageData {
  pageNum: number;
  text: string;
  score: number;
  hasTable: boolean;
  sectionTitle?: string;
}

/**
 * Lightweight metadata for memory-efficient scoring (Pass 1).
 */
export interface PageMetadata {
  pageNum: number;
  score: number;
  hasTable: boolean;
  sectionTitle?: string;
}

/**
 * Hint extracted from document structure.
 */
export interface DocumentHint {
  type: string;
  context: string;
}

/**
 * User-provided hint about which pages to extract.
 */
export interface PageHint {
  start: number;
  end: number;
}

// Re-export commonly used shared types
export type { ModbusRegister, ExtractionMetadata };

