import bcrypt from "bcrypt";
import crypto from "crypto";
import { eq, and, gt, lt } from "drizzle-orm";
import { getDb } from "../db";
import { usersTable, magicLinksTable, subscriptionsTable } from "@shared/schema";
import type { User } from "@shared/schema";
import { createLogger } from "../logger";

const log = createLogger("auth");

const BCRYPT_ROUNDS = 10;
const MAGIC_LINK_EXPIRY_MINUTES = 15;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a new user account
 */
export async function createUser(email: string, password: string): Promise<User> {
  const db = getDb();

  // Check if user already exists
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    throw new Error("User with this email already exists");
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      emailVerified: false,
    })
    .returning();

  // Create free tier subscription
  await db.insert(subscriptionsTable).values({
    userId: user.id,
    tier: "free",
    status: "active",
  });

  log.info("User created", { userId: user.id, email });

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Authenticate user with email and password
 */
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const db = getDb();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  if (!user) {
    log.warn("Authentication failed: user not found", { email });
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    log.warn("Authentication failed: invalid password", { email });
    return null;
  }

  log.info("User authenticated", { userId: user.id, email });

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Find user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const db = getDb();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Find user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const db = getDb();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Generate a magic link token for passwordless login
 */
export async function createMagicLink(userId: string): Promise<string> {
  const db = getDb();

  // Generate secure random token
  const token = crypto.randomBytes(32).toString("hex");

  // Calculate expiry time
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + MAGIC_LINK_EXPIRY_MINUTES);

  // Store token
  await db.insert(magicLinksTable).values({
    userId,
    token,
    expiresAt,
  });

  log.info("Magic link created", { userId, expiresAt });

  return token;
}

/**
 * Verify and consume a magic link token
 */
export async function verifyMagicLink(token: string): Promise<User | null> {
  const db = getDb();

  // Find valid magic link
  const [magicLink] = await db
    .select()
    .from(magicLinksTable)
    .where(and(eq(magicLinksTable.token, token), gt(magicLinksTable.expiresAt, new Date())))
    .limit(1);

  if (!magicLink) {
    log.warn("Magic link verification failed: invalid or expired token");
    return null;
  }

  // Get user
  const user = await getUserById(magicLink.userId);

  if (!user) {
    log.error("Magic link user not found", { userId: magicLink.userId });
    return null;
  }

  // Delete used magic link
  await db.delete(magicLinksTable).where(eq(magicLinksTable.id, magicLink.id));

  log.info("Magic link verified and consumed", { userId: user.id });

  return user;
}

/**
 * Mark user's email as verified
 */
export async function verifyUserEmail(userId: string): Promise<void> {
  const db = getDb();

  await db
    .update(usersTable)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  log.info("Email verified", { userId });
}

/**
 * Clean up expired magic links (should be run periodically)
 */
export async function cleanupExpiredMagicLinks(): Promise<number> {
  const db = getDb();

  const result = await db.delete(magicLinksTable).where(lt(magicLinksTable.expiresAt, new Date()));

  const count = result.rowCount || 0;
  if (count > 0) {
    log.info("Cleaned up expired magic links", { count });
  }

  return count;
}
