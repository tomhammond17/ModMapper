import { and, eq, sql } from 'drizzle-orm';
import { getDb, isDatabaseAvailable } from '../db';
import { usageTrackingTable, conversionLogsTable, TIER_LIMITS } from '../../shared/schema';
import { createLogger } from '../logger';

const log = createLogger('usage-service');

export type TierType = 'free' | 'pro';

export interface UsageStats {
  conversionsUsed: number;
  tokensUsed: number;
  month: string;
}

export interface UsageLimitResult {
  allowed: boolean;
  reason?: string;
  usage?: {
    conversions: { used: number; limit: number | null };
    tokens: { used: number; limit: number | null };
  };
}

/**
 * Get current month string in YYYY-MM format
 */
function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Get or create monthly usage record for a user
 */
export async function getMonthlyUsage(userId: string): Promise<UsageStats> {
  if (!isDatabaseAvailable()) {
    log.warn('Database not available, returning zero usage');
    return {
      conversionsUsed: 0,
      tokensUsed: 0,
      month: getCurrentMonth(),
    };
  }

  const month = getCurrentMonth();
  const db = getDb();

  try {
    // Try to get existing record
    let [usage] = await db
      .select()
      .from(usageTrackingTable)
      .where(and(
        eq(usageTrackingTable.userId, userId),
        eq(usageTrackingTable.month, month)
      ))
      .limit(1);

    // Create new record if doesn't exist
    if (!usage) {
      [usage] = await db
        .insert(usageTrackingTable)
        .values({
          userId,
          month,
          conversionsUsed: 0,
          tokensUsed: 0,
        })
        .returning();

      log.info('Created new usage record', { userId, month });
    }

    return {
      conversionsUsed: usage.conversionsUsed,
      tokensUsed: usage.tokensUsed,
      month: usage.month,
    };
  } catch (error) {
    log.error('Failed to get monthly usage', { error, userId });
    throw error;
  }
}

/**
 * Check if user has exceeded their tier limits
 */
export async function checkUsageLimits(
  userId: string,
  tier: TierType,
  sourceFormat: string
): Promise<UsageLimitResult> {
  const limits = TIER_LIMITS[tier];

  try {
    const usage = await getMonthlyUsage(userId);

    // Check conversion limit for non-PDF files
    if (sourceFormat !== 'pdf') {
      if (limits.conversionsPerMonth !== Infinity &&
          usage.conversionsUsed >= limits.conversionsPerMonth) {
        return {
          allowed: false,
          reason: `Free tier limit of ${limits.conversionsPerMonth} conversions/month reached. Upgrade to Pro for unlimited conversions.`,
          usage: {
            conversions: { used: usage.conversionsUsed, limit: limits.conversionsPerMonth },
            tokens: { used: usage.tokensUsed, limit: limits.tokensPerMonth === Infinity ? null : limits.tokensPerMonth },
          },
        };
      }
    }

    // Check token limit for PDF files
    if (sourceFormat === 'pdf') {
      if (limits.tokensPerMonth !== Infinity &&
          usage.tokensUsed >= limits.tokensPerMonth) {
        return {
          allowed: false,
          reason: `Free tier limit of ${limits.tokensPerMonth.toLocaleString()} AI tokens/month reached. Upgrade to Pro for 1M tokens/month.`,
          usage: {
            conversions: { used: usage.conversionsUsed, limit: limits.conversionsPerMonth === Infinity ? null : limits.conversionsPerMonth },
            tokens: { used: usage.tokensUsed, limit: limits.tokensPerMonth },
          },
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    log.error('Failed to check usage limits', { error, userId });
    // Allow on error to prevent blocking users
    return { allowed: true };
  }
}

/**
 * Track a conversion (logs it and increments counters)
 */
export async function trackConversion(
  userId: string,
  sourceFormat: string,
  targetFormat: string,
  tokensUsed: number = 0
): Promise<void> {
  if (!isDatabaseAvailable()) {
    log.warn('Database not available, skipping usage tracking');
    return;
  }

  const db = getDb();

  try {
    // Log individual conversion
    await db.insert(conversionLogsTable).values({
      userId,
      sourceFormat,
      targetFormat,
      tokensUsed: tokensUsed > 0 ? tokensUsed : null,
    });

    // Update monthly aggregates
    const isNonPdfConversion = sourceFormat !== 'pdf';
    const conversionsToAdd = isNonPdfConversion ? 1 : 0;

    if (conversionsToAdd > 0 || tokensUsed > 0) {
      await incrementUsage(userId, conversionsToAdd, tokensUsed);
    }

    log.debug('Tracked conversion', {
      userId,
      sourceFormat,
      targetFormat,
      tokensUsed,
      conversionsAdded: conversionsToAdd,
    });
  } catch (error) {
    log.error('Failed to track conversion', { error, userId });
    // Don't throw - tracking failure shouldn't break the conversion
  }
}

/**
 * Increment usage counters for a user
 */
async function incrementUsage(
  userId: string,
  conversions: number,
  tokens: number
): Promise<void> {
  const month = getCurrentMonth();
  const db = getDb();

  try {
    // First ensure the record exists
    await getMonthlyUsage(userId);

    // Then increment
    await db
      .update(usageTrackingTable)
      .set({
        conversionsUsed: sql`${usageTrackingTable.conversionsUsed} + ${conversions}`,
        tokensUsed: sql`${usageTrackingTable.tokensUsed} + ${tokens}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(usageTrackingTable.userId, userId),
        eq(usageTrackingTable.month, month)
      ));

    log.debug('Incremented usage', { userId, conversions, tokens });
  } catch (error) {
    log.error('Failed to increment usage', { error, userId });
    throw error;
  }
}

/**
 * Get usage stats with tier limits for display
 */
export async function getUsageWithLimits(
  userId: string,
  tier: TierType
): Promise<{
  tier: TierType;
  usage: {
    conversions: { used: number; limit: number | null; unlimited: boolean };
    tokens: { used: number; limit: number | null; unlimited: boolean };
  };
  periodEnd: string;
}> {
  const limits = TIER_LIMITS[tier];
  const usage = await getMonthlyUsage(userId);

  // Calculate period end (first of next month)
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    tier,
    usage: {
      conversions: {
        used: usage.conversionsUsed,
        limit: limits.conversionsPerMonth === Infinity ? null : limits.conversionsPerMonth,
        unlimited: limits.conversionsPerMonth === Infinity,
      },
      tokens: {
        used: usage.tokensUsed,
        limit: limits.tokensPerMonth === Infinity ? null : limits.tokensPerMonth,
        unlimited: limits.tokensPerMonth === Infinity,
      },
    },
    periodEnd: periodEnd.toISOString(),
  };
}

/**
 * Reset monthly usage (for testing or admin)
 */
export async function resetMonthlyUsage(userId: string): Promise<void> {
  if (!isDatabaseAvailable()) {
    return;
  }

  const month = getCurrentMonth();
  const db = getDb();

  try {
    await db
      .update(usageTrackingTable)
      .set({
        conversionsUsed: 0,
        tokensUsed: 0,
        updatedAt: new Date(),
      })
      .where(and(
        eq(usageTrackingTable.userId, userId),
        eq(usageTrackingTable.month, month)
      ));

    log.info('Reset monthly usage', { userId, month });
  } catch (error) {
    log.error('Failed to reset usage', { error, userId });
    throw error;
  }
}
