import type { ModbusRegister, ModbusFileFormat } from "@shared/schema";
import { normalizeDataType, parseBoolean } from "./utils/datatype";

export function parseCSV(content: string): ModbusRegister[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("CSV file must have a header row and at least one data row");
  }

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());

  const addressIdx = header.findIndex((h) => h.includes("address") || h.includes("addr") || h.includes("reg"));
  const nameIdx = header.findIndex((h) => h.includes("name") || h.includes("label") || h.includes("tag"));
  const datatypeIdx = header.findIndex((h) => h.includes("type") || h.includes("datatype") || h.includes("data_type"));
  const descIdx = header.findIndex((h) => h.includes("desc") || h.includes("description") || h.includes("comment"));
  const writableIdx = header.findIndex((h) => h.includes("write") || h.includes("writable") || h.includes("access") || h.includes("rw"));

  if (addressIdx === -1) {
    throw new Error("CSV file must have an address column");
  }

  const registers: ModbusRegister[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);

    const addressStr = values[addressIdx]?.trim();
    if (!addressStr) continue;

    const address = parseInt(addressStr, 10);
    if (isNaN(address)) continue;

    registers.push({
      address,
      name: nameIdx >= 0 ? (values[nameIdx]?.trim() || `Register_${address}`) : `Register_${address}`,
      datatype: datatypeIdx >= 0 ? normalizeDataType(values[datatypeIdx] || "UINT16") : "UINT16",
      description: descIdx >= 0 ? (values[descIdx]?.trim() || "") : "",
      writable: writableIdx >= 0 ? parseBoolean(values[writableIdx]) : false,
    });
  }

  return registers;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

export function parseJSON(content: string): ModbusRegister[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    throw new Error("Invalid JSON format");
  }

  let registerArray: unknown[];

  if (Array.isArray(data)) {
    registerArray = data;
  } else if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.registers)) {
      registerArray = obj.registers;
    } else if (Array.isArray(obj.data)) {
      registerArray = obj.data;
    } else {
      throw new Error("JSON must contain a 'registers' or 'data' array, or be an array itself");
    }
  } else {
    throw new Error("Invalid JSON structure");
  }

  const registers: ModbusRegister[] = [];

  for (const item of registerArray) {
    if (typeof item !== "object" || item === null) continue;

    const reg = item as Record<string, unknown>;

    const address = typeof reg.address === "number" ? reg.address : parseInt(String(reg.address), 10);
    if (isNaN(address)) continue;

    registers.push({
      address,
      name: typeof reg.name === "string" ? reg.name : `Register_${address}`,
      datatype: typeof reg.datatype === "string" ? normalizeDataType(reg.datatype) :
                typeof reg.type === "string" ? normalizeDataType(reg.type) : "UINT16",
      description: typeof reg.description === "string" ? reg.description :
                   typeof reg.desc === "string" ? reg.desc : "",
      writable: parseBoolean(reg.writable ?? reg.write ?? reg.rw),
    });
  }

  return registers;
}

export function parseXML(content: string): ModbusRegister[] {
  const registers: ModbusRegister[] = [];

  const registerPattern = /<register[^>]*>([\s\S]*?)<\/register>/gi;
  let match: RegExpExecArray | null;

  while ((match = registerPattern.exec(content)) !== null) {
    const registerContent = match[1];

    const address = extractXMLValue(registerContent, "address");
    const addressNum = parseInt(address || "", 10);
    if (isNaN(addressNum)) continue;

    registers.push({
      address: addressNum,
      name: extractXMLValue(registerContent, "name") || `Register_${addressNum}`,
      datatype: normalizeDataType(extractXMLValue(registerContent, "datatype") || extractXMLValue(registerContent, "type") || "UINT16"),
      description: extractXMLValue(registerContent, "description") || extractXMLValue(registerContent, "desc") || "",
      writable: parseBoolean(extractXMLValue(registerContent, "writable") || extractXMLValue(registerContent, "write") || "false"),
    });
  }

  if (registers.length === 0) {
    const rowPattern = /<row[^>]*>([\s\S]*?)<\/row>/gi;
    while ((match = rowPattern.exec(content)) !== null) {
      const rowContent = match[1];

      const address = extractXMLValue(rowContent, "address");
      const addressNum = parseInt(address || "", 10);
      if (isNaN(addressNum)) continue;

      registers.push({
        address: addressNum,
        name: extractXMLValue(rowContent, "name") || `Register_${addressNum}`,
        datatype: normalizeDataType(extractXMLValue(rowContent, "datatype") || extractXMLValue(rowContent, "type") || "UINT16"),
        description: extractXMLValue(rowContent, "description") || extractXMLValue(rowContent, "desc") || "",
        writable: parseBoolean(extractXMLValue(rowContent, "writable") || extractXMLValue(rowContent, "write") || "false"),
      });
    }
  }

  return registers;
}

function extractXMLValue(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = pattern.exec(xml);
  if (match) {
    return match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
  }
  return null;
}

export function detectFormat(filename: string): ModbusFileFormat {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "json") return "json";
  if (ext === "xml") return "xml";
  throw new Error(`Unsupported file format: .${ext}. Supported formats: CSV, XML, JSON`);
}

export function parseFile(content: string, format: ModbusFileFormat): ModbusRegister[] {
  switch (format) {
    case "csv":
      return parseCSV(content);
    case "json":
      return parseJSON(content);
    case "xml":
      return parseXML(content);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
