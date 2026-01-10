/**
 * PDF Parser - Main Entry Point
 * 
 * This file re-exports from the modular pdf-parser/ directory for
 * backwards compatibility. New code should import from './pdf-parser/index'.
 * 
 * Module Structure:
 * - pdf-parser/types.ts: Shared interfaces and types
 * - pdf-parser/extractor.ts: PDF text extraction using pdfjs-dist
 * - pdf-parser/scorer.ts: Page relevance scoring
 * - pdf-parser/json-repair.ts: Malformed JSON recovery
 * - pdf-parser/llm-client.ts: Claude API interaction
 * - pdf-parser/index.ts: Main entry points and composition
 */

// Re-export everything from the modular implementation
export type {
  PdfExtractionResult,
  PdfParseProgress,
  PageData,
  PageMetadata,
  DocumentHint,
  PageHint,
  ModbusRegister,
  ExtractionMetadata,
} from "./pdf-parser/index";

export {
  extractPagesFromPdf,
  extractTextFromPdf,
  parseModbusRegistersFromContext,
  parseModbusRegistersFromText,
  parsePdfFile,
  parsePdfWithPageHints,
  parsePageRanges,
  testHelpers,
  isAbortError,
} from "./pdf-parser/index";
