import { and, eq, or, desc, type InferSelectModel } from 'drizzle-orm';
import { documentsTable } from '../../shared/schema';
import type { ModbusDocument, ModbusRegister, ModbusSourceFormat } from '../../shared/schema';

type DocumentRow = InferSelectModel<typeof documentsTable>;
import { createLogger } from '../logger';
import { requireDb, withDbOrDefault, withErrorLogging } from '../utils/service-helpers';

const log = createLogger('versions-service');

export interface VersionComparison {
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

/**
 * Create a new version of a document
 */
export async function createVersion(
  documentId: string,
  userId: string,
  registers: ModbusRegister[]
): Promise<ModbusDocument> {
  const db = requireDb();

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

  return withErrorLogging(log, 'create version', { documentId, userId }, async () => {
    // Mark current as not latest
    await db
      .update(documentsTable)
      .set({ isLatestVersion: false })
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
        parentDocumentId: documentId,
      })
      .returning();

    log.info('Created new version', {
      documentId,
      newVersionId: newVersion.id,
      versionNumber: newVersion.versionNumber,
    });

    return mapToDocument(newVersion);
  });
}

/**
 * Get all versions of a document
 */
export async function getVersionHistory(
  documentId: string,
  userId: string
): Promise<ModbusDocument[]> {
  return withDbOrDefault([], async (db) => {
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
  });
}

/**
 * Get specific version
 */
export async function getVersion(
  documentId: string,
  versionNumber: number,
  userId: string
): Promise<ModbusDocument | null> {
  return withDbOrDefault(null, async (db) => {
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
  });
}

/**
 * Compare two versions
 */
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
  Array.from(v2Map.entries()).forEach(([address, newReg]) => {
    const oldReg = v1Map.get(address);
    if (!oldReg) {
      added.push(newReg);
    } else {
      const changes = detectChanges(oldReg, newReg);
      if (changes.length > 0) {
        modified.push({ address, old: oldReg, new: newReg, changes });
      }
    }
  });

  // Find removed
  Array.from(v1Map.entries()).forEach(([address, oldReg]) => {
    if (!v2Map.has(address)) {
      removed.push(oldReg);
    }
  });

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

/**
 * Check if document with same filename exists
 */
export async function checkDuplicateFilename(
  userId: string,
  filename: string,
  folderId?: string | null
): Promise<{ exists: boolean; documentId?: string }> {
  return withDbOrDefault({ exists: false }, async (db) => {
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
  });
}

/**
 * Detect what fields changed between registers
 */
function detectChanges(old: ModbusRegister, newReg: ModbusRegister): string[] {
  const changes: string[] = [];

  if (old.name !== newReg.name) changes.push('name');
  if (old.datatype !== newReg.datatype) changes.push('datatype');
  if (old.description !== newReg.description) changes.push('description');
  if (old.writable !== newReg.writable) changes.push('writable');

  return changes;
}

/**
 * Map database row to document
 */
function mapToDocument(row: DocumentRow): ModbusDocument {
  return {
    id: row.id,
    filename: row.filename,
    sourceFormat: row.sourceFormat as ModbusSourceFormat,
    registers: row.registers,
    createdAt: row.createdAt,
    userId: row.userId || undefined,
    folderId: row.folderId || undefined,
    versionNumber: row.versionNumber || 1,
    isLatestVersion: row.isLatestVersion ?? true,
    parentDocumentId: row.parentDocumentId || undefined,
  };
}

/**
 * Get the latest version of a document
 */
export async function getLatestVersion(
  documentId: string,
  userId: string
): Promise<ModbusDocument | null> {
  return withDbOrDefault(null, async (db) => {
    // First check if this is the root document or a version
    const [root] = await db
      .select()
      .from(documentsTable)
      .where(and(
        eq(documentsTable.id, documentId),
        eq(documentsTable.userId, userId)
      ))
      .limit(1);

    if (!root) {
      return null;
    }

    // Get the actual root document ID
    const rootId = root.parentDocumentId || root.id;

    // Find the latest version
    const [latest] = await db
      .select()
      .from(documentsTable)
      .where(and(
        eq(documentsTable.userId, userId),
        eq(documentsTable.isLatestVersion, true),
        or(
          eq(documentsTable.id, rootId),
          eq(documentsTable.parentDocumentId, rootId)
        )
      ))
      .limit(1);

    return latest ? mapToDocument(latest) : null;
  });
}
