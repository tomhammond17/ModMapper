# Agent 5: Custom Export Templates

## Mission
Implement custom export templates for Pro users. Allow field mapping, reordering, visibility control, and format-specific settings. Apply templates during export.

## Branch
```bash
git checkout -b feature/export-templates develop
```

## Dependencies
- Agent 3 (Document Storage) must be merged to develop first
- Can run in parallel with Agent 4 (Versions)

---

## Tasks

### 1. Create Template Service (`server/services/templates.ts`)

Create a new file:

```typescript
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { exportTemplatesTable, ModbusRegister, TemplateConfig } from '@shared/schema';

// Create new template
export async function createTemplate(
  userId: string,
  name: string,
  format: 'csv' | 'json' | 'xml',
  config: TemplateConfig
): Promise<ExportTemplate> {
  const db = getDb();

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

  return template;
}

// Get all templates for user
export async function getTemplates(
  userId: string,
  format?: string
): Promise<ExportTemplate[]> {
  const db = getDb();

  const conditions = [eq(exportTemplatesTable.userId, userId)];

  if (format) {
    conditions.push(eq(exportTemplatesTable.format, format));
  }

  const templates = await db
    .select()
    .from(exportTemplatesTable)
    .where(and(...conditions))
    .orderBy(exportTemplatesTable.name);

  return templates;
}

// Get single template
export async function getTemplate(
  templateId: string,
  userId: string
): Promise<ExportTemplate | null> {
  const db = getDb();

  const [template] = await db
    .select()
    .from(exportTemplatesTable)
    .where(and(
      eq(exportTemplatesTable.id, templateId),
      eq(exportTemplatesTable.userId, userId)
    ))
    .limit(1);

  return template || null;
}

// Update template
export async function updateTemplate(
  templateId: string,
  userId: string,
  updates: Partial<{ name: string; config: TemplateConfig; isDefault: boolean }>
): Promise<ExportTemplate> {
  const db = getDb();

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

  return updated;
}

// Delete template
export async function deleteTemplate(
  templateId: string,
  userId: string
): Promise<void> {
  const db = getDb();

  const result = await db
    .delete(exportTemplatesTable)
    .where(and(
      eq(exportTemplatesTable.id, templateId),
      eq(exportTemplatesTable.userId, userId)
    ));
}

// Get default template for format
export async function getDefaultTemplate(
  userId: string,
  format: string
): Promise<ExportTemplate | null> {
  const db = getDb();

  const [template] = await db
    .select()
    .from(exportTemplatesTable)
    .where(and(
      eq(exportTemplatesTable.userId, userId),
      eq(exportTemplatesTable.format, format),
      eq(exportTemplatesTable.isDefault, true)
    ))
    .limit(1);

  return template || null;
}

// Apply template transformations to registers
export function applyTemplate(
  registers: ModbusRegister[],
  config: TemplateConfig
): any[] {
  let processed = [...registers];

  // Apply field filtering (only include specified fields)
  if (config.showFields && config.showFields.length > 0) {
    processed = processed.map(reg => {
      const filtered: Record<string, any> = {};
      for (const field of config.showFields!) {
        if (field in reg) {
          filtered[field] = (reg as any)[field];
        }
      }
      return filtered as any;
    });
  }

  // Apply field mapping (rename fields)
  if (config.fieldMapping) {
    processed = processed.map(reg => {
      const mapped: Record<string, any> = {};
      for (const [key, value] of Object.entries(reg)) {
        const newKey = config.fieldMapping![key] || key;
        mapped[newKey] = value;
      }
      return mapped;
    });
  }

  return processed;
}

// Validate template config
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

  return { valid: errors.length === 0, errors };
}
```

### 2. Update Exporters (`server/routes.ts`)

Update the export functions to support templates:

```typescript
// Export to CSV with template support
function exportToCSV(registers: any[], config?: TemplateConfig): string {
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

// Export to JSON with template support
function exportToJSON(registers: any[], config?: TemplateConfig): string {
  const rootKey = config?.json?.rootKey || 'registers';
  const prettyPrint = config?.json?.prettyPrint !== false;

  const data = { [rootKey]: registers };

  return prettyPrint
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
}

// Export to XML with template support
function exportToXML(registers: any[], config?: TemplateConfig): string {
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

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeCSVCell(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```

### 3. Create Template Routes (`server/routes/templates.ts`)

```typescript
import { Router } from 'express';
import { requireAuth, loadSubscription, requirePro } from '../middleware/auth';
import * as templates from '../services/templates';
import { storage } from '../storage';

const router = Router();

// GET /api/v1/templates - List templates
router.get('/', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    const format = req.query.format as string | undefined;
    const templateList = await templates.getTemplates(req.user!.id, format);
    res.json({ success: true, templates: templateList });
  } catch (error) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /api/v1/templates - Create template
router.post('/', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    const { name, format, config } = req.body;

    // Validation
    if (!name || !format || !config) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'name, format, and config are required',
      });
    }

    if (!['csv', 'json', 'xml'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'format must be csv, json, or xml',
      });
    }

    const validation = templates.validateTemplateConfig(config);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.errors.join(', '),
      });
    }

    const template = await templates.createTemplate(req.user!.id, name, format, config);
    res.json({ success: true, template });
  } catch (error: any) {
    res.status(400).json({ success: false, error: 'CREATE_FAILED', message: error.message });
  }
});

// GET /api/v1/templates/:id - Get template
router.get('/:id', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    const template = await templates.getTemplate(req.params.id, req.user!.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Template not found',
      });
    }

    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// PATCH /api/v1/templates/:id - Update template
router.patch('/:id', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    const { name, config, isDefault } = req.body;
    const updates: any = {};

    if (name !== undefined) updates.name = name;
    if (config !== undefined) {
      const validation = templates.validateTemplateConfig(config);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: validation.errors.join(', '),
        });
      }
      updates.config = config;
    }
    if (isDefault !== undefined) updates.isDefault = isDefault;

    const template = await templates.updateTemplate(req.params.id, req.user!.id, updates);
    res.json({ success: true, template });
  } catch (error: any) {
    res.status(400).json({ success: false, error: 'UPDATE_FAILED', message: error.message });
  }
});

// DELETE /api/v1/templates/:id - Delete template
router.delete('/:id', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    await templates.deleteTemplate(req.params.id, req.user!.id);
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    res.status(400).json({ success: false, error: 'DELETE_FAILED' });
  }
});

// POST /api/v1/templates/:id/preview - Preview template with sample data
router.post('/:id/preview', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    const { registers } = req.body;
    const template = await templates.getTemplate(req.params.id, req.user!.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Template not found',
      });
    }

    // Apply template transformations
    const transformed = templates.applyTemplate(registers || [], template.config);

    // Generate preview in template's format
    let preview: string;
    switch (template.format) {
      case 'csv':
        preview = exportToCSV(transformed, template.config);
        break;
      case 'xml':
        preview = exportToXML(transformed, template.config);
        break;
      case 'json':
      default:
        preview = exportToJSON(transformed, template.config);
        break;
    }

    res.json({ success: true, preview, format: template.format });
  } catch (error: any) {
    res.status(400).json({ success: false, error: 'PREVIEW_FAILED', message: error.message });
  }
});

export default router;
```

### 4. Create Export Endpoint (`server/routes/templates.ts`)

Add to templates routes:

```typescript
// POST /api/v1/export - Export document with template
router.post('/export',
  requireAuth,
  loadSubscription,
  requirePro,
  async (req, res) => {
    try {
      const { documentId, templateId, format } = req.body;

      // Get document
      const document = await storage.getDocument(documentId, req.user!.id);
      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      // Get template if specified
      let template = null;
      if (templateId) {
        template = await templates.getTemplate(templateId, req.user!.id);
        if (!template) {
          return res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message: 'Template not found',
          });
        }
      }

      // Apply template transformations
      let registers = document.registers;
      if (template) {
        registers = templates.applyTemplate(registers, template.config);
      }

      // Export to format
      const exportFormat = format || template?.format || 'json';
      const config = template?.config;

      let content: string;
      let mimeType: string;
      let extension: string;

      switch (exportFormat) {
        case 'csv':
          content = exportToCSV(registers, config);
          mimeType = 'text/csv';
          extension = 'csv';
          break;
        case 'xml':
          content = exportToXML(registers, config);
          mimeType = 'application/xml';
          extension = 'xml';
          break;
        case 'json':
        default:
          content = exportToJSON(registers, config);
          mimeType = 'application/json';
          extension = 'json';
          break;
      }

      // Set filename based on document name
      const filename = document.filename.replace(/\.[^.]+$/, '') + '.' + extension;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error: any) {
      res.status(400).json({ success: false, error: 'EXPORT_FAILED', message: error.message });
    }
  }
);
```

### 5. Register Routes in `server/index.ts`

```typescript
import templateRoutes from './routes/templates';

// After version routes
app.use('/api/v1/templates', templateRoutes);

// Export endpoint at top level
app.post('/api/v1/export', ...); // Include in templates routes file
```

---

## Template Config Schema

```typescript
interface TemplateConfig {
  // Fields to include (if omitted, all fields included)
  showFields?: ('address' | 'name' | 'datatype' | 'description' | 'writable')[];

  // Field order for CSV (if omitted, uses default order)
  fieldOrder?: string[];

  // Rename fields (old name -> new name)
  fieldMapping?: Record<string, string>;

  // CSV-specific options
  csv?: {
    delimiter?: ',' | ';' | '\t' | '|';
    includeHeader?: boolean;
    customHeaders?: string[];
  };

  // JSON-specific options
  json?: {
    rootKey?: string;
    prettyPrint?: boolean;
  };

  // XML-specific options
  xml?: {
    rootElement?: string;
    itemElement?: string;
    useAttributes?: boolean;
  };
}
```

## Example Templates

**Standard Modbus CSV:**
```json
{
  "name": "Standard Modbus CSV",
  "format": "csv",
  "config": {
    "fieldOrder": ["address", "name", "datatype", "writable", "description"],
    "csv": { "delimiter": ",", "includeHeader": true }
  }
}
```

**Compact JSON:**
```json
{
  "name": "Compact JSON",
  "format": "json",
  "config": {
    "showFields": ["address", "name", "datatype"],
    "json": { "rootKey": "registers", "prettyPrint": false }
  }
}
```

**RSLogix XML:**
```json
{
  "name": "RSLogix XML",
  "format": "xml",
  "config": {
    "fieldMapping": {
      "address": "Address",
      "name": "TagName",
      "datatype": "DataType"
    },
    "xml": {
      "rootElement": "RSLogixExport",
      "itemElement": "Tag",
      "useAttributes": true
    }
  }
}
```

---

## Testing Checklist

- [ ] Server starts without errors
- [ ] Free users cannot access template endpoints (403)
- [ ] Pro users can create templates
- [ ] Templates validate config correctly
- [ ] Field mapping renames fields
- [ ] Field filtering includes only specified fields
- [ ] Field ordering works for CSV
- [ ] CSV delimiter customization works
- [ ] JSON root key customization works
- [ ] XML element customization works
- [ ] Template preview shows formatted output
- [ ] Export with template downloads correct file

---

## Files Created/Modified

| File | Action |
|------|--------|
| `server/services/templates.ts` | Create |
| `server/routes/templates.ts` | Create |
| `server/routes.ts` | Modify (update exporters) |
| `server/index.ts` | Modify (register template routes) |

## Completion Criteria

1. Template CRUD operations work
2. Template transformations apply correctly
3. All export formats support templates
4. Preview endpoint works
5. Pro tier required for all operations

---

## Commit Message Template
```
feat(templates): implement custom export templates

- Add template service for CRUD and transformations
- Add template routes with validation
- Update exporters to support template config
- Add template preview endpoint
- Add document export with template endpoint

Co-Authored-By: Claude <noreply@anthropic.com>
```
