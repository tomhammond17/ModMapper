import type { Express, Request, Response } from 'express';
import { requireAuth, loadSubscription, requirePro } from '../middleware/auth';
import * as templates from '../services/templates';
import { storage } from '../storage';
import { createLogger } from '../logger';

const log = createLogger('template-routes');

/**
 * Register template routes
 */
export function registerTemplateRoutes(app: Express): void {
  /**
   * GET /api/v1/templates
   * List templates
   */
  app.get(
    '/api/v1/templates',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const format = req.query.format as string | undefined;
        const templateList = await templates.getTemplates(req.user!.id, format);
        res.json({ success: true, templates: templateList });
      } catch (error) {
        log.error('Failed to fetch templates', { error, userId: req.user!.id });
        res.status(500).json({
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Failed to fetch templates',
        });
      }
    }
  );

  /**
   * POST /api/v1/templates
   * Create template
   */
  app.post(
    '/api/v1/templates',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const { name, format, config } = req.body;

        // Validation
        if (!name || !format || !config) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'name, format, and config are required',
          });
          return;
        }

        if (!['csv', 'json', 'xml'].includes(format)) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'format must be csv, json, or xml',
          });
          return;
        }

        const validation = templates.validateTemplateConfig(config);
        if (!validation.valid) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: validation.errors.join(', '),
          });
          return;
        }

        const template = await templates.createTemplate(req.user!.id, name, format, config);
        log.info('Created template', { userId: req.user!.id, templateId: template.id });
        res.json({ success: true, template });
      } catch (error: any) {
        log.error('Failed to create template', { error, userId: req.user!.id });
        res.status(400).json({
          success: false,
          error: 'CREATE_FAILED',
          message: error.message || 'Failed to create template',
        });
      }
    }
  );

  /**
   * GET /api/v1/templates/:id
   * Get template
   */
  app.get(
    '/api/v1/templates/:id',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const template = await templates.getTemplate(req.params.id, req.user!.id);

        if (!template) {
          res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message: 'Template not found',
          });
          return;
        }

        res.json({ success: true, template });
      } catch (error) {
        log.error('Failed to get template', { error, templateId: req.params.id });
        res.status(500).json({
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Failed to get template',
        });
      }
    }
  );

  /**
   * PATCH /api/v1/templates/:id
   * Update template
   */
  app.patch(
    '/api/v1/templates/:id',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const { name, config, isDefault } = req.body;
        const updates: any = {};

        if (name !== undefined) updates.name = name;
        if (config !== undefined) {
          const validation = templates.validateTemplateConfig(config);
          if (!validation.valid) {
            res.status(400).json({
              success: false,
              error: 'VALIDATION_ERROR',
              message: validation.errors.join(', '),
            });
            return;
          }
          updates.config = config;
        }
        if (isDefault !== undefined) updates.isDefault = isDefault;

        const template = await templates.updateTemplate(req.params.id, req.user!.id, updates);
        log.info('Updated template', { userId: req.user!.id, templateId: req.params.id });
        res.json({ success: true, template });
      } catch (error: any) {
        log.error('Failed to update template', { error, templateId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'UPDATE_FAILED',
          message: error.message || 'Failed to update template',
        });
      }
    }
  );

  /**
   * DELETE /api/v1/templates/:id
   * Delete template
   */
  app.delete(
    '/api/v1/templates/:id',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        await templates.deleteTemplate(req.params.id, req.user!.id);
        log.info('Deleted template', { userId: req.user!.id, templateId: req.params.id });
        res.json({ success: true, message: 'Template deleted' });
      } catch (error) {
        log.error('Failed to delete template', { error, templateId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'DELETE_FAILED',
          message: 'Failed to delete template',
        });
      }
    }
  );

  /**
   * POST /api/v1/templates/:id/preview
   * Preview template with sample data
   */
  app.post(
    '/api/v1/templates/:id/preview',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const { registers } = req.body;
        const template = await templates.getTemplate(req.params.id, req.user!.id);

        if (!template) {
          res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message: 'Template not found',
          });
          return;
        }

        // Apply template transformations
        const transformed = templates.applyTemplate(registers || [], template.config);

        // Generate preview in template's format
        let preview: string;
        switch (template.format) {
          case 'csv':
            preview = templates.exportToCSV(transformed, template.config);
            break;
          case 'xml':
            preview = templates.exportToXML(transformed, template.config);
            break;
          case 'json':
          default:
            preview = templates.exportToJSON(transformed, template.config);
            break;
        }

        res.json({ success: true, preview, format: template.format });
      } catch (error: any) {
        log.error('Failed to preview template', { error, templateId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'PREVIEW_FAILED',
          message: error.message || 'Failed to preview template',
        });
      }
    }
  );

  /**
   * POST /api/v1/export
   * Export document with template
   */
  app.post(
    '/api/v1/export',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const { documentId, templateId, format } = req.body;

        if (!documentId) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'documentId is required',
          });
          return;
        }

        // Get document
        const document = await storage.getDocument(documentId, req.user!.id);
        if (!document) {
          res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message: 'Document not found',
          });
          return;
        }

        // Get template if specified
        let template = null;
        if (templateId) {
          template = await templates.getTemplate(templateId, req.user!.id);
          if (!template) {
            res.status(404).json({
              success: false,
              error: 'NOT_FOUND',
              message: 'Template not found',
            });
            return;
          }
        }

        // Apply template transformations
        let registers: Record<string, any>[] = document.registers.map(r => ({ ...r }));
        if (template) {
          registers = templates.applyTemplate(document.registers, template.config);
        }

        // Export to format
        const exportFormat = format || template?.format || 'json';
        const config = template?.config;

        let content: string;
        let mimeType: string;
        let extension: string;

        switch (exportFormat) {
          case 'csv':
            content = templates.exportToCSV(registers, config);
            mimeType = 'text/csv';
            extension = 'csv';
            break;
          case 'xml':
            content = templates.exportToXML(registers, config);
            mimeType = 'application/xml';
            extension = 'xml';
            break;
          case 'json':
          default:
            content = templates.exportToJSON(registers, config);
            mimeType = 'application/json';
            extension = 'json';
            break;
        }

        // Set filename based on document name
        const filename = document.filename.replace(/\.[^.]+$/, '') + '.' + extension;

        log.info('Exported document', {
          userId: req.user!.id,
          documentId,
          templateId,
          format: exportFormat,
        });

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
      } catch (error: any) {
        log.error('Failed to export document', { error });
        res.status(400).json({
          success: false,
          error: 'EXPORT_FAILED',
          message: error.message || 'Failed to export document',
        });
      }
    }
  );
}
