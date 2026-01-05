import Anthropic from "@anthropic-ai/sdk";
import type { ModbusRegister, ModbusDataType } from "@shared/schema";
import { modbusDataTypes } from "@shared/schema";

// Using claude-sonnet-4-20250514 as the latest model per Anthropic integration guidelines
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface PdfParseProgress {
  stage: "extracting" | "analyzing" | "parsing" | "complete" | "error";
  progress: number;
  message: string;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import for pdf-parse (CommonJS module)
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as { default?: (buffer: Buffer) => Promise<{ text: string }> }).default ?? pdfParseModule;
    const data = await (pdfParse as (buffer: Buffer) => Promise<{ text: string }>)(buffer);
    return data.text;
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function parseModbusRegistersFromText(
  text: string
): Promise<ModbusRegister[]> {
  const prompt = `You are an expert at parsing Modbus register documentation. Analyze the following text extracted from a PDF document and identify all Modbus registers.

For each register found, extract:
- address: The register address (integer)
- name: The register name/label
- datatype: One of these types: ${modbusDataTypes.join(", ")}
- description: A brief description of what the register contains
- writable: Whether the register is writable (true/false)

Common data type mappings:
- INT, INT16, SINT16, INTEGER → INT16
- UINT, UINT16, WORD → UINT16
- INT32, SINT32, LONG → INT32
- UINT32, DWORD, ULONG → UINT32
- FLOAT, FLOAT32, REAL, SINGLE → FLOAT32
- FLOAT64, DOUBLE, LREAL → FLOAT64
- STRING, ASCII → STRING
- BOOL, BOOLEAN, BIT → BOOL
- COIL → COIL

For writability:
- "R/W", "RW", "Read/Write", "Write" → true
- "R", "RO", "Read Only", "Read" → false

Return ONLY a valid JSON array of register objects. No explanation, no markdown, just the JSON array.
If you cannot find any registers, return an empty array: []

Example output format:
[
  {"address": 40001, "name": "Temperature", "datatype": "FLOAT32", "description": "Current temperature reading", "writable": false},
  {"address": 40003, "name": "Setpoint", "datatype": "FLOAT32", "description": "Temperature setpoint", "writable": true}
]

PDF Text to analyze:
${text.slice(0, 50000)}`;

  try {
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from AI");
    }

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

    const parsed = JSON.parse(jsonText);
    
    if (!Array.isArray(parsed)) {
      throw new Error("AI response is not an array");
    }

    // Validate and normalize each register
    const registers: ModbusRegister[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      
      const address = typeof item.address === "number" ? item.address : parseInt(String(item.address), 10);
      if (isNaN(address)) continue;

      const datatype = normalizeDataType(item.datatype || "UINT16");
      
      registers.push({
        address,
        name: typeof item.name === "string" ? item.name : `Register_${address}`,
        datatype,
        description: typeof item.description === "string" ? item.description : "",
        writable: Boolean(item.writable),
      });
    }

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

export async function parsePdfFile(
  buffer: Buffer,
  onProgress?: (progress: PdfParseProgress) => void
): Promise<ModbusRegister[]> {
  try {
    // Stage 1: Extract text
    onProgress?.({
      stage: "extracting",
      progress: 25,
      message: "Extracting text from PDF...",
    });

    const text = await extractTextFromPdf(buffer);
    
    if (!text || text.trim().length < 50) {
      throw new Error("PDF appears to be empty or contains very little text. It may be a scanned image that requires OCR.");
    }

    // Stage 2: Analyzing with AI
    onProgress?.({
      stage: "analyzing",
      progress: 50,
      message: "Analyzing document with AI...",
    });

    // Stage 3: Parsing registers
    onProgress?.({
      stage: "parsing",
      progress: 75,
      message: "Identifying register tables...",
    });

    const registers = await parseModbusRegistersFromText(text);

    // Stage 4: Complete
    onProgress?.({
      stage: "complete",
      progress: 100,
      message: `Found ${registers.length} registers`,
    });

    return registers;
  } catch (error) {
    onProgress?.({
      stage: "error",
      progress: 0,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
