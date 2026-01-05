import { randomUUID } from "crypto";
import type {
  ModbusDocument,
  ModbusRegister,
  InsertModbusDocument,
  ModbusFileFormat,
} from "@shared/schema";

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

export const storage = new MemStorage();
