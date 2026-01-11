import type { Express, Request, Response } from 'express';
import { requireAuth, loadSubscription, requirePro } from '../middleware/auth';
import * as folders from '../services/folders';
import { createLogger } from '../logger';

const log = createLogger('folder-routes');

/**
 * Register folder routes
 */
export function registerFolderRoutes(app: Express): void {
  /**
   * GET /api/v1/folders
   * List all folders for user
   */
  app.get(
    '/api/v1/folders',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const folderList = await folders.getFolders(req.user!.id);
        res.json({ success: true, folders: folderList });
      } catch (error) {
        log.error('Failed to fetch folders', { error, userId: req.user!.id });
        res.status(500).json({
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Failed to fetch folders',
        });
      }
    }
  );

  /**
   * POST /api/v1/folders
   * Create new folder
   */
  app.post(
    '/api/v1/folders',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const { name, parentId } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Folder name is required',
          });
          return;
        }

        const folder = await folders.createFolder(req.user!.id, name.trim(), parentId);
        log.info('Created folder', { userId: req.user!.id, folderId: folder.id, name: folder.name });
        res.json({ success: true, folder });
      } catch (error: any) {
        log.error('Failed to create folder', { error, userId: req.user!.id });
        res.status(400).json({
          success: false,
          error: 'CREATE_FAILED',
          message: error.message || 'Failed to create folder',
        });
      }
    }
  );

  /**
   * GET /api/v1/folders/:id
   * Get folder details
   */
  app.get(
    '/api/v1/folders/:id',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const folder = await folders.getFolder(req.params.id, req.user!.id);

        if (!folder) {
          res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message: 'Folder not found',
          });
          return;
        }

        res.json({ success: true, folder });
      } catch (error) {
        log.error('Failed to get folder', { error, userId: req.user!.id, folderId: req.params.id });
        res.status(500).json({
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Failed to get folder',
        });
      }
    }
  );

  /**
   * PATCH /api/v1/folders/:id
   * Update folder (rename or move)
   */
  app.patch(
    '/api/v1/folders/:id',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const { name, parentId } = req.body;
        const folderId = req.params.id;

        if (name !== undefined) {
          if (typeof name !== 'string' || name.trim().length === 0) {
            res.status(400).json({
              success: false,
              error: 'VALIDATION_ERROR',
              message: 'Folder name cannot be empty',
            });
            return;
          }
          await folders.renameFolder(folderId, req.user!.id, name.trim());
        }

        if (parentId !== undefined) {
          await folders.moveFolder(folderId, req.user!.id, parentId);
        }

        const folder = await folders.getFolder(folderId, req.user!.id);
        log.info('Updated folder', { userId: req.user!.id, folderId });
        res.json({ success: true, folder });
      } catch (error: any) {
        log.error('Failed to update folder', { error, userId: req.user!.id, folderId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'UPDATE_FAILED',
          message: error.message || 'Failed to update folder',
        });
      }
    }
  );

  /**
   * DELETE /api/v1/folders/:id
   * Delete folder and contents
   */
  app.delete(
    '/api/v1/folders/:id',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        await folders.deleteFolder(req.params.id, req.user!.id);
        log.info('Deleted folder', { userId: req.user!.id, folderId: req.params.id });
        res.json({ success: true, message: 'Folder deleted' });
      } catch (error: any) {
        log.error('Failed to delete folder', { error, userId: req.user!.id, folderId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'DELETE_FAILED',
          message: error.message || 'Failed to delete folder',
        });
      }
    }
  );

  /**
   * GET /api/v1/folders/:id/path
   * Get breadcrumb path
   */
  app.get(
    '/api/v1/folders/:id/path',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const path = await folders.getFolderPath(req.params.id, req.user!.id);
        res.json({ success: true, path });
      } catch (error: any) {
        log.error('Failed to get folder path', { error, userId: req.user!.id, folderId: req.params.id });
        res.status(400).json({
          success: false,
          error: 'PATH_FAILED',
          message: error.message || 'Failed to get folder path',
        });
      }
    }
  );

  /**
   * GET /api/v1/folders/:id/children
   * Get children of a folder
   */
  app.get(
    '/api/v1/folders/:id/children',
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const parentId = req.params.id === 'root' ? null : req.params.id;
        const children = await folders.getChildFolders(req.user!.id, parentId);
        res.json({ success: true, folders: children });
      } catch (error) {
        log.error('Failed to get child folders', { error, userId: req.user!.id, parentId: req.params.id });
        res.status(500).json({
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Failed to get child folders',
        });
      }
    }
  );
}
