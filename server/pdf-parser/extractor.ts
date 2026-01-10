/**
 * PDF text extraction using pdfjs-dist.
 * 
 * Handles the first stage of PDF parsing: extracting raw text content
 * from PDF pages.
 * 
 * NOTE: The DOMMatrix polyfill is loaded in ./polyfills.ts which must be
 * imported at the application entry point (server/index.ts) BEFORE any
 * code that might load pdfjs-dist.
 */

// Use legacy build for Node.js compatibility
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import type { PageData, PageMetadata, DocumentHint } from "./types";
import { extractDocumentHints, calculatePageScore, extractSectionTitle, detectTableStructure, hasRegisterIndicators } from "./scorer";
import { createLogger } from "../logger";

const log = createLogger("extractor");

/**
 * Extract text content from all PDF pages.
 * Returns pages with text and document hints.
 */
export async function extractPagesFromPdf(buffer: Buffer): Promise<{ pages: PageData[]; hints: DocumentHint[] }> {
  const uint8Array = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true }).promise;
  
  const pages: PageData[] = [];
  const hints: DocumentHint[] = [];
  
  log.debug("Processing PDF", { totalPages: doc.numPages });
  
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    
    // Reconstruct text from items, preserving some structure
    let pageText = "";
    let lastY = -1;
    
    for (const item of textContent.items) {
      if ("str" in item) {
        const y = (item as { transform: number[] }).transform[5];
        // Add newline when Y position changes significantly
        if (lastY !== -1 && Math.abs(y - lastY) > 5) {
          pageText += "\n";
        }
        pageText += item.str + " ";
        lastY = y;
      }
    }
    
    // Extract document hints (addressing conventions, etc.)
    const pageHints = extractDocumentHints(pageText);
    hints.push(...pageHints);
    
    pages.push({
      pageNum: i,
      text: pageText.trim(),
      score: 0,
      hasTable: false,
    });
  }
  
  return { pages, hints };
}

/**
 * Memory-efficient page scoring (Pass 1).
 * Extracts, scores, and discards text to minimize memory usage.
 */
export async function scoreAllPagesLightweight(
  buffer: Buffer
): Promise<{ metadata: PageMetadata[]; hints: DocumentHint[]; totalPages: number }> {
  const uint8Array = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true }).promise;

  const metadata: PageMetadata[] = [];
  const hints: DocumentHint[] = [];
  const totalPages = doc.numPages;

  log.debug("Scoring pages (memory-efficient mode)", { totalPages });

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();

    // Reconstruct text from items
    let pageText = "";
    let lastY = -1;

    for (const item of textContent.items) {
      if ("str" in item) {
        const y = (item as { transform: number[] }).transform[5];
        if (lastY !== -1 && Math.abs(y - lastY) > 5) {
          pageText += "\n";
        }
        pageText += item.str + " ";
        lastY = y;
      }
    }

    pageText = pageText.trim();

    // Extract hints from first few pages
    if (i <= 5) {
      const pageHints = extractDocumentHints(pageText);
      hints.push(...pageHints);
    }

    // Calculate score and metadata
    let score = calculatePageScore(pageText);
    const sectionTitle = extractSectionTitle(pageText);
    const hasTable = detectTableStructure(pageText);

    // Bonus for appendix with register content
    if (sectionTitle) {
      const titleLower = sectionTitle.toLowerCase();
      if (titleLower.includes("appendix") && hasRegisterIndicators(pageText)) {
        score += 10;
      }
      if (titleLower.includes("modbus") || titleLower.includes("register")) {
        score += 5;
      }
    }

    metadata.push({
      pageNum: i,
      score,
      hasTable,
      sectionTitle,
    });

    // Text is now out of scope and can be garbage collected
  }

  // Sort by score (highest first)
  metadata.sort((a, b) => b.score - a.score);

  return { metadata, hints, totalPages };
}

/**
 * Extract specific pages by number (Pass 2).
 * Only extracts requested pages to minimize memory usage.
 */
export async function extractSpecificPages(
  buffer: Buffer,
  pageNumbers: number[]
): Promise<PageData[]> {
  const uint8Array = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true }).promise;

  const pages: PageData[] = [];
  const pageSet = new Set(pageNumbers);

  log.debug("Extracting specific pages", { count: pageNumbers.length });

  for (let i = 1; i <= doc.numPages; i++) {
    if (!pageSet.has(i)) continue;

    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();

    let pageText = "";
    let lastY = -1;

    for (const item of textContent.items) {
      if ("str" in item) {
        const y = (item as { transform: number[] }).transform[5];
        if (lastY !== -1 && Math.abs(y - lastY) > 5) {
          pageText += "\n";
        }
        pageText += item.str + " ";
        lastY = y;
      }
    }

    pages.push({
      pageNum: i,
      text: pageText.trim(),
      score: 0, // Score already calculated in Pass 1
      hasTable: false,
    });
  }

  // Sort by page number
  pages.sort((a, b) => a.pageNum - b.pageNum);

  return pages;
}

/**
 * Simple text extraction from entire PDF (for basic processing).
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { pages } = await extractPagesFromPdf(buffer);
  return pages.map(p => p.text).join("\n\n");
}

