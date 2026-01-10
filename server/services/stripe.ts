import Stripe from 'stripe';
import { createLogger } from '../logger';

const log = createLogger('stripe-service');

// Lazy initialization - only create client when needed and key is available
let stripeClient: Stripe | null = null;

function getStripe(): Stripe | null {
  if (stripeClient) return stripeClient;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    log.warn('STRIPE_SECRET_KEY not configured - Stripe features disabled');
    return null;
  }

  stripeClient = new Stripe(key);

  return stripeClient;
}

/**
 * Check if Stripe is configured and available
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Get or create a Stripe customer for a user
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  existingCustomerId?: string | null
): Promise<string | null> {
  const stripe = getStripe();

  if (!stripe) {
    log.info('[MOCK] Would create Stripe customer for user:', { userId, email });
    return `mock_cus_${userId.slice(0, 8)}`;
  }

  // If customer already exists, verify and return
  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      if (!customer.deleted) {
        return existingCustomerId;
      }
    } catch (error) {
      log.warn('Failed to retrieve existing Stripe customer', { customerId: existingCustomerId, error });
    }
  }

  // Create new customer
  try {
    const customer = await stripe.customers.create({
      email,
      metadata: {
        userId,
      },
    });

    log.info('Created Stripe customer', { customerId: customer.id, userId });
    return customer.id;
  } catch (error) {
    log.error('Failed to create Stripe customer', { error, userId });
    throw error;
  }
}

/**
 * Create a Stripe Checkout Session for Pro subscription
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  customerId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string | null> {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRO_PRICE_ID;

  if (!stripe) {
    log.info('[MOCK] Would create checkout session', { userId, email });
    return 'https://example.com/mock-checkout';
  }

  if (!priceId) {
    log.error('STRIPE_PRO_PRICE_ID not configured');
    throw new Error('Stripe price not configured');
  }

  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
      },
      subscription_data: {
        metadata: {
          userId,
        },
      },
    });

    log.info('Created checkout session', { sessionId: session.id, userId });
    return session.url;
  } catch (error) {
    log.error('Failed to create checkout session', { error, userId });
    throw error;
  }
}

/**
 * Create a Stripe Customer Portal session for subscription management
 */
export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string | null> {
  const stripe = getStripe();

  if (!stripe) {
    log.info('[MOCK] Would create portal session', { customerId });
    return 'https://example.com/mock-portal';
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    log.info('Created portal session', { customerId });
    return session.url;
  } catch (error) {
    log.error('Failed to create portal session', { error, customerId });
    throw error;
  }
}

/**
 * Verify Stripe webhook signature and parse event
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event | null {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    log.warn('Stripe webhook verification not configured');
    return null;
  }

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    return event;
  } catch (error) {
    log.error('Webhook signature verification failed', { error });
    throw error;
  }
}

/**
 * Cancel a Stripe subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  immediately: boolean = false
): Promise<void> {
  const stripe = getStripe();

  if (!stripe) {
    log.info('[MOCK] Would cancel subscription', { subscriptionId, immediately });
    return;
  }

  try {
    if (immediately) {
      await stripe.subscriptions.cancel(subscriptionId);
      log.info('Cancelled subscription immediately', { subscriptionId });
    } else {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      log.info('Scheduled subscription cancellation at period end', { subscriptionId });
    }
  } catch (error) {
    log.error('Failed to cancel subscription', { error, subscriptionId });
    throw error;
  }
}

/**
 * Retrieve subscription details from Stripe
 */
export async function getSubscriptionDetails(
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();

  if (!stripe) {
    return null;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    log.error('Failed to retrieve subscription', { error, subscriptionId });
    return null;
  }
}
