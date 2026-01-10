import { randomUUID } from "crypto";
import { eq, desc, asc, count } from "drizzle-orm";
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

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "filename";
  sortOrder?: "asc" | "desc";
}

export interface IStorage {
  createDocument(doc: InsertModbusDocument): Promise<ModbusDocument>;
  getDocument(id: string): Promise<ModbusDocument | undefined>;
  getAllDocuments(options?: PaginationOptions): Promise<ModbusDocument[]>;
  getDocumentCount(): Promise<number>;
  deleteDocument(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private documents: Map<string, ModbusDocument>;

  constructor() {
    this.documents = new Map();
  }

  async createDocument(doc: InsertModbusDocument): Promise<ModbusDocument> {
    const id = randomUUID();
    const document: ModbusDocument = {
      ...doc,
      id,
      createdAt: new Date(),
    };
    this.documents.set(id, document);
    return document;
  }

  async getDocument(id: string): Promise<ModbusDocument | undefined> {
    return this.documents.get(id);
  }

  async getAllDocuments(options: PaginationOptions = {}): Promise<ModbusDocument[]> {
    const {
      limit = 50,
      offset = 0,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = options;

    const docs = Array.from(this.documents.values());

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

  async getDocumentCount(): Promise<number> {
    return this.documents.size;
  }

  async deleteDocument(id: string): Promise<boolean> {
    return this.documents.delete(id);
  }
}

export class PostgresStorage implements IStorage {
  async createDocument(doc: InsertModbusDocument): Promise<ModbusDocument> {
    return withRetry(
      async () => {
        const db = getDb();
        const [inserted] = await db
          .insert(documentsTable)
          .values({
            filename: doc.filename,
            sourceFormat: doc.sourceFormat,
            registers: doc.registers,
          })
          .returning();

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

  async getDocument(id: string): Promise<ModbusDocument | undefined> {
    return withRetry(
      async () => {
        const db = getDb();
        const [doc] = await db
          .select()
          .from(documentsTable)
          .where(eq(documentsTable.id, id));

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

  async getAllDocuments(options: PaginationOptions = {}): Promise<ModbusDocument[]> {
    return withRetry(
      async () => {
        const db = getDb();
        const {
          limit = 50,
          offset = 0,
          sortBy = "createdAt",
          sortOrder = "desc"
        } = options;

        const orderColumn = sortBy === "createdAt" ? documentsTable.createdAt : documentsTable.filename;
        const orderFn = sortOrder === "asc" ? asc : desc;

        const docs = await db
          .select()
          .from(documentsTable)
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

  async getDocumentCount(): Promise<number> {
    return withRetry(
      async () => {
        const db = getDb();
        const result = await db
          .select({ count: count() })
          .from(documentsTable);
        return result[0]?.count ?? 0;
      },
      { maxRetries: 2, initialDelayMs: 500 }
    );
  }

  async deleteDocument(id: string): Promise<boolean> {
    return withRetry(
      async () => {
        const db = getDb();
        const result = await db
          .delete(documentsTable)
          .where(eq(documentsTable.id, id))
          .returning();

        return result.length > 0;
      },
      { maxRetries: 2, initialDelayMs: 500 }
    );
  }
}

// Use in-memory storage for this converter app (documents don't need to persist)
// PostgresStorage is available if persistence is needed in the future
export const storage: IStorage = new MemStorage();
