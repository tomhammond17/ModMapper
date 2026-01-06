import { z } from "zod";

export const modbusDataTypes = [
  "INT16",
  "UINT16",
  "INT32",
  "UINT32",
  "FLOAT32",
  "FLOAT64",
  "STRING",
  "BOOL",
  "COIL",
] as const;

export type ModbusDataType = (typeof modbusDataTypes)[number];

export const modbusRegisterSchema = z.object({
  address: z.number().int().positive(),
  name: z.string().min(1),
  datatype: z.enum(modbusDataTypes),
  description: z.string(),
  writable: z.boolean(),
});

export type ModbusRegister = z.infer<typeof modbusRegisterSchema>;

export const modbusFileFormats = ["csv", "xml", "json"] as const;
export const modbusSourceFormats = ["csv", "xml", "json", "pdf"] as const;
export type ModbusFileFormat = (typeof modbusFileFormats)[number];
export type ModbusSourceFormat = (typeof modbusSourceFormats)[number];

export const insertModbusDocumentSchema = z.object({
  filename: z.string().min(1),
  sourceFormat: z.enum(modbusSourceFormats),
  registers: z.array(modbusRegisterSchema),
});

export type InsertModbusDocument = z.infer<typeof insertModbusDocumentSchema>;

export interface ModbusDocument {
  id: string;
  filename: string;
  sourceFormat: ModbusSourceFormat;
  registers: ModbusRegister[];
  createdAt: Date;
}

export interface ExtractionMetadata {
  totalPages: number;
  pagesAnalyzed: number;
  registersFound: number;
  confidenceLevel: "high" | "medium" | "low";
  highRelevancePages: number;
  processingTimeMs: number;
}

export interface ConversionResult {
  success: boolean;
  message: string;
  registers: ModbusRegister[];
  sourceFormat: ModbusSourceFormat;
  filename: string;
  extractionMetadata?: ExtractionMetadata;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ConversionRequest {
  registers: ModbusRegister[];
  targetFormat: ModbusFileFormat;
  filename: string;
}
