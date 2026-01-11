import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the database
const mockDb = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  limit: vi.fn(() => Promise.resolve([])),
  insert: vi.fn(() => mockDb),
  values: vi.fn(() => mockDb),
  returning: vi.fn(() => Promise.resolve([])),
  update: vi.fn(() => mockDb),
  set: vi.fn(() => mockDb),
  delete: vi.fn(() => mockDb),
  orderBy: vi.fn(() => mockDb),
};

let mockDatabaseAvailable = true;

vi.mock("../../db", () => ({
  getDb: vi.fn(() => mockDb),
  isDatabaseAvailable: vi.fn(() => mockDatabaseAvailable),
}));

// Mock logger
vi.mock("../../logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Import after mocks
import {
  createTemplate,
  getTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  getDefaultTemplate,
  applyTemplate,
  validateTemplateConfig,
  exportToCSV,
  exportToJSON,
  exportToXML,
} from "../../services/templates";
import type { TemplateConfig, ModbusRegister } from "../../../shared/schema";

describe("Templates Service", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDatabaseAvailable = true;
    // Reset the isDatabaseAvailable mock to return true
    const { isDatabaseAvailable } = await import("../../db");
    vi.mocked(isDatabaseAvailable).mockReturnValue(true);
    // Reset mock chain
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.limit.mockResolvedValue([]);
    mockDb.insert.mockReturnValue(mockDb);
    mockDb.values.mockReturnValue(mockDb);
    mockDb.returning.mockResolvedValue([]);
    mockDb.update.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
    mockDb.delete.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
  });

  describe("createTemplate", () => {
    it("should create a new template", async () => {
      const mockTemplate = {
        id: "template-123",
        userId: "user-123",
        name: "My Template",
        format: "csv",
        config: { showFields: ["address", "name"] },
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([mockTemplate]);

      const template = await createTemplate(
        "user-123",
        "My Template",
        "csv",
        { showFields: ["address", "name"] }
      );

      expect(template.name).toBe("My Template");
      expect(template.format).toBe("csv");
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should throw when database not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      await expect(
        createTemplate("user-123", "Template", "csv", {})
      ).rejects.toThrow("Database not available");
    });
  });

  describe("getTemplates", () => {
    it("should return all templates for user", async () => {
      const mockTemplates = [
        {
          id: "t1",
          userId: "user-123",
          name: "Template A",
          format: "csv",
          config: {},
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "t2",
          userId: "user-123",
          name: "Template B",
          format: "json",
          config: {},
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb.orderBy.mockResolvedValueOnce(mockTemplates);

      const templates = await getTemplates("user-123");

      expect(templates).toHaveLength(2);
    });

    it("should filter by format", async () => {
      const mockTemplates = [
        {
          id: "t1",
          userId: "user-123",
          name: "CSV Template",
          format: "csv",
          config: {},
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb.orderBy.mockResolvedValueOnce(mockTemplates);

      const templates = await getTemplates("user-123", "csv");

      expect(templates).toHaveLength(1);
      expect(templates[0].format).toBe("csv");
    });

    it("should return empty array when database not available", async () => {
      mockDatabaseAvailable = false;
      const { isDatabaseAvailable } = await import("../../db");
      vi.mocked(isDatabaseAvailable).mockReturnValue(false);

      const templates = await getTemplates("user-123");

      expect(templates).toEqual([]);
    });
  });

  describe("getTemplate", () => {
    it("should return template by ID", async () => {
      const mockTemplate = {
        id: "template-123",
        userId: "user-123",
        name: "My Template",
        format: "csv",
        config: {},
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockTemplate]);

      const template = await getTemplate("template-123", "user-123");

      expect(template).not.toBeNull();
      expect(template?.id).toBe("template-123");
    });

    it("should return null if not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const template = await getTemplate("nonexistent", "user-123");

      expect(template).toBeNull();
    });
  });

  describe("updateTemplate", () => {
    it("should update template", async () => {
      const updatedTemplate = {
        id: "template-123",
        userId: "user-123",
        name: "Updated Name",
        format: "csv",
        config: {},
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([updatedTemplate]);

      const result = await updateTemplate("template-123", "user-123", {
        name: "Updated Name",
      });

      expect(result.name).toBe("Updated Name");
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("should throw if template not found", async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      await expect(
        updateTemplate("nonexistent", "user-123", { name: "New Name" })
      ).rejects.toThrow("Template not found");
    });
  });

  describe("deleteTemplate", () => {
    it("should delete template", async () => {
      await deleteTemplate("template-123", "user-123");

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe("getDefaultTemplate", () => {
    it("should return default template for format", async () => {
      const mockTemplate = {
        id: "template-123",
        userId: "user-123",
        name: "Default CSV",
        format: "csv",
        config: {},
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([mockTemplate]);

      const template = await getDefaultTemplate("user-123", "csv");

      expect(template).not.toBeNull();
      expect(template?.isDefault).toBe(true);
    });

    it("should return null if no default exists", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const template = await getDefaultTemplate("user-123", "csv");

      expect(template).toBeNull();
    });
  });

  describe("applyTemplate", () => {
    const sampleRegisters: ModbusRegister[] = [
      { address: 1, name: "Reg1", datatype: "INT16", description: "Test", writable: false },
      { address: 2, name: "Reg2", datatype: "INT32", description: "Test 2", writable: true },
    ];

    it("should filter fields based on showFields", () => {
      const config: TemplateConfig = {
        showFields: ["address", "name"],
      };

      const result = applyTemplate(sampleRegisters, config);

      expect(Object.keys(result[0])).toEqual(["address", "name"]);
      expect(result[0].address).toBe(1);
      expect(result[0].name).toBe("Reg1");
      expect(result[0].description).toBeUndefined();
    });

    it("should rename fields based on fieldMapping", () => {
      const config: TemplateConfig = {
        fieldMapping: {
          address: "reg_address",
          name: "register_name",
        },
      };

      const result = applyTemplate(sampleRegisters, config);

      expect(result[0].reg_address).toBe(1);
      expect(result[0].register_name).toBe("Reg1");
    });

    it("should reorder fields based on fieldOrder", () => {
      const config: TemplateConfig = {
        fieldOrder: ["name", "address", "datatype"],
      };

      const result = applyTemplate(sampleRegisters, config);
      const keys = Object.keys(result[0]);

      expect(keys[0]).toBe("name");
      expect(keys[1]).toBe("address");
      expect(keys[2]).toBe("datatype");
    });
  });

  describe("validateTemplateConfig", () => {
    it("should validate valid config", () => {
      const config: TemplateConfig = {
        showFields: ["address", "name", "datatype"],
        fieldOrder: ["address", "name"],
      };

      const result = validateTemplateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect invalid showFields", () => {
      const config: TemplateConfig = {
        showFields: ["address", "invalid_field"],
      };

      const result = validateTemplateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid field in showFields: invalid_field");
    });

    it("should detect invalid fieldMapping", () => {
      const config: TemplateConfig = {
        fieldMapping: {
          invalid_field: "something",
        },
      };

      const result = validateTemplateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid field in fieldMapping: invalid_field");
    });

    it("should detect invalid CSV delimiter", () => {
      const config: TemplateConfig = {
        csv: { delimiter: "|" },
      };

      const result = validateTemplateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid CSV delimiter: |");
    });
  });

  describe("exportToCSV", () => {
    it("should export registers to CSV", () => {
      const registers = [
        { address: 1, name: "Reg1", datatype: "INT16" },
        { address: 2, name: "Reg2", datatype: "INT32" },
      ];

      const csv = exportToCSV(registers);

      expect(csv).toContain("address,name,datatype");
      expect(csv).toContain("1,Reg1,INT16");
      expect(csv).toContain("2,Reg2,INT32");
    });

    it("should use custom delimiter", () => {
      const registers = [{ address: 1, name: "Reg1" }];
      const config: TemplateConfig = { csv: { delimiter: ";" } };

      const csv = exportToCSV(registers, config);

      expect(csv).toContain(";");
    });

    it("should return empty string for empty array", () => {
      const csv = exportToCSV([]);

      expect(csv).toBe("");
    });

    it("should escape values with special characters", () => {
      const registers = [{ address: 1, name: 'Reg with "quotes"' }];

      const csv = exportToCSV(registers);

      expect(csv).toContain('"Reg with ""quotes"""');
    });
  });

  describe("exportToJSON", () => {
    it("should export registers to JSON", () => {
      const registers = [{ address: 1, name: "Reg1" }];

      const json = exportToJSON(registers);
      const parsed = JSON.parse(json);

      expect(parsed.registers).toHaveLength(1);
      expect(parsed.registers[0].address).toBe(1);
    });

    it("should use custom root key", () => {
      const registers = [{ address: 1 }];
      const config: TemplateConfig = { json: { rootKey: "data" } };

      const json = exportToJSON(registers, config);
      const parsed = JSON.parse(json);

      expect(parsed.data).toBeDefined();
    });

    it("should support compact output", () => {
      const registers = [{ address: 1 }];
      const config: TemplateConfig = { json: { prettyPrint: false } };

      const json = exportToJSON(registers, config);

      expect(json).not.toContain("\n");
    });
  });

  describe("exportToXML", () => {
    it("should export registers to XML", () => {
      const registers = [{ address: 1, name: "Reg1" }];

      const xml = exportToXML(registers);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain("<ModbusRegisters>");
      expect(xml).toContain("<Register>");
      expect(xml).toContain("<address>1</address>");
      expect(xml).toContain("<name>Reg1</name>");
    });

    it("should use custom element names", () => {
      const registers = [{ address: 1 }];
      const config: TemplateConfig = {
        xml: { rootElement: "Registers", itemElement: "Reg" },
      };

      const xml = exportToXML(registers, config);

      expect(xml).toContain("<Registers>");
      expect(xml).toContain("<Reg>");
    });

    it("should support attribute mode", () => {
      const registers = [{ address: 1, name: "Reg1" }];
      const config: TemplateConfig = { xml: { useAttributes: true } };

      const xml = exportToXML(registers, config);

      expect(xml).toContain('address="1"');
      expect(xml).toContain('name="Reg1"');
      expect(xml).toContain("/>");
    });

    it("should escape special XML characters", () => {
      const registers = [{ address: 1, name: "<Test & Value>" }];

      const xml = exportToXML(registers);

      expect(xml).toContain("&lt;Test &amp; Value&gt;");
    });
  });
});
