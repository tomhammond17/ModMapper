/**
 * Claude API interaction for Modbus register extraction.
 * 
 * Handles sending PDF content to the LLM and parsing responses.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ModbusRegister } from "@shared/schema";
import { normalizeDataType } from "../utils/datatype";
import { repairJson, extractRegistersFromMalformedJson } from "./json-repair";
import { createLogger } from "../logger";

const log = createLogger("llm-client");

// Using Claude Opus 4.5 for highest quality PDF parsing
const DEFAULT_MODEL = "claude-opus-4-20250514";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Batch extraction prompt optimized for Modbus register tables.
 */
const BATCH_EXTRACTION_PROMPT = `You are an expert at parsing Modbus register documentation from industrial equipment manuals.

CRITICAL INSTRUCTIONS:
1. Output ONLY valid JSON - no explanations, no markdown code blocks, no comments
2. Start your response with [ and end with ]
3. Extract EVERY SINGLE register row you find - do not skip any
4. Continue extracting until you have processed every row in the content

COMMON TABLE FORMATS TO RECOGNIZE:

Format 1 - Hex addresses with decimal register numbers:
| 0x0063 | 1 | 0 | R 100 | Generator Average Voltage | Scaling: 1 V/bit |
→ address: 100 (use the "R ###" decimal number), name: "Generator Average Voltage"

Format 2 - R/W column with address:
| R 100 | Generator Voltage | R | UINT16 |
→ address: 100, writable: false (R = Read only)

Format 3 - Simple decimal addresses:
| 40100 | Temperature | Read/Write | INT16 |
→ address: 40100, writable: true

SPECIAL PATTERNS:
- "R ###" or "Register ###" → Use the number as address
- "0x00XX" hex values → These are often memory offsets, look for corresponding "R ###" column
- "Ct" column with "1" or "2" → Register count (2 = 32-bit value)
- Bullet symbols (●) → Often indicate feature availability, not writability
- "R/W" or "R" column → R = Read only (writable: false), R/W = Read/Write (writable: true)

DATA TYPE DETECTION:
- Count "1" + no FLOAT mention → UINT16
- Count "2" + power/energy data → INT32 or UINT32
- "Scaling: 1 W/bit" with 32-bit → INT32
- Temperature/analog data → Often UINT16 with scaling

OUTPUT FORMAT - use this EXACT structure:
[{"address": 100, "name": "Generator Average Voltage", "datatype": "UINT16", "description": "Scaling: 1 V/bit, Offset: 0 V, Range: 0-64255 V", "writable": false}]

VALID DATATYPES: INT16, UINT16, INT32, UINT32, FLOAT32, FLOAT64, STRING, BOOL, COIL

If no registers found, output exactly: []`;

/**
 * Parse Modbus registers from assembled context using Claude API.
 */
export async function parseModbusRegistersFromContext(
  context: string
): Promise<ModbusRegister[]> {
  const prompt = `${BATCH_EXTRACTION_PROMPT}

DOCUMENT CONTENT:
${context}`;

  try {
    log.debug("Sending context to Claude", { contextLength: context.length });
    
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 8192, // Increased for larger register sets
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from AI");
    }

    log.debug("Claude response received", { 
      responseLength: content.text.length,
      preview: content.text.slice(0, 200)
    });

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
      log.debug("JSON parsed successfully");
    } catch (parseError) {
      log.debug("Initial JSON parse failed, attempting recovery", { 
        error: parseError instanceof Error ? parseError.message : "unknown" 
      });
      
      // Try to extract individual register objects and rebuild array
      const extractedRegisters = extractRegistersFromMalformedJson(jsonText);
      if (extractedRegisters.length > 0) {
        log.info("Recovered registers from malformed JSON", { count: extractedRegisters.length });
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
    
    log.info("Extraction complete", { uniqueRegisters: registers.length });

    return registers;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse AI response as JSON. The document may not contain recognizable register data.");
    }
    throw error;
  }
}

/**
 * Simple wrapper for direct text-to-register parsing.
 */
export async function parseModbusRegistersFromText(text: string): Promise<ModbusRegister[]> {
  return parseModbusRegistersFromContext(text);
}

/**
 * Merge registers from multiple batches, deduplicating by address.
 * Keeps the register with more complete data when duplicates found.
 */
export function mergeAndDeduplicateRegisters(allRegisters: ModbusRegister[]): ModbusRegister[] {
  const seenAddresses = new Map<number, ModbusRegister>();
  
  for (const reg of allRegisters) {
    const existing = seenAddresses.get(reg.address);
    if (!existing) {
      seenAddresses.set(reg.address, reg);
    } else {
      // Keep the one with more complete data
      const existingScore = (existing.name.length > 15 ? 1 : 0) + 
                           (existing.description.length > 10 ? 1 : 0);
      const newScore = (reg.name.length > 15 ? 1 : 0) + 
                      (reg.description.length > 10 ? 1 : 0);
      if (newScore > existingScore) {
        seenAddresses.set(reg.address, reg);
      }
    }
  }
  
  const merged = Array.from(seenAddresses.values());
  merged.sort((a, b) => a.address - b.address);
  return merged;
}

/**
 * Calculate confidence level based on extraction results.
 */
export function calculateConfidenceLevel(
  registersFound: number,
  highRelevancePages: number,
  totalPages: number
): "high" | "medium" | "low" {
  const pageRatio = highRelevancePages / Math.max(totalPages, 1);
  
  if (registersFound >= 50 && pageRatio >= 0.1) return "high";
  if (registersFound >= 20 && highRelevancePages >= 3) return "medium";
  return "low";
}

