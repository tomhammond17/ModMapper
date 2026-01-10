# Agent 3: Document & Folder Storage

## Mission
Implement persistent document storage with hierarchical folders for Pro users. Use materialized paths for efficient folder tree operations.

## Branch
```bash
git checkout -b feature/document-storage develop
```

## Dependencies
- Agent 2 (Usage Tracking) must be merged to develop first
- Database schema already includes `documentsTable` and `foldersTable`

---

## Tasks

### 1. Create Folder Service (`server/services/folders.ts`)

Create a new file with these functions:

```typescript
import { and, eq, sql, isNull } from 'drizzle-orm';
import { getDb } from '../db';
import { foldersTable, documentsTable } from '@shared/schema';

// Create a new folder
export async function createFolder(
  userId: string,
  name: string,
  parentId?: string
): Promise<Folder> {
  const db = getDb();

  let path = '/';

  if (parentId) {
    const parent = await getFolder(parentId, userId);
    if (!parent) {
      throw new Error('Parent folder not found');
    }
    path = `${parent.path}${parent.id}/`;
  }

  const [folder] = await db
    .insert(foldersTable)
    .values({
      userId,
      name,
      parentId,
      path,
    })
    .returning();

  return folder;
}

// Get all folders for user (flat list)
export async function getFolders(userId: string): Promise<Folder[]> {
  const db = getDb();

  const folders = await db
    .select()
    .from(foldersTable)
    .where(eq(foldersTable.userId, userId))
    .orderBy(foldersTable.path, foldersTable.name);

  return folders;
}

// Get folder by ID with ownership check
export async function getFolder(
  folderId: string,
  userId: string
): Promise<Folder | null> {
  const db = getDb();

  const [folder] = await db
    .select()
    .from(foldersTable)
    .where(and(
      eq(foldersTable.id, folderId),
      eq(foldersTable.userId, userId)
    ))
    .limit(1);

  return folder || null;
}

// Move folder to new parent
export async function moveFolder(
  folderId: string,
  userId: string,
  newParentId?: string | null
): Promise<void> {
  const db = getDb();

  const folder = await getFolder(folderId, userId);
  if (!folder) throw new Error('Folder not found');

  // Prevent moving folder into itself
  if (newParentId === folderId) {
    throw new Error('Cannot move folder into itself');
  }

  // Calculate new path
  let newPath = '/';
  if (newParentId) {
    const newParent = await getFolder(newParentId, userId);
    if (!newParent) throw new Error('Parent folder not found');

    // Prevent circular reference
    if (newParent.path.includes(`/${folderId}/`)) {
      throw new Error('Cannot move folder into its own descendant');
    }

    newPath = `${newParent.path}${newParent.id}/`;
  }

  const oldPath = `${folder.path}${folderId}/`;
  const newFullPath = `${newPath}${folderId}/`;

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
}

// Rename folder
export async function renameFolder(
  folderId: string,
  userId: string,
  newName: string
): Promise<void> {
  const db = getDb();

  await db
    .update(foldersTable)
    .set({ name: newName, updatedAt: new Date() })
    .where(and(
      eq(foldersTable.id, folderId),
      eq(foldersTable.userId, userId)
    ));
}

// Delete folder and all contents
export async function deleteFolder(
  folderId: string,
  userId: string
): Promise<void> {
  const db = getDb();

  const folder = await getFolder(folderId, userId);
  if (!folder) throw new Error('Folder not found');

  const folderPath = `${folder.path}${folderId}/`;

  // Delete all documents in this folder and subfolders
  await db
    .delete(documentsTable)
    .where(and(
      eq(documentsTable.userId, userId),
      sql`${documentsTable.folderId} IN (
        SELECT id FROM ${foldersTable}
        WHERE user_id = ${userId}
        AND (id = ${folderId} OR path LIKE ${folderPath + '%'})
      )`
    ));

  // Delete documents directly in this folder
  await db
    .delete(documentsTable)
    .where(and(
      eq(documentsTable.userId, userId),
      eq(documentsTable.folderId, folderId)
    ));

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
}

// Get folder breadcrumb path
export async function getFolderPath(
  folderId: string,
  userId: string
): Promise<Folder[]> {
  const db = getDb();

  const folder = await getFolder(folderId, userId);
  if (!folder) throw new Error('Folder not found');

  // Extract folder IDs from path
  const pathIds = folder.path
    .split('/')
    .filter(id => id.length > 0);

  if (pathIds.length === 0) {
    return [folder];
  }

  // Get all ancestor folders
  const ancestors = await db
    .select()
    .from(foldersTable)
    .where(and(
      eq(foldersTable.userId, userId),
      sql`${foldersTable.id} = ANY(${pathIds})`
    ));

  // Sort by path length (shallowest first)
  ancestors.sort((a, b) => a.path.length - b.path.length);

  return [...ancestors, folder];
}
```

### 2. Update Storage Service (`server/storage.ts`)

Update `PostgresStorage` class to support folders:

```typescript
class PostgresStorage implements IStorage {
  async saveDocument(
    doc: InsertModbusDocument,
    userId?: string,
    folderId?: string
  ): Promise<ModbusDocument> {
    const db = getDb();

    const [saved] = await db
      .insert(documentsTable)
      .values({
        filename: doc.filename,
        sourceFormat: doc.sourceFormat,
        registers: doc.registers,
        userId,
        folderId,
      })
      .returning();

    return this.mapToDocument(saved);
  }

  async getAllDocuments(
    userId?: string,
    folderId?: string | null,
    options: { limit?: number; offset?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {}
  ): Promise<ModbusDocument[]> {
    const db = getDb();
    const { limit = 50, offset = 0, sortBy = 'createdAt', sortOrder = 'desc' } = options;

    const conditions = [];

    if (userId) {
      conditions.push(eq(documentsTable.userId, userId));
    }

    if (folderId !== undefined) {
      if (folderId === null) {
        // Root level documents (no folder)
        conditions.push(isNull(documentsTable.folderId));
      } else {
        conditions.push(eq(documentsTable.folderId, folderId));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const docs = await db
      .select()
      .from(documentsTable)
      .where(where)
      .orderBy(sortOrder === 'asc' ? asc(documentsTable[sortBy]) : desc(documentsTable[sortBy]))
      .limit(limit)
      .offset(offset);

    return docs.map(this.mapToDocument);
  }

  async getDocument(id: string, userId?: string): Promise<ModbusDocument | null> {
    const db = getDb();

    const conditions = [eq(documentsTable.id, id)];
    if (userId) {
      conditions.push(eq(documentsTable.userId, userId));
    }

    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(and(...conditions))
      .limit(1);

    return doc ? this.mapToDocument(doc) : null;
  }

  async deleteDocument(id: string, userId?: string): Promise<void> {
    const db = getDb();

    const conditions = [eq(documentsTable.id, id)];
    if (userId) {
      conditions.push(eq(documentsTable.userId, userId));
    }

    await db
      .delete(documentsTable)
      .where(and(...conditions));
  }

  async moveDocument(
    documentId: string,
    userId: string,
    folderId: string | null
  ): Promise<void> {
    const db = getDb();

    await db
      .update(documentsTable)
      .set({ folderId, updatedAt: new Date() })
      .where(and(
        eq(documentsTable.id, documentId),
        eq(documentsTable.userId, userId)
      ));
  }
}
```

### 3. Create Folder Routes (`server/routes/folders.ts`)

```typescript
import { Router } from 'express';
import { requireAuth, loadSubscription, requirePro } from '../middleware/auth';
import * as folders from '../services/folders';

const router = Router();

// GET /api/v1/folders - List all folders for user
router.get('/', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    const folderList = await folders.getFolders(req.user!.id);
    res.json({ success: true, folders: folderList });
  } catch (error) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Failed to fetch folders' });
  }
});

// POST /api/v1/folders - Create new folder
router.post('/', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    const { name, parentId } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Folder name is required',
      });
    }

    const folder = await folders.createFolder(req.user!.id, name.trim(), parentId);
    res.json({ success: true, folder });
  } catch (error: any) {
    res.status(400).json({ success: false, error: 'CREATE_FAILED', message: error.message });
  }
});

// GET /api/v1/folders/:id - Get folder details
router.get('/:id', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    const folder = await folders.getFolder(req.params.id, req.user!.id);

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Folder not found',
      });
    }

    res.json({ success: true, folder });
  } catch (error) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// PATCH /api/v1/folders/:id - Update folder (rename or move)
router.patch('/:id', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    const { name, parentId } = req.body;
    const folderId = req.params.id;

    if (name !== undefined) {
      await folders.renameFolder(folderId, req.user!.id, name.trim());
    }

    if (parentId !== undefined) {
      await folders.moveFolder(folderId, req.user!.id, parentId);
    }

    const folder = await folders.getFolder(folderId, req.user!.id);
    res.json({ success: true, folder });
  } catch (error: any) {
    res.status(400).json({ success: false, error: 'UPDATE_FAILED', message: error.message });
  }
});

// DELETE /api/v1/folders/:id - Delete folder and contents
router.delete('/:id', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    await folders.deleteFolder(req.params.id, req.user!.id);
    res.json({ success: true, message: 'Folder deleted' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: 'DELETE_FAILED', message: error.message });
  }
});

// GET /api/v1/folders/:id/path - Get breadcrumb path
router.get('/:id/path', requireAuth, loadSubscription, requirePro, async (req, res) => {
  try {
    const path = await folders.getFolderPath(req.params.id, req.user!.id);
    res.json({ success: true, path });
  } catch (error: any) {
    res.status(400).json({ success: false, error: 'PATH_FAILED', message: error.message });
  }
});

export default router;
```

### 4. Update Document Routes (`server/routes.ts`)

Add folder support to document endpoints:

```typescript
// GET /api/v1/documents - List documents with folder filter
app.get("/api/v1/documents",
  requireAuth,
  loadSubscription,
  async (req, res) => {
    try {
      const folderId = req.query.folderId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // null means root level, undefined means all documents
      const folderFilter = folderId === 'root' ? null : folderId;

      const documents = await storage.getAllDocuments(
        req.user!.id,
        folderFilter,
        { limit, offset }
      );

      res.json({ success: true, documents });
    } catch (error) {
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
  }
);

// POST /api/v1/documents/:id/move - Move document to folder
app.post("/api/v1/documents/:id/move",
  requireAuth,
  loadSubscription,
  requirePro,
  async (req, res) => {
    try {
      const { folderId } = req.body;
      await storage.moveDocument(req.params.id, req.user!.id, folderId || null);
      res.json({ success: true, message: 'Document moved' });
    } catch (error) {
      res.status(400).json({ success: false, error: 'MOVE_FAILED' });
    }
  }
);
```

### 5. Register Routes in `server/index.ts`

```typescript
import folderRoutes from './routes/folders';

// After billing routes
app.use('/api/v1/folders', folderRoutes);
```

---

## Testing Checklist

- [ ] Server starts without errors
- [ ] Free users cannot access folder endpoints (403)
- [ ] Pro users can create folders
- [ ] Pro users can create nested folders
- [ ] Folders can be renamed
- [ ] Folders can be moved
- [ ] Cannot move folder into itself (error)
- [ ] Cannot move folder into descendant (error)
- [ ] Deleting folder cascades to documents
- [ ] Breadcrumb path returns correct ancestors
- [ ] Documents can be filtered by folder
- [ ] Documents can be moved between folders

---

## Files Created/Modified

| File | Action |
|------|--------|
| `server/services/folders.ts` | Create |
| `server/routes/folders.ts` | Create |
| `server/storage.ts` | Modify (add folder support) |
| `server/routes.ts` | Modify (add folder filter, move endpoint) |
| `server/index.ts` | Modify (register folder routes) |

## Completion Criteria

1. Folder CRUD operations work
2. Materialized paths update correctly on moves
3. Pro tier required for all folder operations
4. Documents can be organized in folders
5. No TypeScript errors

---

## Commit Message Template
```
feat(storage): implement folder system with document organization

- Add folder service with materialized paths
- Add folder CRUD routes (Pro-only)
- Update storage to support folder filtering
- Add document move endpoint
- Cascade delete folders with contents

Co-Authored-By: Claude <noreply@anthropic.com>
```
