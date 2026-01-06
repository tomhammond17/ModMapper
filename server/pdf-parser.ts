import Anthropic from "@anthropic-ai/sdk";
import type { ModbusRegister, ModbusDataType, ExtractionMetadata } from "@shared/schema";
import { modbusDataTypes } from "@shared/schema";

export interface PdfExtractionResult {
  registers: ModbusRegister[];
  metadata: ExtractionMetadata;
}

// Polyfill DOMMatrix for Node.js environment (required by pdfjs-dist)
if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;
    
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = this.a; this.m12 = this.b;
        this.m21 = this.c; this.m22 = this.d;
        this.m41 = this.e; this.m42 = this.f;
      }
    }
    
    translate(tx: number, ty: number) { return new DOMMatrix([this.a, this.b, this.c, this.d, this.e + tx, this.f + ty]); }
    scale(sx: number, sy = sx) { return new DOMMatrix([this.a * sx, this.b, this.c, this.d * sy, this.e, this.f]); }
    multiply(other: DOMMatrix) { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
    transformPoint(point: { x: number; y: number }) { return { x: point.x, y: point.y, z: 0, w: 1 }; }
  }
  (globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
}

// Use legacy build for Node.js compatibility
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// Using Claude Opus 4.5 for highest quality PDF parsing
const DEFAULT_MODEL = "claude-opus-4-20250514";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface PdfParseProgress {
  stage: "extracting" | "scoring" | "analyzing" | "parsing" | "complete" | "error";
  progress: number;
  message: string;
  details?: string;
}

interface PageData {
  pageNum: number;
  text: string;
  score: number;
  hasTable: boolean;
  sectionTitle?: string;
}

interface DocumentHint {
  type: string;
  context: string;
}

// ============================================================================
// Stage 1: Page-by-page text extraction with pdfjs-dist
// ============================================================================

export async function extractPagesFromPdf(buffer: Buffer): Promise<{ pages: PageData[]; hints: DocumentHint[] }> {
  const uint8Array = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true }).promise;
  
  const pages: PageData[] = [];
  const hints: DocumentHint[] = [];
  
  console.log(`[PDF] Processing ${doc.numPages} pages...`);
  
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

function extractDocumentHints(text: string): DocumentHint[] {
  const hints: DocumentHint[] = [];
  const textLower = text.toLowerCase();
  
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

// ============================================================================
// Stage 2: Relevance scoring for each page
// ============================================================================

function scorePages(pages: PageData[]): PageData[] {
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

function calculatePageScore(text: string): number {
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

function hasRegisterIndicators(text: string): boolean {
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

function extractSectionTitle(text: string): string | undefined {
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

function detectTableStructure(text: string): boolean {
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

// ============================================================================
// Stage 3: Assemble context for LLM (prioritize high-scoring pages)
// ============================================================================

function assembleExtractionContext(
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
  const lowPages = rankedPages.filter(p => p.score <= 3);
  
  console.log(`[PDF] Page relevance: ${highPages.length} high, ${mediumPages.length} medium, ${lowPages.length} low`);
  
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
  
  console.log(`[PDF] Assembled ${totalChars} chars from ${sections.length - 1} pages for LLM`);
  
  return sections.join("\n\n");
}

// ============================================================================
// JSON Repair utilities for handling malformed AI responses
// ============================================================================

function repairJson(jsonText: string): string {
  let repaired = jsonText.trim();
  
  // Remove trailing commas before ] or }
  repaired = repaired.replace(/,(\s*[\]}])/g, '$1');
  
  // Remove trailing commas at the very end before closing bracket
  repaired = repaired.replace(/,\s*$/, '');
  
  // If it doesn't end with ], try to close it
  if (!repaired.endsWith(']')) {
    // Find the last complete object (ends with })
    const lastBrace = repaired.lastIndexOf('}');
    if (lastBrace > 0) {
      repaired = repaired.slice(0, lastBrace + 1) + ']';
    }
  }
  
  // Ensure it starts with [
  if (!repaired.startsWith('[')) {
    const firstBracket = repaired.indexOf('[');
    if (firstBracket >= 0) {
      repaired = repaired.slice(firstBracket);
    }
  }
  
  return repaired;
}

function extractRegistersFromMalformedJson(jsonText: string): Record<string, unknown>[] {
  const registers: Record<string, unknown>[] = [];
  
  // Match individual register objects: {"address": ..., "name": ..., ...}
  const objectPattern = /\{\s*"address"\s*:\s*(\d+)\s*,\s*"name"\s*:\s*"([^"]+)"\s*,\s*"datatype"\s*:\s*"([^"]+)"\s*,\s*"description"\s*:\s*"([^"]*)"\s*,\s*"writable"\s*:\s*(true|false)\s*\}/g;
  
  let match;
  while ((match = objectPattern.exec(jsonText)) !== null) {
    registers.push({
      address: parseInt(match[1], 10),
      name: match[2],
      datatype: match[3],
      description: match[4],
      writable: match[5] === 'true',
    });
  }
  
  // If the simple pattern didn't work, try a more lenient extraction
  if (registers.length === 0) {
    // Find all {...} blocks that look like registers
    const blockPattern = /\{[^{}]*"address"\s*:\s*\d+[^{}]*\}/g;
    const blocks = jsonText.match(blockPattern) || [];
    
    for (const block of blocks) {
      try {
        // Try to parse each block individually
        const parsed = JSON.parse(block);
        if (typeof parsed.address === 'number') {
          registers.push(parsed);
        }
      } catch {
        // Try to extract fields manually
        const addressMatch = block.match(/"address"\s*:\s*(\d+)/);
        const nameMatch = block.match(/"name"\s*:\s*"([^"]+)"/);
        if (addressMatch) {
          registers.push({
            address: parseInt(addressMatch[1], 10),
            name: nameMatch ? nameMatch[1] : `Register_${addressMatch[1]}`,
            datatype: 'UINT16',
            description: '',
            writable: false,
          });
        }
      }
    }
  }
  
  return registers;
}

// ============================================================================
// Stage 4: Enhanced AI prompt for register extraction
// ============================================================================

export async function parseModbusRegistersFromContext(
  context: string
): Promise<ModbusRegister[]> {
  const prompt = `You are an expert at parsing Modbus register documentation from industrial equipment manuals.

CRITICAL INSTRUCTIONS:
1. Output ONLY valid JSON - no explanations, no markdown code blocks, no comments
2. Start your response with [ and end with ]
3. Extract ALL registers you find - look for tables with addresses, names, data types

OUTPUT FORMAT - use this EXACT structure:
[{"address": 40001, "name": "RegName", "datatype": "UINT16", "description": "desc", "writable": false}]

REGISTER ADDRESS HANDLING:
- If addresses are given as small numbers (0, 1, 2...) or hex (0x0000), add 40001 to convert to Modbus holding register format
- If addresses already include 40xxx prefix, use as-is
- Coil addresses use 0xxxx format, input registers use 30xxx

VALID DATATYPES: ${modbusDataTypes.join(", ")}

TYPE MAPPINGS:
- INT/INT16/SINT16/INTEGER → INT16
- UINT/UINT16/WORD → UINT16  
- INT32/SINT32/LONG → INT32
- UINT32/DWORD/ULONG → UINT32
- FLOAT/FLOAT32/REAL/SINGLE → FLOAT32
- FLOAT64/DOUBLE/LREAL → FLOAT64
- STRING/ASCII → STRING
- BOOL/BOOLEAN/BIT → BOOL
- COIL → COIL

WRITABILITY: Look for "R/W", "RW", "Read/Write", "Write" → true; "R", "Read Only", "RO" → false

SCALING/OFFSET: Include in description if present (e.g., "Temperature (scaling: 0.1 °C/bit, offset: -40)")

If no registers found, output exactly: []

DOCUMENT CONTENT:
${context}`;

  try {
    console.log(`[AI] Sending ${context.length} chars to Claude...`);
    
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 8192, // Increased for larger register sets
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from AI");
    }

    console.log(`[AI] Response length: ${content.text.length} chars`);
    console.log(`[AI] First 500 chars: ${content.text.slice(0, 500)}`);
    console.log(`[AI] Last 200 chars: ${content.text.slice(-200)}`);

    let jsonText = content.text.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    // Try to find JSON array in response if not starting with [
    if (!jsonText.startsWith("[")) {
      const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonText = arrayMatch[0];
      }
    }

    // Apply JSON repair before parsing
    jsonText = repairJson(jsonText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
      console.log(`[AI] JSON parsed successfully`);
    } catch (parseError) {
      console.log(`[AI] Initial JSON parse failed: ${parseError instanceof Error ? parseError.message : 'unknown'}`);
      
      // Try to extract individual register objects and rebuild array
      const extractedRegisters = extractRegistersFromMalformedJson(jsonText);
      if (extractedRegisters.length > 0) {
        console.log(`[AI] Recovered ${extractedRegisters.length} registers from malformed JSON`);
        parsed = extractedRegisters;
      } else {
        throw new Error("Could not extract register data from the document. The PDF may not contain recognizable Modbus register tables.");
      }
    }
    
    if (!Array.isArray(parsed)) {
      throw new Error("AI response is not an array");
    }

    // Validate and normalize each register
    const registers: ModbusRegister[] = [];
    const seenAddresses = new Set<number>();
    
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      
      const address = typeof item.address === "number" ? item.address : parseInt(String(item.address), 10);
      if (isNaN(address)) continue;
      
      // Deduplicate by address
      if (seenAddresses.has(address)) continue;
      seenAddresses.add(address);

      const datatype = normalizeDataType(item.datatype || "UINT16");
      
      registers.push({
        address,
        name: typeof item.name === "string" ? item.name : `Register_${address}`,
        datatype,
        description: typeof item.description === "string" ? item.description : "",
        writable: Boolean(item.writable),
      });
    }

    // Sort by address
    registers.sort((a, b) => a.address - b.address);
    
    console.log(`[AI] Extracted ${registers.length} unique registers`);

    return registers;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse AI response as JSON. The document may not contain recognizable register data.");
    }
    throw error;
  }
}

function normalizeDataType(value: string): ModbusDataType {
  const normalized = value.toUpperCase().trim();
  const dataTypeMap: Record<string, ModbusDataType> = {
    INT: "INT16",
    INT16: "INT16",
    SINT16: "INT16",
    INTEGER: "INT16",
    UINT: "UINT16",
    UINT16: "UINT16",
    WORD: "UINT16",
    INT32: "INT32",
    SINT32: "INT32",
    LONG: "INT32",
    UINT32: "UINT32",
    DWORD: "UINT32",
    ULONG: "UINT32",
    FLOAT: "FLOAT32",
    FLOAT32: "FLOAT32",
    REAL: "FLOAT32",
    SINGLE: "FLOAT32",
    FLOAT64: "FLOAT64",
    DOUBLE: "FLOAT64",
    LREAL: "FLOAT64",
    STRING: "STRING",
    ASCII: "STRING",
    BOOL: "BOOL",
    BOOLEAN: "BOOL",
    BIT: "BOOL",
    COIL: "COIL",
  };

  const mapped = dataTypeMap[normalized];
  if (mapped) return mapped;

  if ((modbusDataTypes as readonly string[]).includes(normalized)) {
    return normalized as ModbusDataType;
  }

  return "UINT16";
}

// ============================================================================
// Main entry point: Intelligent PDF parsing pipeline
// ============================================================================

function calculateConfidenceLevel(
  registersFound: number,
  highRelevancePages: number,
  totalPages: number
): "high" | "medium" | "low" {
  const pageRatio = highRelevancePages / Math.max(totalPages, 1);
  
  if (registersFound >= 20 && pageRatio >= 0.1) return "high";
  if (registersFound >= 5 && highRelevancePages >= 3) return "medium";
  return "low";
}

export async function parsePdfFile(
  buffer: Buffer,
  onProgress?: (progress: PdfParseProgress) => void
): Promise<PdfExtractionResult> {
  const startTime = Date.now();
  
  try {
    // Stage 1: Extract pages
    onProgress?.({
      stage: "extracting",
      progress: 15,
      message: "Extracting text from PDF pages...",
    });

    const { pages, hints } = await extractPagesFromPdf(buffer);
    
    if (pages.length === 0) {
      throw new Error("PDF appears to be empty or contains no extractable text.");
    }
    
    const totalPages = pages.length;
    
    onProgress?.({
      stage: "extracting",
      progress: 25,
      message: `Extracted ${totalPages} pages from PDF`,
      details: `Found ${hints.length} document hints`,
    });

    // Stage 2: Score and rank pages
    onProgress?.({
      stage: "scoring",
      progress: 35,
      message: "Analyzing page relevance...",
    });

    const rankedPages = scorePages(pages);
    const highPages = rankedPages.filter(p => p.score > 8);
    const medPages = rankedPages.filter(p => p.score > 3 && p.score <= 8);
    const pagesAnalyzed = highPages.length + medPages.length;
    
    onProgress?.({
      stage: "scoring",
      progress: 45,
      message: `Found ${highPages.length} high-relevance pages`,
      details: `${medPages.length} medium, ${rankedPages.length - highPages.length - medPages.length} low`,
    });

    // Stage 3: Assemble context
    onProgress?.({
      stage: "analyzing",
      progress: 55,
      message: "Preparing document context for AI...",
    });

    const context = assembleExtractionContext(rankedPages, hints, 80000);
    
    if (context.length < 100) {
      throw new Error("Could not find sufficient register-related content in the PDF.");
    }

    // Stage 4: AI extraction
    onProgress?.({
      stage: "parsing",
      progress: 70,
      message: "Extracting registers with AI...",
      details: `Sending ${Math.round(context.length / 1000)}KB to Claude`,
    });

    const registers = await parseModbusRegistersFromContext(context);
    const processingTimeMs = Date.now() - startTime;

    onProgress?.({
      stage: "parsing",
      progress: 90,
      message: `Found ${registers.length} registers`,
    });

    const metadata: ExtractionMetadata = {
      totalPages,
      pagesAnalyzed,
      registersFound: registers.length,
      highRelevancePages: highPages.length,
      confidenceLevel: calculateConfidenceLevel(registers.length, highPages.length, totalPages),
      processingTimeMs,
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

// ============================================================================
// Targeted page extraction with user-specified page hints
// ============================================================================

export interface PageHint {
  start: number;
  end: number;
}

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

export async function parsePdfWithPageHints(
  buffer: Buffer,
  pageHints: PageHint[],
  existingRegisters: ModbusRegister[],
  onProgress?: (progress: PdfParseProgress) => void
): Promise<PdfExtractionResult> {
  const startTime = Date.now();
  
  try {
    onProgress?.({
      stage: "extracting",
      progress: 20,
      message: "Extracting specified pages...",
    });

    const { pages, hints } = await extractPagesFromPdf(buffer);
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
      console.log(`[PDF] Warning: Pages ${outOfRange.join(", ")} are out of range (PDF has ${totalPages} pages). Using valid pages only.`);
    }
    
    // Filter to only requested valid pages
    const targetPages: PageData[] = [];
    const validPageArray = Array.from(validPageNums);
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
      progress: 40,
      message: `Found ${targetPages.length} pages in specified ranges`,
    });

    // Sort by page number for coherent context
    targetPages.sort((a, b) => a.pageNum - b.pageNum);
    
    // Build context from target pages only
    let context = "";
    for (const page of targetPages) {
      context += `\n\n=== PAGE ${page.pageNum} ===\n${page.text}`;
    }
    
    // Add any document hints
    if (hints.length > 0) {
      context = `Document hints:\n${hints.map(h => `- ${h.type}: ${h.context}`).join("\n")}\n\n${context}`;
    }
    
    onProgress?.({
      stage: "parsing",
      progress: 60,
      message: "Extracting registers with AI...",
      details: `Sending ${Math.round(context.length / 1000)}KB from ${targetPages.length} pages`,
    });

    const newRegisters = await parseModbusRegistersFromContext(context);
    
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

    const metadata: ExtractionMetadata = {
      totalPages,
      pagesAnalyzed: targetPages.length,
      registersFound: mergedRegisters.length,
      highRelevancePages: targetPages.length,
      confidenceLevel: calculateConfidenceLevel(mergedRegisters.length, targetPages.length, totalPages),
      processingTimeMs,
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

// Legacy export for backwards compatibility
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { pages } = await extractPagesFromPdf(buffer);
  return pages.map(p => p.text).join("\n\n");
}

export async function parseModbusRegistersFromText(text: string): Promise<ModbusRegister[]> {
  return parseModbusRegistersFromContext(text);
}
