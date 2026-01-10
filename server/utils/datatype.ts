import type { ModbusDataType } from "@shared/schema";
import { modbusDataTypes } from "@shared/schema";

/**
 * Normalizes various data type string representations to standard ModbusDataType values.
 * Handles common aliases like INT->INT16, WORD->UINT16, FLOAT->FLOAT32, etc.
 */
export function normalizeDataType(value: string): ModbusDataType {
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

/**
 * Parses various boolean representations to a boolean value.
 * Handles: true/false, yes/no, 1/0, rw/r/w for access flags.
 */
export function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    return lower === "true" || lower === "yes" || lower === "1" || lower === "rw" || lower === "r/w";
  }
  return false;
}
