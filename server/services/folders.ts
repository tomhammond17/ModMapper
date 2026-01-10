import { and, eq, sql, isNull, asc } from 'drizzle-orm';
import { getDb, isDatabaseAvailable } from '../db';
import { foldersTable, documentsTable } from '../../shared/schema';
import { createLogger } from '../logger';

const log = createLogger('folders-service');

export interface Folder {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new folder
 */
export async function createFolder(
  userId: string,
  name: string,
  parentId?: string
): Promise<Folder> {
  if (!isDatabaseAvailable()) {
    throw new Error('Database not available');
  }

  const db = getDb();

  let path = '/';

  if (parentId) {
    const parent = await getFolder(parentId, userId);
    if (!parent) {
      throw new Error('Parent folder not found');
    }
    path = `${parent.path}${parent.id}/`;
  }

  try {
    const [folder] = await db
      .insert(foldersTable)
      .values({
        userId,
        name,
        parentId: parentId || null,
        path,
      })
      .returning();

    log.info('Created folder', { userId, name, path });

    return {
      id: folder.id,
      userId: folder.userId,
      name: folder.name,
      parentId: folder.parentId,
      path: folder.path,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  } catch (error) {
    log.error('Failed to create folder', { error, userId, name });
    throw error;
  }
}

/**
 * Get all folders for user (flat list)
 */
export async function getFolders(userId: string): Promise<Folder[]> {
  if (!isDatabaseAvailable()) {
    return [];
  }

  const db = getDb();

  try {
    const folders = await db
      .select()
      .from(foldersTable)
      .where(eq(foldersTable.userId, userId))
      .orderBy(asc(foldersTable.path), asc(foldersTable.name));

    return folders.map((f) => ({
      id: f.id,
      userId: f.userId,
      name: f.name,
      parentId: f.parentId,
      path: f.path,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  } catch (error) {
    log.error('Failed to get folders', { error, userId });
    throw error;
  }
}

/**
 * Get folder by ID with ownership check
 */
export async function getFolder(
  folderId: string,
  userId: string
): Promise<Folder | null> {
  if (!isDatabaseAvailable()) {
    return null;
  }

  const db = getDb();

  try {
    const [folder] = await db
      .select()
      .from(foldersTable)
      .where(and(
        eq(foldersTable.id, folderId),
        eq(foldersTable.userId, userId)
      ))
      .limit(1);

    if (!folder) {
      return null;
    }

    return {
      id: folder.id,
      userId: folder.userId,
      name: folder.name,
      parentId: folder.parentId,
      path: folder.path,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  } catch (error) {
    log.error('Failed to get folder', { error, folderId, userId });
    throw error;
  }
}

/**
 * Move folder to new parent
 */
export async function moveFolder(
  folderId: string,
  userId: string,
  newParentId?: string | null
): Promise<void> {
  if (!isDatabaseAvailable()) {
    throw new Error('Database not available');
  }

  const db = getDb();

  const folder = await getFolder(folderId, userId);
  if (!folder) {
    throw new Error('Folder not found');
  }

  // Prevent moving folder into itself
  if (newParentId === folderId) {
    throw new Error('Cannot move folder into itself');
  }

  // Calculate new path
  let newPath = '/';
  if (newParentId) {
    const newParent = await getFolder(newParentId, userId);
    if (!newParent) {
      throw new Error('Parent folder not found');
    }

    // Prevent circular reference
    if (newParent.path.includes(`/${folderId}/`)) {
      throw new Error('Cannot move folder into its own descendant');
    }

    newPath = `${newParent.path}${newParent.id}/`;
  }

  const oldPath = `${folder.path}${folderId}/`;
  const newFullPath = `${newPath}${folderId}/`;

  try {
    // Update folder's path and parent
    await db
      .update(foldersTable)
      .set({
        parentId: newParentId || null,
        path: newPath,
        updatedAt: new Date()
      })
      .where(and(eq(foldersTable.id, folderId), eq(foldersTable.userId, userId)));

    // Update all descendant paths
    const descendants = await db
      .select()
      .from(foldersTable)
      .where(and(
        eq(foldersTable.userId, userId),
        sql`${foldersTable.path} LIKE ${oldPath + '%'}`
      ));

    for (const descendant of descendants) {
      const updatedPath = descendant.path.replace(oldPath, newFullPath);
      await db
        .update(foldersTable)
        .set({ path: updatedPath, updatedAt: new Date() })
        .where(eq(foldersTable.id, descendant.id));
    }

    log.info('Moved folder', { folderId, userId, newParentId });
  } catch (error) {
    log.error('Failed to move folder', { error, folderId, userId });
    throw error;
  }
}

/**
 * Rename folder
 */
export async function renameFolder(
  folderId: string,
  userId: string,
  newName: string
): Promise<void> {
  if (!isDatabaseAvailable()) {
    throw new Error('Database not available');
  }

  const db = getDb();

  try {
    await db
      .update(foldersTable)
      .set({ name: newName, updatedAt: new Date() })
      .where(and(
        eq(foldersTable.id, folderId),
        eq(foldersTable.userId, userId)
      ));

    log.info('Renamed folder', { folderId, userId, newName });
  } catch (error) {
    log.error('Failed to rename folder', { error, folderId, userId });
    throw error;
  }
}

/**
 * Delete folder and all contents
 */
export async function deleteFolder(
  folderId: string,
  userId: string
): Promise<void> {
  if (!isDatabaseAvailable()) {
    throw new Error('Database not available');
  }

  const db = getDb();

  const folder = await getFolder(folderId, userId);
  if (!folder) {
    throw new Error('Folder not found');
  }

  const folderPath = `${folder.path}${folderId}/`;

  try {
    // Get all folder IDs to delete (this folder and all descendants)
    const foldersToDelete = await db
      .select({ id: foldersTable.id })
      .from(foldersTable)
      .where(and(
        eq(foldersTable.userId, userId),
        sql`(${foldersTable.id} = ${folderId} OR ${foldersTable.path} LIKE ${folderPath + '%'})`
      ));

    const folderIds = foldersToDelete.map(f => f.id);

    // Delete documents in these folders
    if (folderIds.length > 0) {
      for (const id of folderIds) {
        await db
          .delete(documentsTable)
          .where(and(
            eq(documentsTable.userId, userId),
            eq(documentsTable.folderId, id)
          ));
      }
    }

    // Delete all subfolders
    await db
      .delete(foldersTable)
      .where(and(
        eq(foldersTable.userId, userId),
        sql`${foldersTable.path} LIKE ${folderPath + '%'}`
      ));

    // Delete the folder itself
    await db
      .delete(foldersTable)
      .where(and(
        eq(foldersTable.id, folderId),
        eq(foldersTable.userId, userId)
      ));

    log.info('Deleted folder', { folderId, userId, deletedFolders: folderIds.length });
  } catch (error) {
    log.error('Failed to delete folder', { error, folderId, userId });
    throw error;
  }
}

/**
 * Get folder breadcrumb path
 */
export async function getFolderPath(
  folderId: string,
  userId: string
): Promise<Folder[]> {
  if (!isDatabaseAvailable()) {
    throw new Error('Database not available');
  }

  const db = getDb();

  const folder = await getFolder(folderId, userId);
  if (!folder) {
    throw new Error('Folder not found');
  }

  // Extract folder IDs from path
  const pathIds = folder.path
    .split('/')
    .filter(id => id.length > 0);

  if (pathIds.length === 0) {
    return [folder];
  }

  try {
    // Get all ancestor folders
    const ancestors: Folder[] = [];
    for (const id of pathIds) {
      const ancestor = await getFolder(id, userId);
      if (ancestor) {
        ancestors.push(ancestor);
      }
    }

    // Sort by path length (shallowest first)
    ancestors.sort((a, b) => a.path.length - b.path.length);

    return [...ancestors, folder];
  } catch (error) {
    log.error('Failed to get folder path', { error, folderId, userId });
    throw error;
  }
}

/**
 * Get children folders of a folder
 */
export async function getChildFolders(
  userId: string,
  parentId?: string | null
): Promise<Folder[]> {
  if (!isDatabaseAvailable()) {
    return [];
  }

  const db = getDb();

  try {
    let query;
    if (parentId === null || parentId === undefined) {
      // Get root level folders
      query = db
        .select()
        .from(foldersTable)
        .where(and(
          eq(foldersTable.userId, userId),
          isNull(foldersTable.parentId)
        ))
        .orderBy(asc(foldersTable.name));
    } else {
      // Get children of specific folder
      query = db
        .select()
        .from(foldersTable)
        .where(and(
          eq(foldersTable.userId, userId),
          eq(foldersTable.parentId, parentId)
        ))
        .orderBy(asc(foldersTable.name));
    }

    const folders = await query;

    return folders.map((f) => ({
      id: f.id,
      userId: f.userId,
      name: f.name,
      parentId: f.parentId,
      path: f.path,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  } catch (error) {
    log.error('Failed to get child folders', { error, userId, parentId });
    throw error;
  }
}
