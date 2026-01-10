/**
 * Page relevance scoring for PDF parsing.
 * 
 * Analyzes PDF page content to determine which pages are most likely
 * to contain Modbus register definitions.
 */

import type { PageData, DocumentHint } from "./types";
import { createLogger } from "../logger";

const log = createLogger("scorer");

/**
 * Score and sort pages by relevance to Modbus register content.
 */
export function scorePages(pages: PageData[]): PageData[] {
  for (const page of pages) {
    page.score = calculatePageScore(page.text);
    page.sectionTitle = extractSectionTitle(page.text);
    page.hasTable = detectTableStructure(page.text);
    
    // Bonus for appendix with register content
    if (page.sectionTitle) {
      const titleLower = page.sectionTitle.toLowerCase();
      if (titleLower.includes("appendix") && hasRegisterIndicators(page.text)) {
        page.score += 10;
      }
      if (titleLower.includes("modbus") || titleLower.includes("register")) {
        page.score += 5;
      }
    }
  }
  
  // Sort by score (highest first)
  return [...pages].sort((a, b) => b.score - a.score);
}

/**
 * Calculate a relevance score for page text.
 * Higher scores indicate more likely Modbus register content.
 */
export function calculatePageScore(text: string): number {
  const textLower = text.toLowerCase();
  let score = 0;
  
  // Strong indicator patterns
  const strongPatterns = [
    [/\bmodbus\b/g, 3],
    [/\bregister\s*(address|map|table|list)\b/g, 4],
    [/\b40[0-9]{3,4}\b/g, 2], // Holding register format
    [/\b30[0-9]{3,4}\b/g, 2], // Input register format
    [/\bholding\s*register/g, 3],
    [/\binput\s*register/g, 3],
    [/\bread.?write\b/g, 2],
    [/\br\/?w\b/g, 1.5],
    [/0x[0-9a-f]{2,4}\b/g, 1.5], // Hex addresses
    [/scaling:\s*[\d./]+/g, 3], // Scaling factors
    [/offset:\s*-?[\d.]+/g, 2], // Offset values
    [/data\s*range/g, 2],
  ] as [RegExp, number][];
  
  for (const [pattern, weight] of strongPatterns) {
    const matches = textLower.match(pattern);
    if (matches) {
      score += Math.min(matches.length * weight, 8); // Cap per pattern
    }
  }
  
  // Keyword density scoring
  const keywords: Record<string, number> = {
    modbus: 1.5,
    register: 1.0,
    holding: 0.8,
    coil: 0.8,
    scaling: 1.2,
    offset: 1.0,
    address: 0.5,
    uint16: 1.0,
    int16: 1.0,
    uint32: 1.0,
    int32: 1.0,
    float32: 1.0,
    parameter: 0.3,
    setpoint: 0.4,
  };
  
  for (const [keyword, weight] of Object.entries(keywords)) {
    const count = (textLower.match(new RegExp(`\\b${keyword}\\b`, "g")) || []).length;
    score += Math.min(count * weight, 4);
  }
  
  // Detect tabular data (columns of numbers, addresses)
  const addressLinePattern = /\b\d{1,5}\s+\w+.*(?:int|uint|float|bool|string)/gi;
  const addressMatches = text.match(addressLinePattern);
  if (addressMatches && addressMatches.length > 3) {
    score += Math.min(addressMatches.length * 0.5, 10);
  }
  
  return score;
}

/**
 * Check if text contains indicators of Modbus register content.
 */
export function hasRegisterIndicators(text: string): boolean {
  const textLower = text.toLowerCase();
  const indicators = [
    /\bmodbus\b/,
    /\bregister\b/,
    /\baddress\b.*\b(name|type|description)\b/,
    /\b40[0-9]{3,4}\b/,
    /\buint16\b|\bint16\b|\buint32\b|\bint32\b|\bfloat32\b/,
  ];
  
  return indicators.some(pattern => pattern.test(textLower));
}

/**
 * Extract section title from page text (e.g., "APPENDIX A").
 */
export function extractSectionTitle(text: string): string | undefined {
  const lines = text.split("\n").slice(0, 15);
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Match appendix headers
    if (/^APPENDIX\s+[A-Z]/i.test(trimmed)) {
      return trimmed;
    }
    // Match all-caps section titles
    if (/^[A-Z][A-Z\s]{5,40}$/.test(trimmed) && !trimmed.includes("  ")) {
      return trimmed;
    }
  }
  
  return undefined;
}

/**
 * Detect if text appears to contain tabular data.
 */
export function detectTableStructure(text: string): boolean {
  // Look for patterns that suggest tabular data
  const lines = text.split("\n");
  let consecutiveDataLines = 0;

  for (const line of lines) {
    // Lines with multiple numeric fields separated by whitespace
    const hasMultipleNumbers = (line.match(/\b\d+\b/g) || []).length >= 2;
    const hasDataType = /\b(int|uint|float|bool|string|word|dword)\b/i.test(line);

    if (hasMultipleNumbers || hasDataType) {
      consecutiveDataLines++;
      if (consecutiveDataLines >= 5) {
        return true;
      }
    } else {
      consecutiveDataLines = 0;
    }
  }

  return false;
}

/**
 * Extract document hints from page text (addressing conventions, etc.).
 */
export function extractDocumentHints(text: string): DocumentHint[] {
  const hints: DocumentHint[] = [];
  
  const patterns: [RegExp, string][] = [
    [/add\s*40[,.]?000\s*to\s*(the\s*)?address/i, "PDU addressing: add 40000 to addresses"],
    [/pdu\s*addressing/i, "Uses PDU addressing convention"],
    [/addresses?\s*(are|is)\s*(in\s*)?(the\s*)?range\s*(\d+)/i, "Address range specified"],
    [/base\s*address\s*(of|is|:)?\s*(\d+)/i, "Base address specified"],
    [/(big|little)\s*endian/i, "Byte order specified"],
    [/word\s*swap/i, "Word swapping mentioned"],
    [/high\s*word\s*first|low\s*word\s*first/i, "Word order specified"],
  ];
  
  for (const [pattern, hintType] of patterns) {
    const match = text.match(pattern);
    if (match) {
      const start = Math.max(0, match.index! - 30);
      const end = Math.min(text.length, match.index! + match[0].length + 50);
      hints.push({
        type: hintType,
        context: text.slice(start, end).trim(),
      });
    }
  }
  
  return hints;
}

/**
 * Assemble context for LLM, prioritizing high-scoring pages.
 */
export function assembleExtractionContext(
  rankedPages: PageData[],
  hints: DocumentHint[],
  maxChars: number = 80000
): string {
  const sections: string[] = [];
  let totalChars = 0;
  
  // Add document hints first
  if (hints.length > 0) {
    const hintsSection = "DOCUMENT CONVENTIONS:\n" + 
      hints.slice(0, 5).map(h => `- ${h.type}: ${h.context}`).join("\n");
    sections.push(hintsSection);
    totalChars += hintsSection.length;
  }
  
  // Add high-scoring pages first
  const highPages = rankedPages.filter(p => p.score > 8);
  const mediumPages = rankedPages.filter(p => p.score > 3 && p.score <= 8);
  
  log.debug("Page relevance analysis", { 
    high: highPages.length, 
    medium: mediumPages.length, 
    low: rankedPages.length - highPages.length - mediumPages.length 
  });
  
  // Add all high-scoring pages
  for (const page of highPages) {
    if (totalChars >= maxChars) break;
    
    const header = `\n--- PAGE ${page.pageNum} (Score: ${page.score.toFixed(1)}) ---`;
    const content = page.sectionTitle 
      ? `${header}\n[${page.sectionTitle}]\n${page.text}`
      : `${header}\n${page.text}`;
    
    if (totalChars + content.length <= maxChars) {
      sections.push(content);
      totalChars += content.length;
    }
  }
  
  // Add medium-scoring pages if space remains
  for (const page of mediumPages) {
    if (totalChars >= maxChars) break;
    
    const header = `\n--- PAGE ${page.pageNum} ---`;
    const content = `${header}\n${page.text}`;
    
    if (totalChars + content.length <= maxChars) {
      sections.push(content);
      totalChars += content.length;
    }
  }
  
  log.debug("Context assembled for LLM", { chars: totalChars, pages: sections.length - 1 });
  
  return sections.join("\n\n");
}

