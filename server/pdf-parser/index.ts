/**
 * PDF Parser Module
 * 
 * Modular PDF parsing system for extracting Modbus register definitions
 * from industrial equipment documentation.
 * 
 * Architecture:
 * - types.ts: Shared interfaces and types
 * - extractor.ts: PDF text extraction using pdfjs-dist
 * - scorer.ts: Page relevance scoring
 * - json-repair.ts: Malformed JSON recovery
 * - llm-client.ts: Claude API interaction
 * - index.ts: Main entry points and composition
 */

// Re-export all types
export type {
  PdfExtractionResult,
  PdfParseProgress,
  PageData,
  PageMetadata,
  DocumentHint,
  PageHint,
  ModbusRegister,
  ExtractionMetadata,
} from "./types";

// Import from sub-modules
import type { ModbusRegister, ExtractionMetadata } from "@shared/schema";
import type { PdfExtractionResult, PdfParseProgress, PageData, DocumentHint, PageHint } from "./types";
import { extractPagesFromPdf, scoreAllPagesLightweight, extractSpecificPages, extractTextFromPdf } from "./extractor";
import { scorePages, assembleExtractionContext, extractDocumentHints, calculatePageScore, hasRegisterIndicators, extractSectionTitle, detectTableStructure } from "./scorer";
import { repairJson, extractRegistersFromMalformedJson } from "./json-repair";
import { parseModbusRegistersFromContext, parseModbusRegistersFromText, mergeAndDeduplicateRegisters, calculateConfidenceLevel } from "./llm-client";
import { createLogger } from "../logger";

const log = createLogger("pdf-parser");

// Re-export key functions
export { extractPagesFromPdf, extractTextFromPdf };
export { parseModbusRegistersFromContext, parseModbusRegistersFromText };

// Configuration
const PAGES_PER_BATCH = 4; // Process 4 pages at a time for balance of cost vs. accuracy
const PARALLEL_BATCHES = parseInt(process.env.PDF_PARALLEL_BATCHES || "2", 10); // Process batches in parallel for faster extraction

/**
 * Check if an error is an AbortError (from AbortController.abort())
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Check if the abort signal has been triggered and throw if so.
 */
function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("Operation cancelled");
    error.name = "AbortError";
    throw error;
  }
}

interface BatchResult {
  batchNum: number;
  pageRange: string;
  registersFound: number;
  registers: ModbusRegister[];
}

interface BatchError {
  batch: number;
  pages: string;
  error: string;
}

interface BatchProcessingResult {
  registers: ModbusRegister[];
  results: BatchResult[];
  errors: BatchError[];
}

interface BatchProgressCallback {
  (batchNum: number, totalBatches: number, registersFound: number, pageRange: string, totalRegisters: number): void;
}

/**
 * Format page numbers into a human-readable range string.
 */
function formatPageRange(pageNums: number[]): string {
  return pageNums.length === 1
    ? `${pageNums[0]}`
    : `${pageNums[0]}-${pageNums[pageNums.length - 1]}`;
}

/**
 * Create batches from pages array.
 */
function createBatches(pages: PageData[]): PageData[][] {
  const batches: PageData[][] = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_BATCH) {
    batches.push(pages.slice(i, i + PAGES_PER_BATCH));
  }
  return batches;
}

/**
 * Extract registers from a batch of pages.
 */
async function extractBatch(
  pages: PageData[],
  batchNum: number,
  hints: DocumentHint[],
  signal?: AbortSignal
): Promise<BatchResult> {
  checkAborted(signal);

  const pageNums = pages.map(p => p.pageNum);
  const pageRange = formatPageRange(pageNums);

  // Build context for this batch
  let context = "";

  if (hints.length > 0 && batchNum === 1) {
    context += "DOCUMENT CONVENTIONS:\n" +
      hints.slice(0, 3).map(h => `- ${h.type}: ${h.context}`).join("\n") + "\n\n";
  }

  for (const page of pages) {
    context += `--- PAGE ${page.pageNum} ---\n`;
    if (page.sectionTitle) {
      context += `[${page.sectionTitle}]\n`;
    }
    context += page.text + "\n\n";
  }

  log.debug("Processing batch", { batch: batchNum, pages: pageRange, contextLength: context.length });

  const registers = await parseModbusRegistersFromContext(context, signal);

  log.info("Batch complete", { batch: batchNum, pages: pageRange, registersFound: registers.length });

  return {
    batchNum,
    pageRange,
    registersFound: registers.length,
    registers,
  };
}

/**
 * Process batches in parallel with progress updates.
 */
async function processBatchesInParallel(
  batches: PageData[][],
  hints: DocumentHint[],
  onProgress?: BatchProgressCallback,
  signal?: AbortSignal
): Promise<BatchProcessingResult> {
  const allRegisters: ModbusRegister[] = [];
  const batchResults: BatchResult[] = [];
  const batchErrors: BatchError[] = [];

  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    checkAborted(signal);

    // Get chunk of batches to process in parallel
    const batchChunk = batches.slice(i, i + PARALLEL_BATCHES);
    const batchNumbers = batchChunk.map((_, idx) => i + idx + 1);

    log.info("Processing batch chunk in parallel", {
      batches: batchNumbers,
      parallelCount: batchChunk.length,
    });

    // Process all batches in chunk simultaneously
    const results = await Promise.allSettled(
      batchChunk.map((batch, idx) => extractBatch(batch, batchNumbers[idx], hints, signal))
    );

    // Collect results and errors
    for (let idx = 0; idx < results.length; idx++) {
      const result = results[idx];
      const batchNum = batchNumbers[idx];
      const batch = batchChunk[idx];
      const pageNums = batch.map(p => p.pageNum);
      const pageRange = formatPageRange(pageNums);

      if (result.status === "fulfilled") {
        batchResults.push(result.value);
        allRegisters.push(...result.value.registers);

        // Send progress update
        onProgress?.(batchNum, batches.length, result.value.registersFound, pageRange, allRegisters.length);
      } else {
        // Handle rejection
        const error = result.reason;
        if (isAbortError(error)) throw error;

        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Batch processing error", {
          batch: batchNum,
          pages: pageRange,
          error: errorMessage,
        });

        batchErrors.push({
          batch: batchNum,
          pages: pageRange,
          error: errorMessage,
        });
      }
    }
  }

  return { registers: allRegisters, results: batchResults, errors: batchErrors };
}

/**
 * Main entry point: Batch-based PDF parsing pipeline.
 * 
 * Uses a multi-pass approach:
 * 1. Memory-efficient page scoring (discards text after scoring)
 * 2. Selective extraction of relevant pages
 * 3. Batch processing with LLM
 * 4. Merge and deduplicate results
 * 
 * @param buffer - PDF file buffer
 * @param onProgress - Optional progress callback
 * @param signal - Optional AbortSignal for cancellation
 */
export async function parsePdfFile(
  buffer: Buffer,
  onProgress?: (progress: PdfParseProgress) => void,
  signal?: AbortSignal
): Promise<PdfExtractionResult> {
  const startTime = Date.now();

  try {
    // Check for cancellation before starting
    checkAborted(signal);

    // PASS 1: Memory-efficient scoring
    onProgress?.({
      stage: "uploading",
      progress: 5,
      message: "Uploading PDF...",
    });

    onProgress?.({
      stage: "scoring",
      progress: 10,
      message: "Analyzing PDF pages for relevance...",
    });

    const { metadata: pageMetadata, hints, totalPages } = await scoreAllPagesLightweight(buffer);
    
    // Check for cancellation after scoring
    checkAborted(signal);

    if (totalPages === 0) {
      throw new Error("PDF appears to be empty or contains no extractable text.");
    }

    onProgress?.({
      stage: "scoring",
      progress: 20,
      message: `Scored ${totalPages} pages`,
      details: `Found ${hints.length} document hints`,
      totalPages,
    });

    // Select relevant pages based on scores
    const highPages = pageMetadata.filter(p => p.score > 5);
    const medPages = pageMetadata.filter(p => p.score > 2 && p.score <= 5);
    const lowPagesWithTables = pageMetadata.filter(p => p.score <= 2 && p.hasTable);

    // Collect page numbers to extract
    const pageNumbersToExtract = new Set<number>();
    for (const p of [...highPages, ...medPages, ...lowPagesWithTables]) {
      pageNumbersToExtract.add(p.pageNum);
    }

    const pagesAnalyzed = pageNumbersToExtract.size;

    log.info("Page selection complete", { high: highPages.length, medium: medPages.length, lowWithTables: lowPagesWithTables.length });

    onProgress?.({
      stage: "scoring",
      progress: 25,
      message: `Found ${pagesAnalyzed} relevant pages to process`,
      details: `${highPages.length} high, ${medPages.length} medium, ${lowPagesWithTables.length} table-only`,
      totalPages,
      pagesProcessed: pagesAnalyzed,
    });

    if (pagesAnalyzed === 0) {
      throw new Error("Could not find any pages with register-related content in the PDF.");
    }

    // PASS 2: Extract only the relevant pages
    onProgress?.({
      stage: "extracting",
      progress: 28,
      message: `Extracting ${pagesAnalyzed} relevant pages...`,
      totalPages,
      pagesProcessed: pagesAnalyzed,
    });

    const pagesToProcess = await extractSpecificPages(buffer, Array.from(pageNumbersToExtract));

    onProgress?.({
      stage: "extracting",
      progress: 30,
      message: `Extracted ${pagesToProcess.length} pages for processing`,
      totalPages,
      pagesProcessed: pagesToProcess.length,
    });

    // PASS 3: Batch processing with LLM
    const batches = createBatches(pagesToProcess);
    const totalBatches = batches.length;

    onProgress?.({
      stage: "parsing",
      progress: 32,
      message: `Processing ${pagesAnalyzed} pages in ${totalBatches} batches...`,
      details: `Batch size: ${PAGES_PER_BATCH} pages`,
      totalBatches,
      currentBatch: 0,
      totalPages,
      pagesProcessed: pagesAnalyzed,
    });

    // Process batches in parallel for faster extraction
    const { registers: allRegisters, results: batchResults, errors: batchErrors } = await processBatchesInParallel(
      batches,
      hints,
      (batchNum, _totalBatches, registersFound, pageRange, totalRegisters) => {
        const progress = Math.round((batchNum / totalBatches) * 58) + 32;
        onProgress?.({
          stage: "analyzing",
          progress,
          message: `Batch ${batchNum}/${totalBatches}: Found ${registersFound} registers`,
          details: `Pages ${pageRange} complete. Total: ${totalRegisters} registers`,
          totalBatches,
          currentBatch: batchNum,
          totalPages,
          pagesProcessed: pagesAnalyzed,
        });
      },
      signal
    );

    // PASS 4: Merge and deduplicate
    onProgress?.({
      stage: "parsing",
      progress: 92,
      message: "Merging and deduplicating registers...",
      details: `Processing ${allRegisters.length} total extracted registers`,
      totalBatches,
      currentBatch: totalBatches,
      totalPages,
      pagesProcessed: pagesAnalyzed,
    });

    const registers = mergeAndDeduplicateRegisters(allRegisters);
    const processingTimeMs = Date.now() - startTime;

    onProgress?.({
      stage: "complete",
      progress: 100,
      message: `Extraction complete: ${registers.length} unique registers`,
      details: `Processed ${pagesAnalyzed} pages in ${totalBatches} batches`,
      totalBatches,
      currentBatch: totalBatches,
      totalPages,
      pagesProcessed: pagesAnalyzed,
    });

    // Build batch summary for metadata
    const batchSummary = batchResults.map(b =>
      `Pages ${b.pageRange}: ${b.registersFound} registers`
    ).join("; ");

    const metadata: ExtractionMetadata = {
      totalPages,
      pagesAnalyzed,
      registersFound: registers.length,
      highRelevancePages: highPages.length,
      confidenceLevel: calculateConfidenceLevel(registers.length, highPages.length, totalPages),
      processingTimeMs,
      batchSummary,
      processingErrors: batchErrors.length > 0 ? batchErrors : undefined,
      partialExtraction: batchErrors.length > 0,
    };

    return { registers, metadata };
  } catch (error) {
    onProgress?.({
      stage: "error",
      progress: 0,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Parse page range string into PageHint array.
 * Supports formats like "1-5, 10, 15-20"
 */
export function parsePageRanges(rangeString: string): PageHint[] {
  const hints: PageHint[] = [];
  const parts = rangeString.split(",").map(s => s.trim()).filter(Boolean);
  
  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map(s => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
        hints.push({ start, end });
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page > 0) {
        hints.push({ start: page, end: page });
      }
    }
  }
  
  return hints;
}

/**
 * Targeted page extraction with user-specified page hints.
 * Allows re-extraction from specific pages when initial extraction is incomplete.
 * 
 * @param buffer - PDF file buffer
 * @param pageHints - Array of page ranges to extract
 * @param existingRegisters - Previously extracted registers to merge with
 * @param onProgress - Optional progress callback
 * @param signal - Optional AbortSignal for cancellation
 */
export async function parsePdfWithPageHints(
  buffer: Buffer,
  pageHints: PageHint[],
  existingRegisters: ModbusRegister[],
  onProgress?: (progress: PdfParseProgress) => void,
  signal?: AbortSignal
): Promise<PdfExtractionResult> {
  const startTime = Date.now();
  
  try {
    // Check for cancellation before starting
    checkAborted(signal);

    onProgress?.({
      stage: "uploading",
      progress: 5,
      message: "Uploading PDF...",
    });

    onProgress?.({
      stage: "extracting",
      progress: 10,
      message: "Extracting specified pages...",
    });

    const { pages, hints } = await extractPagesFromPdf(buffer);
    
    // Check for cancellation after extraction
    checkAborted(signal);
    const totalPages = pages.length;
    
    // Validate and clamp page hints to valid bounds, de-duplicate
    const validPageNums = new Set<number>();
    const outOfRange: number[] = [];
    
    for (const hint of pageHints) {
      const clampedStart = Math.max(1, hint.start);
      const clampedEnd = Math.min(totalPages, hint.end);
      
      if (hint.start > totalPages) {
        outOfRange.push(hint.start);
      }
      if (hint.end > totalPages && hint.start <= totalPages) {
        outOfRange.push(hint.end);
      }
      
      for (let p = clampedStart; p <= clampedEnd; p++) {
        validPageNums.add(p);
      }
    }
    
    if (validPageNums.size === 0) {
      throw new Error(`Invalid page ranges. The PDF has ${totalPages} pages. Specified pages (${outOfRange.join(", ")}) are out of range.`);
    }
    
    // Log warning for out-of-range pages
    if (outOfRange.length > 0) {
      log.warn("Pages out of range", { outOfRange, totalPages });
    }
    
    // Filter to only requested valid pages
    const targetPages: PageData[] = [];
    const validPageArray = Array.from(validPageNums).sort((a, b) => a - b);
    for (const pageNum of validPageArray) {
      const page = pages.find(pg => pg.pageNum === pageNum);
      if (page) {
        targetPages.push(page);
      }
    }
    
    if (targetPages.length === 0) {
      throw new Error("No valid pages found in the specified ranges.");
    }
    
    onProgress?.({
      stage: "extracting",
      progress: 15,
      message: `Found ${targetPages.length} pages in specified ranges`,
      totalPages,
      pagesProcessed: targetPages.length,
    });

    // Process in batches
    const batches = createBatches(targetPages);
    const totalBatches = batches.length;

    onProgress?.({
      stage: "parsing",
      progress: 20,
      message: `Processing ${targetPages.length} pages in ${totalBatches} batches...`,
      totalBatches,
      currentBatch: 0,
      totalPages,
      pagesProcessed: targetPages.length,
    });

    // Process batches in parallel for faster extraction
    const { registers: allRegisters, results: batchResults, errors: batchErrors } = await processBatchesInParallel(
      batches,
      hints,
      (batchNum, _totalBatches, registersFound, pageRange, totalRegisters) => {
        const progress = 20 + Math.round((batchNum / totalBatches) * 70);
        onProgress?.({
          stage: "analyzing",
          progress,
          message: `Batch ${batchNum}/${totalBatches}: Found ${registersFound} registers`,
          details: `Pages ${pageRange} complete. Total: ${totalRegisters} registers`,
          totalBatches,
          currentBatch: batchNum,
          totalPages,
          pagesProcessed: targetPages.length,
        });
      },
      signal
    );

    // Merge and deduplicate new registers
    const newRegisters = mergeAndDeduplicateRegisters(allRegisters);
    
    // Merge with existing registers, avoiding duplicates by address
    const existingAddresses = new Set(existingRegisters.map(r => r.address));
    const uniqueNewRegisters = newRegisters.filter(r => !existingAddresses.has(r.address));
    const mergedRegisters = [...existingRegisters, ...uniqueNewRegisters];
    
    // Sort by address
    mergedRegisters.sort((a, b) => a.address - b.address);
    
    const processingTimeMs = Date.now() - startTime;
    
    onProgress?.({
      stage: "complete",
      progress: 100,
      message: `Found ${uniqueNewRegisters.length} new registers (${mergedRegisters.length} total)`,
    });

    const batchSummary = batchResults.map(b => 
      `Pages ${b.pageRange}: ${b.registersFound} registers`
    ).join("; ");

    const metadata: ExtractionMetadata = {
      totalPages,
      pagesAnalyzed: targetPages.length,
      registersFound: mergedRegisters.length,
      highRelevancePages: targetPages.length,
      confidenceLevel: calculateConfidenceLevel(mergedRegisters.length, targetPages.length, totalPages),
      processingTimeMs,
      batchSummary,
      processingErrors: batchErrors.length > 0 ? batchErrors : undefined,
      partialExtraction: batchErrors.length > 0,
    };

    return { registers: mergedRegisters, metadata };
  } catch (error) {
    onProgress?.({
      stage: "error",
      progress: 0,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Exported helper functions for testing.
 * Provides access to internal functions for unit testing.
 */
export const testHelpers = {
  // Scorer functions
  calculatePageScore,
  hasRegisterIndicators,
  extractSectionTitle,
  detectTableStructure,
  extractDocumentHints,
  scorePages,
  assembleExtractionContext,
  
  // JSON repair functions
  repairJson,
  extractRegistersFromMalformedJson,
  
  // LLM client functions
  calculateConfidenceLevel,
  mergeAndDeduplicateRegisters,
};

