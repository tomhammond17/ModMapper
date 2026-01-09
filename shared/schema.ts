import { z } from "zod";
import { pgTable, uuid, text, timestamp, jsonb, index, boolean, integer } from "drizzle-orm/pg-core";

export const modbusDataTypes = [
  "INT16",
  "UINT16",
  "INT32",
  "UINT32",
  "FLOAT32",
  "FLOAT64",
  "STRING",
  "BOOL",
  "COIL",
] as const;

export type ModbusDataType = (typeof modbusDataTypes)[number];

export const modbusRegisterSchema = z.object({
  address: z.number().int().positive(),
  name: z.string().min(1),
  datatype: z.enum(modbusDataTypes),
  description: z.string(),
  writable: z.boolean(),
});

export type ModbusRegister = z.infer<typeof modbusRegisterSchema>;

export const modbusFileFormats = ["csv", "xml", "json"] as const;
export const modbusSourceFormats = ["csv", "xml", "json", "pdf"] as const;
export type ModbusFileFormat = (typeof modbusFileFormats)[number];
export type ModbusSourceFormat = (typeof modbusSourceFormats)[number];

export const insertModbusDocumentSchema = z.object({
  filename: z.string().min(1),
  sourceFormat: z.enum(modbusSourceFormats),
  registers: z.array(modbusRegisterSchema),
});

export type InsertModbusDocument = z.infer<typeof insertModbusDocumentSchema>;

export interface ModbusDocument {
  id: string;
  filename: string;
  sourceFormat: ModbusSourceFormat;
  registers: ModbusRegister[];
  createdAt: Date;
  userId?: string;
  folderId?: string;
  versionNumber?: number;
  isLatestVersion?: boolean;
  parentDocumentId?: string;
}

// ============================================================================
// Authentication & User Management Tables
// ============================================================================

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
}));

export const magicLinksTable = pgTable("magic_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index("magic_links_token_idx").on(table.token),
  userIdIdx: index("magic_links_user_id_idx").on(table.userId),
}));

export const sessionsTable = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
}, (table) => ({
  expireIdx: index("sessions_expire_idx").on(table.expire),
}));

// ============================================================================
// Subscription & Billing Tables
// ============================================================================

export const subscriptionTiers = ["free", "pro"] as const;
export type SubscriptionTier = (typeof subscriptionTiers)[number];

export const subscriptionStatuses = ["active", "canceled", "past_due", "trialing"] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export const subscriptionsTable = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  tier: text("tier").notNull().default("free"),
  status: text("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("subscriptions_user_id_idx").on(table.userId),
  tierIdx: index("subscriptions_tier_idx").on(table.tier),
  stripeCustomerIdx: index("subscriptions_stripe_customer_idx").on(table.stripeCustomerId),
}));

// ============================================================================
// Usage Tracking Tables
// ============================================================================

export const usageTrackingTable = pgTable("usage_tracking", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // Format: YYYY-MM
  conversionsUsed: integer("conversions_used").notNull().default(0),
  tokensUsed: integer("tokens_used").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userMonthIdx: index("usage_tracking_user_month_idx").on(table.userId, table.month),
}));

export const conversionLogsTable = pgTable("conversion_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sourceFormat: text("source_format").notNull(),
  targetFormat: text("target_format"),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("conversion_logs_user_id_idx").on(table.userId),
  createdAtIdx: index("conversion_logs_created_at_idx").on(table.createdAt),
}));

// ============================================================================
// Document Storage Tables (Pro Features)
// ============================================================================

export const foldersTable = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: uuid("parent_id").references((): any => foldersTable.id, { onDelete: "cascade" }),
  path: text("path").notNull(), // Materialized path for fast tree queries
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("folders_user_id_idx").on(table.userId),
  parentIdIdx: index("folders_parent_id_idx").on(table.parentId),
  pathIdx: index("folders_path_idx").on(table.path),
}));

export const exportTemplatesTable = pgTable("export_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  format: text("format").notNull(), // csv, json, xml
  config: jsonb("config").notNull().$type<TemplateConfig>(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("export_templates_user_id_idx").on(table.userId),
  formatIdx: index("export_templates_format_idx").on(table.format),
}));

// ============================================================================
// Drizzle ORM table definition for PostgreSQL persistence
// ============================================================================
export const documentsTable = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => foldersTable.id, { onDelete: "set null" }),
  filename: text("filename").notNull(),
  sourceFormat: text("source_format").notNull(),
  registers: jsonb("registers").notNull().$type<ModbusRegister[]>(),
  versionNumber: integer("version_number").notNull().default(1),
  isLatestVersion: boolean("is_latest_version").notNull().default(true),
  parentDocumentId: uuid("parent_document_id").references((): any => documentsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("documents_user_id_idx").on(table.userId),
  folderIdIdx: index("documents_folder_id_idx").on(table.folderId),
  filenameIdx: index("documents_filename_idx").on(table.filename),
  createdAtIdx: index("documents_created_at_idx").on(table.createdAt),
  sourceFormatIdx: index("documents_source_format_idx").on(table.sourceFormat),
  isLatestVersionIdx: index("documents_is_latest_version_idx").on(table.isLatestVersion),
  parentDocumentIdIdx: index("documents_parent_document_id_idx").on(table.parentDocumentId),
  userFolderIdx: index("documents_user_folder_idx").on(table.userId, table.folderId),
}));

export interface ExtractionMetadata {
  totalPages: number;
  pagesAnalyzed: number;
  registersFound: number;
  confidenceLevel: "high" | "medium" | "low";
  highRelevancePages: number;
  processingTimeMs: number;
  batchSummary?: string;
  processingErrors?: Array<{ batch: number; pages: string; error: string }>;
  partialExtraction?: boolean;
}

export interface ConversionResult {
  success: boolean;
  message: string;
  registers: ModbusRegister[];
  sourceFormat: ModbusSourceFormat;
  filename: string;
  extractionMetadata?: ExtractionMetadata;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ConversionRequest {
  registers: ModbusRegister[];
  targetFormat: ModbusFileFormat;
  filename: string;
}

// ============================================================================
// TypeScript Interfaces for Premium Features
// ============================================================================

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MagicLink {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageTracking {
  id: string;
  userId: string;
  month: string;
  conversionsUsed: number;
  tokensUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversionLog {
  id: string;
  userId: string;
  sourceFormat: string;
  targetFormat?: string | null;
  tokensUsed?: number | null;
  createdAt: Date;
}

export interface Folder {
  id: string;
  userId: string;
  name: string;
  parentId?: string | null;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateConfig {
  // Field mapping: old name → new name
  fieldMapping?: {
    address?: string;
    name?: string;
    datatype?: string;
    description?: string;
    writable?: string;
  };

  // Field visibility
  showFields?: string[];

  // Field ordering (for CSV)
  fieldOrder?: string[];

  // Format-specific settings
  csv?: {
    delimiter?: ',' | ';' | '\t';
    includeHeader?: boolean;
    customHeaders?: string[];
  };

  json?: {
    rootKey?: string;
    nested?: boolean;
    prettyPrint?: boolean;
  };

  xml?: {
    rootElement?: string;
    itemElement?: string;
    useAttributes?: boolean;
  };
}

export interface ExportTemplate {
  id: string;
  userId: string;
  name: string;
  format: string;
  config: TemplateConfig;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Usage Limits by Tier
// ============================================================================

export const TIER_LIMITS = {
  free: {
    conversionsPerMonth: 10,
    tokensPerMonth: 200000,
    canSaveDocuments: false,
    canCreateFolders: false,
    canUseTemplates: false,
    canVersionControl: false,
  },
  pro: {
    conversionsPerMonth: Infinity,
    tokensPerMonth: 1000000,
    canSaveDocuments: true,
    canCreateFolders: true,
    canUseTemplates: true,
    canVersionControl: true,
  },
} as const;
