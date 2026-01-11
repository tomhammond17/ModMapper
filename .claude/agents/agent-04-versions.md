# Agent 4: Version Control System

## Mission
Implement document version tracking for Pro users. Allow creating new versions, viewing history, comparing versions, and detecting duplicate filenames for version prompts.

## Branch
```bash
git checkout -b feature/version-control develop
```

## Dependencies
- Agent 3 (Document Storage) must be merged to develop first
- Can run in parallel with Agent 5 (Templates)

---

## Tasks

### 1. Create Version Service (`server/services/versions.ts`)

Create a new file:

```typescript
import { and, eq, or, desc } from 'drizzle-orm';
import { getDb } from '../db';
import { documentsTable, ModbusRegister } from '@shared/schema';

interface VersionComparison {
  added: ModbusRegister[];
  removed: ModbusRegister[];
  modified: Array<{
    address: number;
    old: ModbusRegister;
    new: ModbusRegister;
    changes: string[];
  }>;
  summary: {
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
  };
}

// Create a new version of a document
export async function createVersion(
  documentId: string,
  userId: string,
  registers: ModbusRegister[]
): Promise<ModbusDocument> {
  const db = getDb();

  // Get current latest version
  const [current] = await db
    .select()
    .from(documentsTable)
    .where(and(
      eq(documentsTable.id, documentId),
      eq(documentsTable.userId, userId),
      eq(documentsTable.isLatestVersion, true)
    ))
    .limit(1);

  if (!current) {
    throw new Error('Document not found');
  }

  // Mark current as not latest
  await db
    .update(documentsTable)
    .set({ isLatestVersion: false, updatedAt: new Date() })
    .where(eq(documentsTable.id, documentId));

  // Create new version
  const [newVersion] = await db
    .insert(documentsTable)
    .values({
      userId,
      folderId: current.folderId,
      filename: current.filename,
      sourceFormat: current.sourceFormat,
      registers,
      versionNumber: (current.versionNumber || 1) + 1,
      isLatestVersion: true,
      parentDocumentId: documentId, // Link to original document
    })
    .returning();

  return mapToDocument(newVersion);
}

// Get all versions of a document
export async function getVersionHistory(
  documentId: string,
  userId: string
): Promise<ModbusDocument[]> {
  const db = getDb();

  // Get all versions (the original and all children)
  const versions = await db
    .select()
    .from(documentsTable)
    .where(and(
      eq(documentsTable.userId, userId),
      or(
        eq(documentsTable.id, documentId),
        eq(documentsTable.parentDocumentId, documentId)
      )
    ))
    .orderBy(desc(documentsTable.versionNumber));

  return versions.map(mapToDocument);
}

// Get specific version
export async function getVersion(
  documentId: string,
  versionNumber: number,
  userId: string
): Promise<ModbusDocument | null> {
  const db = getDb();

  // Find version by number in the document family
  const [version] = await db
    .select()
    .from(documentsTable)
    .where(and(
      eq(documentsTable.userId, userId),
      eq(documentsTable.versionNumber, versionNumber),
      or(
        eq(documentsTable.id, documentId),
        eq(documentsTable.parentDocumentId, documentId)
      )
    ))
    .limit(1);

  return version ? mapToDocument(version) : null;
}

// Compare two versions
export async function compareVersions(
  documentId: string,
  version1: number,
  version2: number,
  userId: string
): Promise<VersionComparison> {
  const v1 = await getVersion(documentId, version1, userId);
  const v2 = await getVersion(documentId, version2, userId);

  if (!v1 || !v2) {
    throw new Error('Version not found');
  }

  const added: ModbusRegister[] = [];
  const removed: ModbusRegister[] = [];
  const modified: Array<{ address: number; old: ModbusRegister; new: ModbusRegister; changes: string[] }> = [];

  const v1Map = new Map(v1.registers.map(r => [r.address, r]));
  const v2Map = new Map(v2.registers.map(r => [r.address, r]));

  // Find added and modified
  for (const [address, newReg] of v2Map) {
    const oldReg = v1Map.get(address);
    if (!oldReg) {
      added.push(newReg);
    } else {
      const changes = detectChanges(oldReg, newReg);
      if (changes.length > 0) {
        modified.push({ address, old: oldReg, new: newReg, changes });
      }
    }
  }

  // Find removed
  for (const [address, oldReg] of v1Map) {
    if (!v2Map.has(address)) {
      removed.push(oldReg);
    }
  }

  return {
    added,
    removed,
    modified,
    summary: {
      addedCount: added.length,
      removedCount: removed.length,
      modifiedCount: modified.length,
    },
  };
}

// Check if document with same filename exists
export async function checkDuplicateFilename(
  userId: string,
  filename: string,
  folderId?: string
): Promise<{ exists: boolean; documentId?: string }> {
  const db = getDb();

  const conditions = [
    eq(documentsTable.userId, userId),
    eq(documentsTable.filename, filename),
    eq(documentsTable.isLatestVersion, true),
  ];

  if (folderId) {
    conditions.push(eq(documentsTable.folderId, folderId));
  }

  const [existing] = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(and(...conditions))
    .limit(1);

  return existing
    ? { exists: true, documentId: existing.id }
    : { exists: false };
}

// Helper: Detect what fields changed between registers
function detectChanges(old: ModbusRegister, newReg: ModbusRegister): string[] {
  const changes: string[] = [];

  if (old.name !== newReg.name) changes.push('name');
  if (old.datatype !== newReg.datatype) changes.push('datatype');
  if (old.description !== newReg.description) changes.push('description');
  if (old.writable !== newReg.writable) changes.push('writable');

  return changes;
}

// Helper: Map database row to document
function mapToDocument(row: any): ModbusDocument {
  return {
    id: row.id,
    filename: row.filename,
    sourceFormat: row.sourceFormat,
    registers: row.registers,
    createdAt: row.createdAt,
    userId: row.userId,
    folderId: row.folderId,
    versionNumber: row.versionNumber || 1,
    isLatestVersion: row.isLatestVersion ?? true,
    parentDocumentId: row.parentDocumentId,
  };
}
```

### 2. Create Version Routes (`server/routes/versions.ts`)

```typescript
import { Router } from 'express';
import { requireAuth, loadSubscription, requirePro } from '../middleware/auth';
import * as versions from '../services/versions';

const router = Router();

// GET /api/v1/documents/:id/versions - List all versions
router.get('/:id/versions',
  requireAuth,
  loadSubscription,
  requirePro,
  async (req, res) => {
    try {
      const versionList = await versions.getVersionHistory(req.params.id, req.user!.id);
      res.json({ success: true, versions: versionList });
    } catch (error: any) {
      res.status(400).json({ success: false, error: 'FETCH_FAILED', message: error.message });
    }
  }
);

// POST /api/v1/documents/:id/versions - Create new version
router.post('/:id/versions',
  requireAuth,
  loadSubscription,
  requirePro,
  async (req, res) => {
    try {
      const { registers } = req.body;

      if (!registers || !Array.isArray(registers)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Registers array is required',
        });
      }

      const version = await versions.createVersion(req.params.id, req.user!.id, registers);
      res.json({ success: true, version });
    } catch (error: any) {
      res.status(400).json({ success: false, error: 'CREATE_FAILED', message: error.message });
    }
  }
);

// GET /api/v1/documents/:id/versions/:versionNumber
router.get('/:id/versions/:versionNumber',
  requireAuth,
  loadSubscription,
  requirePro,
  async (req, res) => {
    try {
      const versionNumber = parseInt(req.params.versionNumber, 10);

      if (isNaN(versionNumber)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid version number',
        });
      }

      const version = await versions.getVersion(
        req.params.id,
        versionNumber,
        req.user!.id
      );

      if (!version) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Version not found',
        });
      }

      res.json({ success: true, version });
    } catch (error: any) {
      res.status(400).json({ success: false, error: 'FETCH_FAILED', message: error.message });
    }
  }
);

// GET /api/v1/documents/:id/versions/compare?v1=1&v2=2
router.get('/:id/versions/compare',
  requireAuth,
  loadSubscription,
  requirePro,
  async (req, res) => {
    try {
      const v1 = parseInt(req.query.v1 as string, 10);
      const v2 = parseInt(req.query.v2 as string, 10);

      if (isNaN(v1) || isNaN(v2)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Both v1 and v2 query parameters are required as numbers',
        });
      }

      const comparison = await versions.compareVersions(req.params.id, v1, v2, req.user!.id);
      res.json({ success: true, comparison });
    } catch (error: any) {
      res.status(400).json({ success: false, error: 'COMPARE_FAILED', message: error.message });
    }
  }
);

// POST /api/v1/documents/:id/restore/:versionNumber - Restore old version as new
router.post('/:id/restore/:versionNumber',
  requireAuth,
  loadSubscription,
  requirePro,
  async (req, res) => {
    try {
      const versionNumber = parseInt(req.params.versionNumber, 10);

      const oldVersion = await versions.getVersion(
        req.params.id,
        versionNumber,
        req.user!.id
      );

      if (!oldVersion) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Version not found',
        });
      }

      // Create new version with old registers
      const restored = await versions.createVersion(
        req.params.id,
        req.user!.id,
        oldVersion.registers
      );

      res.json({
        success: true,
        version: restored,
        message: `Restored from version ${versionNumber} as version ${restored.versionNumber}`
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: 'RESTORE_FAILED', message: error.message });
    }
  }
);

export default router;
```

### 3. Update Parse Routes for Version Detection

Add duplicate detection to parse endpoint in `server/routes.ts`:

```typescript
import { checkDuplicateFilename } from './services/versions';

app.post("/api/v1/parse",
  optionalAuth,
  loadSubscription,
  checkUsageLimits,
  trackUsageAfterSuccess,
  parseFileLimiter,
  upload.single("file"),
  async (req, res) => {
    // ... existing parse logic to get result ...

    // If Pro user, check for duplicate filename
    if (req.user && req.subscription?.tier === 'pro') {
      const folderId = req.body.folderId;
      const { exists, documentId } = await checkDuplicateFilename(
        req.user.id,
        result.filename,
        folderId
      );

      if (exists) {
        // Return prompt for version creation
        return res.json({
          success: true,
          message: 'Document with this filename already exists',
          action: 'VERSION_PROMPT',
          existingDocumentId: documentId,
          registers: result.registers,
          filename: result.filename,
        });
      }

      // Save as new document
      const saved = await storage.saveDocument(result, req.user.id, folderId);
      return res.json({ success: true, document: saved });
    }

    // Non-Pro or anonymous: return parsed result without saving
    res.json({ success: true, ...result });
  }
);
```

### 4. Register Routes in `server/index.ts`

```typescript
import versionRoutes from './routes/versions';

// Mount on documents path since versions are document-specific
app.use('/api/v1/documents', versionRoutes);
```

---

## Testing Checklist

- [ ] Server starts without errors
- [ ] Free users cannot access version endpoints (403)
- [ ] Pro users can create new versions
- [ ] Version numbers increment correctly (1, 2, 3...)
- [ ] Only one version is marked as `isLatestVersion: true`
- [ ] Version history returns all versions in order
- [ ] Compare versions shows correct diff (added/removed/modified)
- [ ] Restore version creates new version with old registers
- [ ] Re-uploading same filename returns VERSION_PROMPT action
- [ ] Existing anonymous parsing still works

## Test Scenarios

1. **Create Version:**
   - Upload document → version 1
   - Create version → version 2
   - Version 1 has `isLatestVersion: false`
   - Version 2 has `isLatestVersion: true`

2. **Compare Versions:**
   - Version 1: registers [A, B, C]
   - Version 2: registers [A, D] (B removed, D added)
   - Compare shows: added=D, removed=B,C

3. **Duplicate Detection:**
   - Upload "test.csv" → saved
   - Upload "test.csv" again → returns VERSION_PROMPT

---

## Files Created/Modified

| File | Action |
|------|--------|
| `server/services/versions.ts` | Create |
| `server/routes/versions.ts` | Create |
| `server/routes.ts` | Modify (add duplicate detection) |
| `server/index.ts` | Modify (register version routes) |

## Completion Criteria

1. Version CRUD operations work
2. Version comparison shows accurate diffs
3. Duplicate filename detection works
4. Restore creates new version correctly
5. Pro tier required for all operations

---

## Commit Message Template
```
feat(versions): implement document version control system

- Add version service for history and comparison
- Add version routes (list, create, compare, restore)
- Add duplicate filename detection for version prompts
- Track parent document relationships
- Calculate register diffs between versions

Co-Authored-By: Claude <noreply@anthropic.com>
```
