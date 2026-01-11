import { randomUUID } from "crypto";
import { eq, desc, asc, count, and, isNull } from "drizzle-orm";
import type {
  ModbusDocument,
  ModbusRegister,
  InsertModbusDocument,
  ModbusFileFormat,
  ModbusSourceFormat,
} from "@shared/schema";
import { documentsTable } from "@shared/schema";
import { getDb, isDatabaseAvailable } from "./db";
import { withRetry } from "./utils/retry";
import { createLogger } from "./logger";

const log = createLogger("storage");

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "filename";
  sortOrder?: "asc" | "desc";
}

export interface DocumentFilter {
  userId?: string;
  folderId?: string | null; // null = root level, undefined = all
}

export interface IStorage {
  createDocument(doc: InsertModbusDocument, userId?: string, folderId?: string): Promise<ModbusDocument>;
  getDocument(id: string, userId?: string): Promise<ModbusDocument | undefined>;
  getAllDocuments(filter?: DocumentFilter, options?: PaginationOptions): Promise<ModbusDocument[]>;
  getDocumentCount(filter?: DocumentFilter): Promise<number>;
  deleteDocument(id: string, userId?: string): Promise<boolean>;
  moveDocument?(documentId: string, userId: string, folderId: string | null): Promise<void>;
}

export class MemStorage implements IStorage {
  private documents: Map<string, ModbusDocument>;

  constructor() {
    this.documents = new Map();
  }

  async createDocument(doc: InsertModbusDocument, userId?: string, folderId?: string): Promise<ModbusDocument> {
    const id = randomUUID();
    const document: ModbusDocument = {
      id,
      filename: doc.filename,
      sourceFormat: doc.sourceFormat,
      registers: doc.registers,
      createdAt: new Date(),
      userId,
      folderId,
    };
    this.documents.set(id, document);
    return document;
  }

  async getDocument(id: string, userId?: string): Promise<ModbusDocument | undefined> {
    const doc = this.documents.get(id);
    if (!doc) return undefined;
    // If userId provided, check ownership
    if (userId && doc.userId && doc.userId !== userId) {
      return undefined;
    }
    return doc;
  }

  async getAllDocuments(filter: DocumentFilter = {}, options: PaginationOptions = {}): Promise<ModbusDocument[]> {
    const {
      limit = 50,
      offset = 0,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = options;

    let docs = Array.from(this.documents.values());

    // Filter by userId
    if (filter.userId) {
      docs = docs.filter(d => d.userId === filter.userId);
    }

    // Filter by folderId
    if (filter.folderId !== undefined) {
      if (filter.folderId === null) {
        // Root level documents
        docs = docs.filter(d => !d.folderId);
      } else {
        docs = docs.filter(d => d.folderId === filter.folderId);
      }
    }

    // Sort
    docs.sort((a, b) => {
      const aVal = sortBy === "createdAt" ? a.createdAt.getTime() : a.filename;
      const bVal = sortBy === "createdAt" ? b.createdAt.getTime() : b.filename;
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === "asc" ? comparison : -comparison;
    });

    // Paginate
    return docs.slice(offset, offset + limit);
  }

  async getDocumentCount(filter: DocumentFilter = {}): Promise<number> {
    let docs = Array.from(this.documents.values());

    if (filter.userId) {
      docs = docs.filter(d => d.userId === filter.userId);
    }

    if (filter.folderId !== undefined) {
      if (filter.folderId === null) {
        docs = docs.filter(d => !d.folderId);
      } else {
        docs = docs.filter(d => d.folderId === filter.folderId);
      }
    }

    return docs.length;
  }

  async deleteDocument(id: string, userId?: string): Promise<boolean> {
    const doc = this.documents.get(id);
    if (!doc) return false;
    if (userId && doc.userId && doc.userId !== userId) {
      return false;
    }
    return this.documents.delete(id);
  }

  async moveDocument(documentId: string, userId: string, folderId: string | null): Promise<void> {
    const doc = this.documents.get(documentId);
    if (!doc) throw new Error('Document not found');
    if (doc.userId !== userId) throw new Error('Access denied');
    // Convert null to undefined for compatibility with ModbusDocument interface
    doc.folderId = folderId || undefined;
  }
}

export class PostgresStorage implements IStorage {
  async createDocument(doc: InsertModbusDocument, userId?: string, folderId?: string): Promise<ModbusDocument> {
    return withRetry(
      async () => {
        const db = getDb();
        const [inserted] = await db
          .insert(documentsTable)
          .values({
            filename: doc.filename,
            sourceFormat: doc.sourceFormat,
            registers: doc.registers,
            userId: userId || null,
            folderId: folderId || null,
          })
          .returning();

        log.debug('Created document', { id: inserted.id, filename: doc.filename, userId, folderId });

        return {
          id: inserted.id,
          filename: inserted.filename,
          sourceFormat: inserted.sourceFormat as ModbusSourceFormat,
          registers: inserted.registers,
          createdAt: inserted.createdAt,
        };
      },
      {
        maxRetries: 2,
        initialDelayMs: 500,
        retryableErrors: (error) => {
          if (error instanceof Error) {
            const message = error.message.toLowerCase();
            return message.includes('connection') ||
                   message.includes('timeout') ||
                   message.includes('econnrefused');
          }
          return false;
        },
      }
    );
  }

  async getDocument(id: string, userId?: string): Promise<ModbusDocument | undefined> {
    return withRetry(
      async () => {
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

        if (!doc) return undefined;

        return {
          id: doc.id,
          filename: doc.filename,
          sourceFormat: doc.sourceFormat as ModbusSourceFormat,
          registers: doc.registers,
          createdAt: doc.createdAt,
        };
      },
      { maxRetries: 2, initialDelayMs: 500 }
    );
  }

  async getAllDocuments(filter: DocumentFilter = {}, options: PaginationOptions = {}): Promise<ModbusDocument[]> {
    return withRetry(
      async () => {
        const db = getDb();
        const {
          limit = 50,
          offset = 0,
          sortBy = "createdAt",
          sortOrder = "desc"
        } = options;

        const conditions = [];

        if (filter.userId) {
          conditions.push(eq(documentsTable.userId, filter.userId));
        }

        if (filter.folderId !== undefined) {
          if (filter.folderId === null) {
            // Root level documents (no folder)
            conditions.push(isNull(documentsTable.folderId));
          } else {
            conditions.push(eq(documentsTable.folderId, filter.folderId));
          }
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const orderColumn = sortBy === "createdAt" ? documentsTable.createdAt : documentsTable.filename;
        const orderFn = sortOrder === "asc" ? asc : desc;

        const docs = await db
          .select()
          .from(documentsTable)
          .where(where)
          .orderBy(orderFn(orderColumn))
          .limit(limit)
          .offset(offset);

        return docs.map((doc) => ({
          id: doc.id,
          filename: doc.filename,
          sourceFormat: doc.sourceFormat as ModbusSourceFormat,
          registers: doc.registers,
          createdAt: doc.createdAt,
        }));
      },
      { maxRetries: 2, initialDelayMs: 500 }
    );
  }

  async getDocumentCount(filter: DocumentFilter = {}): Promise<number> {
    return withRetry(
      async () => {
        const db = getDb();

        const conditions = [];

        if (filter.userId) {
          conditions.push(eq(documentsTable.userId, filter.userId));
        }

        if (filter.folderId !== undefined) {
          if (filter.folderId === null) {
            conditions.push(isNull(documentsTable.folderId));
          } else {
            conditions.push(eq(documentsTable.folderId, filter.folderId));
          }
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const result = await db
          .select({ count: count() })
          .from(documentsTable)
          .where(where);

        return result[0]?.count ?? 0;
      },
      { maxRetries: 2, initialDelayMs: 500 }
    );
  }

  async deleteDocument(id: string, userId?: string): Promise<boolean> {
    return withRetry(
      async () => {
        const db = getDb();

        const conditions = [eq(documentsTable.id, id)];
        if (userId) {
          conditions.push(eq(documentsTable.userId, userId));
        }

        const result = await db
          .delete(documentsTable)
          .where(and(...conditions))
          .returning();

        if (result.length > 0) {
          log.debug('Deleted document', { id, userId });
        }

        return result.length > 0;
      },
      { maxRetries: 2, initialDelayMs: 500 }
    );
  }

  async moveDocument(documentId: string, userId: string, folderId: string | null): Promise<void> {
    return withRetry(
      async () => {
        const db = getDb();

        const result = await db
          .update(documentsTable)
          .set({ folderId })
          .where(and(
            eq(documentsTable.id, documentId),
            eq(documentsTable.userId, userId)
          ))
          .returning();

        if (result.length === 0) {
          throw new Error('Document not found or access denied');
        }

        log.debug('Moved document', { documentId, userId, folderId });
      },
      { maxRetries: 2, initialDelayMs: 500 }
    );
  }
}

// Use in-memory storage for this converter app (documents don't need to persist)
// PostgresStorage is available if persistence is needed in the future
export const storage: IStorage = new MemStorage();

/**
 * Temporary file storage for PDF uploads.
 * Files are stored in memory with a TTL for automatic cleanup.
 */
export interface TempFile {
  id: string;
  buffer: Buffer;
  filename: string;
  pageRanges?: string;
  existingRegisters?: ModbusRegister[];
  createdAt: number;
}

class TempFileStorage {
  private files: Map<string, TempFile> = new Map();
  private readonly TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor() {
    // Cleanup expired files every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  store(buffer: Buffer, filename: string, pageRanges?: string, existingRegisters?: ModbusRegister[]): string {
    const id = randomUUID();
    this.files.set(id, {
      id,
      buffer,
      filename,
      pageRanges,
      existingRegisters,
      createdAt: Date.now(),
    });
    log.debug("Stored temp file", { id, filename, size: buffer.length });
    return id;
  }

  get(id: string): TempFile | undefined {
    const file = this.files.get(id);
    if (!file) return undefined;
    
    // Check if expired
    if (Date.now() - file.createdAt > this.TTL_MS) {
      this.files.delete(id);
      return undefined;
    }
    
    return file;
  }

  delete(id: string): boolean {
    return this.files.delete(id);
  }

  private cleanup() {
    const now = Date.now();
    let cleaned = 0;
    const entries = Array.from(this.files.entries());
    for (const [id, file] of entries) {
      if (now - file.createdAt > this.TTL_MS) {
        this.files.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      log.debug("Cleaned up expired temp files", { count: cleaned });
    }
  }
}

export const tempFileStorage = new TempFileStorage();
