import type { Express, Request, Response } from 'express';
import { requireAuth, loadSubscription, requirePro } from '../middleware/auth';
import * as versions from '../services/versions';
import { createLogger } from '../logger';

const log = createLogger('version-routes');

/**
 * Register version routes
 */
export function registerVersionRoutes(app: Express): void {
  /**
   * GET /api/v1/documents/:id/versions
   * List all versions of a document
   */
  app.get(
    '/api/v1/documents/:id/versions',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const versionList = await versions.getVersionHistory(req.params.id, req.user!.id);
        res.json({ success: true, versions: versionList });
      } catch (error: any) {
        log.error('Failed to fetch versions', { error, documentId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'FETCH_FAILED',
          message: error.message || 'Failed to fetch versions',
        });
      }
    }
  );

  /**
   * POST /api/v1/documents/:id/versions
   * Create new version
   */
  app.post(
    '/api/v1/documents/:id/versions',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const { registers } = req.body;

        if (!registers || !Array.isArray(registers)) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Registers array is required',
          });
          return;
        }

        const version = await versions.createVersion(req.params.id, req.user!.id, registers);
        log.info('Created version', { documentId: req.params.id, versionNumber: version.versionNumber });
        res.json({ success: true, version });
      } catch (error: any) {
        log.error('Failed to create version', { error, documentId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'CREATE_FAILED',
          message: error.message || 'Failed to create version',
        });
      }
    }
  );

  /**
   * GET /api/v1/documents/:id/versions/compare
   * Compare two versions
   */
  app.get(
    '/api/v1/documents/:id/versions/compare',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const v1 = parseInt(req.query.v1 as string, 10);
        const v2 = parseInt(req.query.v2 as string, 10);

        if (isNaN(v1) || isNaN(v2)) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Both v1 and v2 query parameters are required as numbers',
          });
          return;
        }

        const comparison = await versions.compareVersions(req.params.id, v1, v2, req.user!.id);
        res.json({ success: true, comparison });
      } catch (error: any) {
        log.error('Failed to compare versions', { error, documentId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'COMPARE_FAILED',
          message: error.message || 'Failed to compare versions',
        });
      }
    }
  );

  /**
   * GET /api/v1/documents/:id/versions/:versionNumber
   * Get specific version
   */
  app.get(
    '/api/v1/documents/:id/versions/:versionNumber',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const versionNumber = parseInt(req.params.versionNumber, 10);

        if (isNaN(versionNumber)) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Invalid version number',
          });
          return;
        }

        const version = await versions.getVersion(
          req.params.id,
          versionNumber,
          req.user!.id
        );

        if (!version) {
          res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message: 'Version not found',
          });
          return;
        }

        res.json({ success: true, version });
      } catch (error: any) {
        log.error('Failed to get version', { error, documentId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'FETCH_FAILED',
          message: error.message || 'Failed to fetch version',
        });
      }
    }
  );

  /**
   * POST /api/v1/documents/:id/restore/:versionNumber
   * Restore old version as new
   */
  app.post(
    '/api/v1/documents/:id/restore/:versionNumber',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const versionNumber = parseInt(req.params.versionNumber, 10);

        if (isNaN(versionNumber)) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Invalid version number',
          });
          return;
        }

        const oldVersion = await versions.getVersion(
          req.params.id,
          versionNumber,
          req.user!.id
        );

        if (!oldVersion) {
          res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message: 'Version not found',
          });
          return;
        }

        // Create new version with old registers
        const restored = await versions.createVersion(
          req.params.id,
          req.user!.id,
          oldVersion.registers
        );

        log.info('Restored version', {
          documentId: req.params.id,
          fromVersion: versionNumber,
          toVersion: restored.versionNumber,
        });

        res.json({
          success: true,
          version: restored,
          message: `Restored from version ${versionNumber} as version ${restored.versionNumber}`,
        });
      } catch (error: any) {
        log.error('Failed to restore version', { error, documentId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'RESTORE_FAILED',
          message: error.message || 'Failed to restore version',
        });
      }
    }
  );

  /**
   * GET /api/v1/documents/check-duplicate
   * Check if filename exists (for version prompt)
   */
  app.get(
    '/api/v1/documents/check-duplicate',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const filename = req.query.filename as string;
        const folderId = req.query.folderId as string | undefined;

        if (!filename) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Filename is required',
          });
          return;
        }

        const result = await versions.checkDuplicateFilename(
          req.user!.id,
          filename,
          folderId
        );

        res.json({ success: true, ...result });
      } catch (error: any) {
        log.error('Failed to check duplicate', { error });
        res.status(400).json({
          success: false,
          error: 'CHECK_FAILED',
          message: error.message || 'Failed to check duplicate',
        });
      }
    }
  );
}
