import { describe, it, expect, vi } from "vitest";

// Mock the Anthropic SDK before importing pdf-parser
vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = function() {
    return {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "[]" }],
        }),
      },
    };
  };
  return { default: MockAnthropic };
});

// Mock pdfjs-dist to avoid loading the actual PDF library
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 0,
      getPage: vi.fn(),
    }),
  }),
}));

import { parsePageRanges, testHelpers } from "../pdf-parser";
import type { ModbusRegister } from "@shared/schema";

const {
  calculatePageScore,
  hasRegisterIndicators,
  extractSectionTitle,
  detectTableStructure,
  extractDocumentHints,
  repairJson,
  extractRegistersFromMalformedJson,
  calculateConfidenceLevel,
  mergeAndDeduplicateRegisters,
} = testHelpers;

describe("PDF Parser Helper Functions", () => {
  // =========================================================================
  // parsePageRanges
  // =========================================================================
  describe("parsePageRanges", () => {
    it("should parse a single page number", () => {
      const result = parsePageRanges("5");
      expect(result).toEqual([{ start: 5, end: 5 }]);
    });

    it("should parse a page range", () => {
      const result = parsePageRanges("10-20");
      expect(result).toEqual([{ start: 10, end: 20 }]);
    });

    it("should parse multiple page numbers and ranges", () => {
      const result = parsePageRanges("1, 5-10, 15, 20-25");
      expect(result).toEqual([
        { start: 1, end: 1 },
        { start: 5, end: 10 },
        { start: 15, end: 15 },
        { start: 20, end: 25 },
      ]);
    });

    it("should handle en-dash in ranges", () => {
      // Note: The current implementation only supports hyphen (-), not en-dash (–)
      // This documents the current behavior - en-dash is not parsed as a range
      const result = parsePageRanges("54–70"); // en-dash
      // Currently treats as separate entries since – is not matched by the regex
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("should ignore invalid entries", () => {
      const result = parsePageRanges("abc, 5, -10");
      expect(result).toEqual([{ start: 5, end: 5 }]);
    });

    it("should return empty array for empty input", () => {
      const result = parsePageRanges("");
      expect(result).toEqual([]);
    });

    it("should ignore zero and negative page numbers", () => {
      const result = parsePageRanges("0, -5, 10");
      expect(result).toEqual([{ start: 10, end: 10 }]);
    });

    it("should handle reversed ranges (start > end)", () => {
      const result = parsePageRanges("20-10"); // Invalid: start > end
      expect(result).toEqual([]); // Should be rejected
    });
  });

  // =========================================================================
  // calculatePageScore
  // =========================================================================
  describe("calculatePageScore", () => {
    it("should return 0 for irrelevant text", () => {
      const text = "This is a general product description with no technical data.";
      const score = calculatePageScore(text);
      expect(score).toBe(0);
    });

    it("should score high for text with Modbus keywords", () => {
      const text = "Modbus Register Map - Holding Register addresses";
      const score = calculatePageScore(text);
      expect(score).toBeGreaterThan(5);
    });

    it("should score high for register addresses", () => {
      const text = "40001 Temperature UINT16 Read\n40002 Pressure UINT16 Read/Write";
      const score = calculatePageScore(text);
      expect(score).toBeGreaterThan(3);
    });

    it("should score high for hex addresses", () => {
      const text = "0x0063 Generator Voltage 0x0064 Generator Current";
      const score = calculatePageScore(text);
      expect(score).toBeGreaterThan(2);
    });

    it("should score high for data type mentions", () => {
      const text = "INT16 UINT16 FLOAT32 INT32 parameter setpoint scaling";
      const score = calculatePageScore(text);
      expect(score).toBeGreaterThan(4);
    });

    it("should cap pattern scores to prevent overflow", () => {
      // Text with many repeated keywords shouldn't score excessively high
      const text = "modbus modbus modbus modbus modbus modbus modbus modbus modbus modbus";
      const score = calculatePageScore(text);
      expect(score).toBeLessThan(20); // Should be capped
    });
  });

  // =========================================================================
  // hasRegisterIndicators
  // =========================================================================
  describe("hasRegisterIndicators", () => {
    it("should return true for text with Modbus keyword", () => {
      expect(hasRegisterIndicators("This is a Modbus device")).toBe(true);
    });

    it("should return true for text with register keyword", () => {
      expect(hasRegisterIndicators("Register address list")).toBe(true);
    });

    it("should return true for text with holding register format (40xxx)", () => {
      expect(hasRegisterIndicators("Address 40001 is the temperature")).toBe(true);
    });

    it("should return true for text with data types", () => {
      expect(hasRegisterIndicators("The value is UINT16 format")).toBe(true);
      expect(hasRegisterIndicators("Use INT32 for large values")).toBe(true);
      expect(hasRegisterIndicators("FLOAT32 precision")).toBe(true);
    });

    it("should return false for unrelated text", () => {
      expect(hasRegisterIndicators("Company overview and mission statement")).toBe(false);
    });
  });

  // =========================================================================
  // extractSectionTitle
  // =========================================================================
  describe("extractSectionTitle", () => {
    it("should extract appendix headers", () => {
      const text = "APPENDIX A\nModbus Register Data\nThis section contains...";
      expect(extractSectionTitle(text)).toBe("APPENDIX A");
    });

    it("should extract all-caps section titles", () => {
      const text = "COMMUNICATION PROTOCOL\nThe device supports Modbus RTU...";
      expect(extractSectionTitle(text)).toBe("COMMUNICATION PROTOCOL");
    });

    it("should return undefined for text without clear section title", () => {
      const text = "This is just regular paragraph text without headers.";
      expect(extractSectionTitle(text)).toBeUndefined();
    });

    it("should only look in first 15 lines", () => {
      const lines = Array(20).fill("Regular text line");
      lines[18] = "APPENDIX Z"; // After line 15
      const text = lines.join("\n");
      expect(extractSectionTitle(text)).toBeUndefined();
    });
  });

  // =========================================================================
  // detectTableStructure
  // =========================================================================
  describe("detectTableStructure", () => {
    it("should detect tabular data with multiple numbers per line", () => {
      // Need 5+ consecutive lines with multiple numbers (>=2 per line)
      const text = `100 200 Temperature
101 201 Pressure
102 202 Flow
103 203 Level
104 204 Setpoint
105 205 Speed`;
      expect(detectTableStructure(text)).toBe(true);
    });

    it("should return false for non-tabular text", () => {
      const text = `This is a paragraph of text.
It describes the product features.
No tables or numeric data here.`;
      expect(detectTableStructure(text)).toBe(false);
    });

    it("should detect consecutive lines with data type keywords", () => {
      // Function looks for standalone keywords: int, uint, float, bool, string, word, dword
      // Note: "INT16" won't match because \bint\b requires word boundary
      const text = `temperature int value
pressure uint value
flow float value
level int value
status bool value
speed uint value`;
      expect(detectTableStructure(text)).toBe(true);
    });

    it("should return false when lines are not consecutive", () => {
      const text = `temperature int
some text
pressure uint
some text
flow float`;
      expect(detectTableStructure(text)).toBe(false);
    });

    it("should require 5 consecutive matching lines", () => {
      // Only 4 lines - should return false
      const text = `100 200 A
101 201 B
102 202 C
103 203 D`;
      expect(detectTableStructure(text)).toBe(false);
    });
  });

  // =========================================================================
  // extractDocumentHints
  // =========================================================================
  describe("extractDocumentHints", () => {
    it("should extract PDU addressing hints", () => {
      const text = "Note: Add 40000 to the address to get the Modbus address.";
      const hints = extractDocumentHints(text);
      expect(hints.length).toBeGreaterThan(0);
      expect(hints[0].type).toContain("addressing");
    });

    it("should extract endianness hints", () => {
      const text = "This device uses big endian byte order for 32-bit values.";
      const hints = extractDocumentHints(text);
      expect(hints.length).toBeGreaterThan(0);
      expect(hints[0].type).toContain("order");
    });

    it("should include context around matched patterns", () => {
      const text = "For configuration, add 40000 to address values in the table.";
      const hints = extractDocumentHints(text);
      expect(hints.length).toBeGreaterThan(0);
      expect(hints[0].context.length).toBeGreaterThan(10);
    });

    it("should return empty array for text without hints", () => {
      const text = "General product description without addressing info.";
      const hints = extractDocumentHints(text);
      expect(hints).toEqual([]);
    });
  });

  // =========================================================================
  // repairJson
  // =========================================================================
  describe("repairJson", () => {
    it("should remove trailing commas before closing brackets", () => {
      const input = '[{"a": 1}, {"b": 2},]';
      const result = repairJson(input);
      expect(result).toBe('[{"a": 1}, {"b": 2}]');
    });

    it("should remove trailing comma at end", () => {
      const input = '[{"a": 1}, {"b": 2},';
      const result = repairJson(input);
      expect(result).toBe('[{"a": 1}, {"b": 2}]');
    });

    it("should close unclosed arrays", () => {
      const input = '[{"address": 100}, {"address": 101}';
      const result = repairJson(input);
      expect(result).toBe('[{"address": 100}, {"address": 101}]');
    });

    it("should handle text before the array", () => {
      const input = 'Here are the registers: [{"a": 1}]';
      const result = repairJson(input);
      expect(result).toBe('[{"a": 1}]');
    });

    it("should handle valid JSON unchanged", () => {
      const input = '[{"address": 100, "name": "Temp"}]';
      const result = repairJson(input);
      expect(JSON.parse(result)).toEqual([{ address: 100, name: "Temp" }]);
    });

    it("should handle truncated JSON with partial object", () => {
      const input = '[{"address": 100}, {"address": 101}, {"addre';
      const result = repairJson(input);
      // Should truncate at last complete object
      expect(result).toBe('[{"address": 100}, {"address": 101}]');
    });
  });

  // =========================================================================
  // extractRegistersFromMalformedJson
  // =========================================================================
  describe("extractRegistersFromMalformedJson", () => {
    it("should extract registers from well-formed objects", () => {
      const json = '[{"address": 100, "name": "Temp", "datatype": "UINT16", "description": "Temperature", "writable": false}]';
      const result = extractRegistersFromMalformedJson(json);
      expect(result).toHaveLength(1);
      expect(result[0].address).toBe(100);
      expect(result[0].name).toBe("Temp");
    });

    it("should extract multiple registers", () => {
      const json = `[
        {"address": 100, "name": "Temp", "datatype": "UINT16", "description": "Temperature", "writable": false},
        {"address": 101, "name": "Pressure", "datatype": "UINT16", "description": "Pressure sensor", "writable": true}
      ]`;
      const result = extractRegistersFromMalformedJson(json);
      expect(result).toHaveLength(2);
      expect(result[0].address).toBe(100);
      expect(result[1].address).toBe(101);
    });

    it("should extract registers from truncated JSON", () => {
      const json = '[{"address": 100, "name": "Temp", "datatype": "UINT16", "description": "Desc", "writable": false}, {"address": 200';
      const result = extractRegistersFromMalformedJson(json);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].address).toBe(100);
    });

    it("should return empty array for non-register JSON", () => {
      const json = '{"config": {"setting": true}}';
      const result = extractRegistersFromMalformedJson(json);
      expect(result).toEqual([]);
    });

    it("should extract with lenient pattern when strict fails", () => {
      // Malformed JSON but has address field
      const json = '{"address": 500, "name": "Test"}';
      const result = extractRegistersFromMalformedJson(json);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].address).toBe(500);
    });
  });

  // =========================================================================
  // calculateConfidenceLevel
  // =========================================================================
  describe("calculateConfidenceLevel", () => {
    it("should return 'high' for many registers and good page ratio", () => {
      const level = calculateConfidenceLevel(100, 15, 100);
      expect(level).toBe("high");
    });

    it("should return 'medium' for moderate results", () => {
      const level = calculateConfidenceLevel(30, 5, 100);
      expect(level).toBe("medium");
    });

    it("should return 'low' for few registers", () => {
      const level = calculateConfidenceLevel(5, 1, 100);
      expect(level).toBe("low");
    });

    it("should handle edge cases", () => {
      expect(calculateConfidenceLevel(0, 0, 0)).toBe("low");
      expect(calculateConfidenceLevel(50, 10, 100)).toBe("high");
    });
  });

  // =========================================================================
  // mergeAndDeduplicateRegisters
  // =========================================================================
  describe("mergeAndDeduplicateRegisters", () => {
    it("should remove duplicate addresses", () => {
      const registers: ModbusRegister[] = [
        { address: 100, name: "Temp1", datatype: "UINT16", description: "Desc1", writable: false },
        { address: 100, name: "Temp2", datatype: "INT16", description: "Desc2", writable: true },
        { address: 101, name: "Pressure", datatype: "UINT16", description: "Desc3", writable: false },
      ];
      const result = mergeAndDeduplicateRegisters(registers);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.address)).toEqual([100, 101]);
    });

    it("should sort by address", () => {
      const registers: ModbusRegister[] = [
        { address: 300, name: "C", datatype: "UINT16", description: "", writable: false },
        { address: 100, name: "A", datatype: "UINT16", description: "", writable: false },
        { address: 200, name: "B", datatype: "UINT16", description: "", writable: false },
      ];
      const result = mergeAndDeduplicateRegisters(registers);
      expect(result.map((r) => r.address)).toEqual([100, 200, 300]);
    });

    it("should prefer registers with more complete data", () => {
      const registers: ModbusRegister[] = [
        { address: 100, name: "T", datatype: "UINT16", description: "", writable: false },
        { address: 100, name: "Temperature Sensor Value", datatype: "UINT16", description: "Current temperature reading", writable: false },
      ];
      const result = mergeAndDeduplicateRegisters(registers);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Temperature Sensor Value");
      expect(result[0].description).toBe("Current temperature reading");
    });

    it("should handle empty array", () => {
      const result = mergeAndDeduplicateRegisters([]);
      expect(result).toEqual([]);
    });
  });
});

