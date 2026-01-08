import { randomUUID } from "crypto";
import { eq, desc } from "drizzle-orm";
import type {
  ModbusDocument,
  ModbusRegister,
  InsertModbusDocument,
  ModbusFileFormat,
  ModbusSourceFormat,
} from "@shared/schema";
import { documentsTable } from "@shared/schema";
import { getDb, isDatabaseAvailable } from "./db";

export interface IStorage {
  createDocument(doc: InsertModbusDocument): Promise<ModbusDocument>;
  getDocument(id: string): Promise<ModbusDocument | undefined>;
  getAllDocuments(): Promise<ModbusDocument[]>;
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

  async getAllDocuments(): Promise<ModbusDocument[]> {
    return Array.from(this.documents.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async deleteDocument(id: string): Promise<boolean> {
    return this.documents.delete(id);
  }
}

export class PostgresStorage implements IStorage {
  async createDocument(doc: InsertModbusDocument): Promise<ModbusDocument> {
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
  }

  async getDocument(id: string): Promise<ModbusDocument | undefined> {
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
  }

  async getAllDocuments(): Promise<ModbusDocument[]> {
    const db = getDb();
    const docs = await db
      .select()
      .from(documentsTable)
      .orderBy(desc(documentsTable.createdAt));

    return docs.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      sourceFormat: doc.sourceFormat as ModbusSourceFormat,
      registers: doc.registers,
      createdAt: doc.createdAt,
    }));
  }

  async deleteDocument(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(documentsTable)
      .where(eq(documentsTable.id, id))
      .returning();

    return result.length > 0;
  }
}

// Use in-memory storage for this converter app (documents don't need to persist)
// PostgresStorage is available if persistence is needed in the future
export const storage: IStorage = new MemStorage();
