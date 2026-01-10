import { eq } from 'drizzle-orm';
import { getDb, isDatabaseAvailable } from '../db';
import { subscriptionsTable } from '../../shared/schema';
import { createLogger } from '../logger';

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
  if (!isDatabaseAvailable()) {
    log.warn('Database not available, returning mock subscription');
    return null;
  }

  try {
    const db = getDb();
    const [subscription] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId))
      .limit(1);

    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      userId: subscription.userId,
      tier: subscription.tier as SubscriptionTier,
      status: subscription.status as SubscriptionStatus,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  } catch (error) {
    log.error('Failed to get subscription', { error, userId });
    throw error;
  }
}

/**
 * Get subscription by Stripe customer ID
 */
export async function getSubscriptionByStripeCustomer(
  stripeCustomerId: string
): Promise<Subscription | null> {
  if (!isDatabaseAvailable()) {
    return null;
  }

  try {
    const db = getDb();
    const [subscription] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.stripeCustomerId, stripeCustomerId))
      .limit(1);

    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      userId: subscription.userId,
      tier: subscription.tier as SubscriptionTier,
      status: subscription.status as SubscriptionStatus,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  } catch (error) {
    log.error('Failed to get subscription by Stripe customer', { error, stripeCustomerId });
    throw error;
  }
}

/**
 * Update Stripe customer ID for a subscription
 */
export async function updateStripeCustomerId(
  userId: string,
  stripeCustomerId: string
): Promise<void> {
  if (!isDatabaseAvailable()) {
    log.warn('Database not available, skipping Stripe customer update');
    return;
  }

  try {
    const db = getDb();
    await db
      .update(subscriptionsTable)
      .set({
        stripeCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));

    log.info('Updated Stripe customer ID', { userId, stripeCustomerId });
  } catch (error) {
    log.error('Failed to update Stripe customer ID', { error, userId });
    throw error;
  }
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
  if (!isDatabaseAvailable()) {
    log.warn('Database not available, skipping subscription upgrade');
    return;
  }

  try {
    const db = getDb();
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
  } catch (error) {
    log.error('Failed to upgrade subscription', { error, userId });
    throw error;
  }
}

/**
 * Schedule downgrade to Free at end of billing period
 */
export async function scheduleDowngrade(userId: string): Promise<void> {
  if (!isDatabaseAvailable()) {
    log.warn('Database not available, skipping downgrade schedule');
    return;
  }

  try {
    const db = getDb();
    await db
      .update(subscriptionsTable)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));

    log.info('Scheduled subscription downgrade', { userId });
  } catch (error) {
    log.error('Failed to schedule downgrade', { error, userId });
    throw error;
  }
}

/**
 * Immediately downgrade to Free tier
 */
export async function immediateDowngrade(userId: string): Promise<void> {
  if (!isDatabaseAvailable()) {
    log.warn('Database not available, skipping immediate downgrade');
    return;
  }

  try {
    const db = getDb();
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
  } catch (error) {
    log.error('Failed to downgrade subscription', { error, userId });
    throw error;
  }
}

/**
 * Update subscription status
 */
export async function updateSubscriptionStatus(
  userId: string,
  status: SubscriptionStatus
): Promise<void> {
  if (!isDatabaseAvailable()) {
    log.warn('Database not available, skipping status update');
    return;
  }

  try {
    const db = getDb();
    await db
      .update(subscriptionsTable)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));

    log.info('Updated subscription status', { userId, status });
  } catch (error) {
    log.error('Failed to update subscription status', { error, userId });
    throw error;
  }
}

/**
 * Update subscription period dates
 */
export async function updateSubscriptionPeriod(
  userId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date
): Promise<void> {
  if (!isDatabaseAvailable()) {
    log.warn('Database not available, skipping period update');
    return;
  }

  try {
    const db = getDb();
    await db
      .update(subscriptionsTable)
      .set({
        currentPeriodStart,
        currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));

    log.info('Updated subscription period', { userId, currentPeriodStart, currentPeriodEnd });
  } catch (error) {
    log.error('Failed to update subscription period', { error, userId });
    throw error;
  }
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
  if (!isDatabaseAvailable()) {
    log.warn('Database not available, skipping subscription update');
    return;
  }

  try {
    const db = getDb();
    await db
      .update(subscriptionsTable)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.stripeCustomerId, stripeCustomerId));

    log.info('Updated subscription by Stripe customer', { stripeCustomerId, updates });
  } catch (error) {
    log.error('Failed to update subscription by Stripe customer', { error, stripeCustomerId });
    throw error;
  }
}
