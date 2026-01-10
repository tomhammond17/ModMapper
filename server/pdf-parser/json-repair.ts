/**
 * JSON repair utilities for handling malformed AI responses.
 * 
 * AI models sometimes return truncated or slightly malformed JSON.
 * These utilities attempt to recover valid data from such responses.
 */

/**
 * Attempt to repair common JSON issues in AI responses.
 * 
 * Handles:
 * - Trailing commas before ] or }
 * - Unclosed arrays
 * - Missing opening brackets
 */
export function repairJson(jsonText: string): string {
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

/**
 * Extract register objects from malformed JSON using pattern matching.
 * 
 * Falls back to regex extraction when JSON.parse fails.
 */
export function extractRegistersFromMalformedJson(jsonText: string): Record<string, unknown>[] {
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

/**
 * Safely parse JSON with fallback to repair and extraction.
 */
export function safeParseJson(jsonText: string): Record<string, unknown>[] {
  // First try direct parsing
  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    // Try to repair the JSON
    try {
      const repaired = repairJson(jsonText);
      const parsed = JSON.parse(repaired);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall back to pattern extraction
      return extractRegistersFromMalformedJson(jsonText);
    }
  }
  return [];
}

