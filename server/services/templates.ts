import { and, eq, asc } from 'drizzle-orm';
import { exportTemplatesTable } from '../../shared/schema';
import type { TemplateConfig, ExportTemplate, ModbusRegister } from '../../shared/schema';
import { createLogger } from '../logger';
import { requireDb, withDbOrDefault, withErrorLogging } from '../utils/service-helpers';

const log = createLogger('templates-service');

/**
 * Create new template
 */
export async function createTemplate(
  userId: string,
  name: string,
  format: 'csv' | 'json' | 'xml',
  config: TemplateConfig
): Promise<ExportTemplate> {
  const db = requireDb();

  return withErrorLogging(log, 'create template', { userId, name }, async () => {
    const [template] = await db
      .insert(exportTemplatesTable)
      .values({
        userId,
        name,
        format,
        config,
        isDefault: false,
      })
      .returning();

    log.info('Created template', { userId, name, format });

    return mapToTemplate(template);
  });
}

/**
 * Get all templates for user
 */
export async function getTemplates(
  userId: string,
  format?: string
): Promise<ExportTemplate[]> {
  return withDbOrDefault([], async (db) => {
    const conditions = [eq(exportTemplatesTable.userId, userId)];

    if (format) {
      conditions.push(eq(exportTemplatesTable.format, format));
    }

    const templates = await db
      .select()
      .from(exportTemplatesTable)
      .where(and(...conditions))
      .orderBy(asc(exportTemplatesTable.name));

    return templates.map(mapToTemplate);
  });
}

/**
 * Get single template
 */
export async function getTemplate(
  templateId: string,
  userId: string
): Promise<ExportTemplate | null> {
  return withDbOrDefault(null, async (db) => {
    const [template] = await db
      .select()
      .from(exportTemplatesTable)
      .where(and(
        eq(exportTemplatesTable.id, templateId),
        eq(exportTemplatesTable.userId, userId)
      ))
      .limit(1);

    return template ? mapToTemplate(template) : null;
  });
}

/**
 * Update template
 */
export async function updateTemplate(
  templateId: string,
  userId: string,
  updates: Partial<{ name: string; config: TemplateConfig; isDefault: boolean }>
): Promise<ExportTemplate> {
  const db = requireDb();

  return withErrorLogging(log, 'update template', { templateId, userId }, async () => {
    // If setting as default, unset other defaults for this format
    if (updates.isDefault) {
      const template = await getTemplate(templateId, userId);
      if (template) {
        await db
          .update(exportTemplatesTable)
          .set({ isDefault: false })
          .where(and(
            eq(exportTemplatesTable.userId, userId),
            eq(exportTemplatesTable.format, template.format)
          ));
      }
    }

    const [updated] = await db
      .update(exportTemplatesTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(exportTemplatesTable.id, templateId),
        eq(exportTemplatesTable.userId, userId)
      ))
      .returning();

    if (!updated) {
      throw new Error('Template not found');
    }

    log.info('Updated template', { templateId, userId });

    return mapToTemplate(updated);
  });
}

/**
 * Delete template
 */
export async function deleteTemplate(
  templateId: string,
  userId: string
): Promise<void> {
  const db = requireDb();

  return withErrorLogging(log, 'delete template', { templateId, userId }, async () => {
    await db
      .delete(exportTemplatesTable)
      .where(and(
        eq(exportTemplatesTable.id, templateId),
        eq(exportTemplatesTable.userId, userId)
      ));

    log.info('Deleted template', { templateId, userId });
  });
}

/**
 * Get default template for format
 */
export async function getDefaultTemplate(
  userId: string,
  format: string
): Promise<ExportTemplate | null> {
  return withDbOrDefault(null, async (db) => {
    const [template] = await db
      .select()
      .from(exportTemplatesTable)
      .where(and(
        eq(exportTemplatesTable.userId, userId),
        eq(exportTemplatesTable.format, format),
        eq(exportTemplatesTable.isDefault, true)
      ))
      .limit(1);

    return template ? mapToTemplate(template) : null;
  });
}

/**
 * Apply template transformations to registers
 */
export function applyTemplate(
  registers: ModbusRegister[],
  config: TemplateConfig
): Record<string, any>[] {
  let processed = registers.map(r => ({ ...r })) as Record<string, any>[];

  // Apply field filtering (only include specified fields)
  if (config.showFields && config.showFields.length > 0) {
    processed = processed.map(reg => {
      const filtered: Record<string, any> = {};
      for (const field of config.showFields!) {
        if (field in reg) {
          filtered[field] = reg[field];
        }
      }
      return filtered;
    });
  }

  // Apply field mapping (rename fields)
  if (config.fieldMapping) {
    processed = processed.map(reg => {
      const mapped: Record<string, any> = {};
      for (const [key, value] of Object.entries(reg)) {
        const mapping = config.fieldMapping as Record<string, string>;
        const newKey = mapping[key] || key;
        mapped[newKey] = value;
      }
      return mapped;
    });
  }

  // Apply field ordering
  if (config.fieldOrder && config.fieldOrder.length > 0) {
    processed = processed.map(reg => {
      const ordered: Record<string, any> = {};
      // First add fields in specified order
      for (const field of config.fieldOrder!) {
        if (field in reg) {
          ordered[field] = reg[field];
        }
      }
      // Then add any remaining fields not in order
      for (const [key, value] of Object.entries(reg)) {
        if (!(key in ordered)) {
          ordered[key] = value;
        }
      }
      return ordered;
    });
  }

  return processed;
}

/**
 * Validate template config
 */
export function validateTemplateConfig(config: TemplateConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const validFields = ['address', 'name', 'datatype', 'description', 'writable'];

  if (config.showFields) {
    for (const field of config.showFields) {
      if (!validFields.includes(field)) {
        errors.push(`Invalid field in showFields: ${field}`);
      }
    }
  }

  if (config.fieldOrder) {
    for (const field of config.fieldOrder) {
      if (!validFields.includes(field)) {
        errors.push(`Invalid field in fieldOrder: ${field}`);
      }
    }
  }

  if (config.fieldMapping) {
    for (const field of Object.keys(config.fieldMapping)) {
      if (!validFields.includes(field)) {
        errors.push(`Invalid field in fieldMapping: ${field}`);
      }
    }
  }

  if (config.csv?.delimiter && ![',' , ';', '\t'].includes(config.csv.delimiter)) {
    errors.push(`Invalid CSV delimiter: ${config.csv.delimiter}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Export registers to CSV format
 */
export function exportToCSV(registers: Record<string, any>[], config?: TemplateConfig): string {
  if (registers.length === 0) return '';

  // Get field order from template or use defaults
  const defaultFields = ['address', 'name', 'datatype', 'description', 'writable'];
  const fieldOrder = config?.fieldOrder || defaultFields;
  const delimiter = config?.csv?.delimiter || ',';
  const includeHeader = config?.csv?.includeHeader !== false;
  const customHeaders = config?.csv?.customHeaders;

  // Filter to only include fields that exist in data
  const availableFields = fieldOrder.filter(f => f in registers[0]);

  // Build header row
  const headers = customHeaders || availableFields;
  const headerRow = includeHeader
    ? headers.map(h => sanitizeCSVCell(h)).join(delimiter) + '\n'
    : '';

  // Build data rows
  const rows = registers.map(reg => {
    return availableFields
      .map(field => sanitizeCSVCell(reg[field]))
      .join(delimiter);
  }).join('\n');

  return headerRow + rows;
}

/**
 * Export registers to JSON format
 */
export function exportToJSON(registers: Record<string, any>[], config?: TemplateConfig): string {
  const rootKey = config?.json?.rootKey || 'registers';
  const prettyPrint = config?.json?.prettyPrint !== false;

  const data = { [rootKey]: registers };

  return prettyPrint
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
}

/**
 * Export registers to XML format
 */
export function exportToXML(registers: Record<string, any>[], config?: TemplateConfig): string {
  const rootElement = config?.xml?.rootElement || 'ModbusRegisters';
  const itemElement = config?.xml?.itemElement || 'Register';
  const useAttributes = config?.xml?.useAttributes || false;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<${rootElement}>\n`;

  for (const reg of registers) {
    if (useAttributes) {
      xml += `  <${itemElement}`;
      for (const [key, value] of Object.entries(reg)) {
        xml += ` ${key}="${escapeXML(String(value ?? ''))}"`;
      }
      xml += ` />\n`;
    } else {
      xml += `  <${itemElement}>\n`;
      for (const [key, value] of Object.entries(reg)) {
        xml += `    <${key}>${escapeXML(String(value ?? ''))}</${key}>\n`;
      }
      xml += `  </${itemElement}>\n`;
    }
  }

  xml += `</${rootElement}>`;
  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sanitize CSV cell value
 */
function sanitizeCSVCell(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';') || str.includes('\t')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Map database row to ExportTemplate
 */
function mapToTemplate(row: {
  id: string;
  userId: string;
  name: string;
  format: string;
  config: TemplateConfig;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ExportTemplate {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    format: row.format as 'csv' | 'json' | 'xml',
    config: row.config,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
