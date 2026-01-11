import { eq } from 'drizzle-orm';
import { subscriptionsTable } from '../../shared/schema';
import { createLogger } from '../logger';
import { requireDb, withDbOrDefault, withErrorLogging } from '../utils/service-helpers';

const log = createLogger('subscription-service');

export type SubscriptionTier = 'free' | 'pro';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get user's current subscription
 */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  return withDbOrDefault(null, async (db) => {
    const [subscription] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId))
      .limit(1);

    return subscription ? mapToSubscription(subscription) : null;
  });
}

/**
 * Get subscription by Stripe customer ID
 */
export async function getSubscriptionByStripeCustomer(
  stripeCustomerId: string
): Promise<Subscription | null> {
  return withDbOrDefault(null, async (db) => {
    const [subscription] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.stripeCustomerId, stripeCustomerId))
      .limit(1);

    return subscription ? mapToSubscription(subscription) : null;
  });
}

/**
 * Update Stripe customer ID for a subscription
 */
export async function updateStripeCustomerId(
  userId: string,
  stripeCustomerId: string
): Promise<void> {
  return withDbOrDefault(undefined, async (db) => {
    await db
      .update(subscriptionsTable)
      .set({
        stripeCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));

    log.info('Updated Stripe customer ID', { userId, stripeCustomerId });
  });
}

/**
 * Upgrade user to Pro tier
 */
export async function upgradeSubscription(
  userId: string,
  stripeSubscriptionId: string,
  stripeCustomerId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date
): Promise<void> {
  return withDbOrDefault(undefined, async (db) => {
    await db
      .update(subscriptionsTable)
      .set({
        tier: 'pro',
        status: 'active',
        stripeSubscriptionId,
        stripeCustomerId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));

    log.info('Upgraded subscription to Pro', { userId, stripeSubscriptionId });
  });
}

/**
 * Schedule downgrade to Free at end of billing period
 */
export async function scheduleDowngrade(userId: string): Promise<void> {
  return withDbOrDefault(undefined, async (db) => {
    await db
      .update(subscriptionsTable)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));

    log.info('Scheduled subscription downgrade', { userId });
  });
}

/**
 * Immediately downgrade to Free tier
 */
export async function immediateDowngrade(userId: string): Promise<void> {
  return withDbOrDefault(undefined, async (db) => {
    await db
      .update(subscriptionsTable)
      .set({
        tier: 'free',
        status: 'canceled',
        stripeSubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));

    log.info('Immediately downgraded subscription to Free', { userId });
  });
}

/**
 * Update subscription status
 */
export async function updateSubscriptionStatus(
  userId: string,
  status: SubscriptionStatus
): Promise<void> {
  return withDbOrDefault(undefined, async (db) => {
    await db
      .update(subscriptionsTable)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));

    log.info('Updated subscription status', { userId, status });
  });
}

/**
 * Update subscription period dates
 */
export async function updateSubscriptionPeriod(
  userId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date
): Promise<void> {
  return withDbOrDefault(undefined, async (db) => {
    await db
      .update(subscriptionsTable)
      .set({
        currentPeriodStart,
        currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));

    log.info('Updated subscription period', { userId, currentPeriodStart, currentPeriodEnd });
  });
}

/**
 * Update subscription by Stripe customer ID (for webhook handlers)
 */
export async function updateSubscriptionByStripeCustomer(
  stripeCustomerId: string,
  updates: {
    tier?: SubscriptionTier;
    status?: SubscriptionStatus;
    stripeSubscriptionId?: string | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
  }
): Promise<void> {
  return withDbOrDefault(undefined, async (db) => {
    await db
      .update(subscriptionsTable)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.stripeCustomerId, stripeCustomerId));

    log.info('Updated subscription by Stripe customer', { stripeCustomerId, updates });
  });
}

/**
 * Map database row to Subscription
 */
function mapToSubscription(row: {
  id: string;
  userId: string;
  tier: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Subscription {
  return {
    id: row.id,
    userId: row.userId,
    tier: row.tier as SubscriptionTier,
    status: row.status as SubscriptionStatus,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
