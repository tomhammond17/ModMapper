import type { Express, Request, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import {
  isStripeConfigured,
  getOrCreateStripeCustomer,
  createCheckoutSession,
  createPortalSession,
  verifyWebhookSignature,
} from "../services/stripe";
import {
  getSubscription,
  getSubscriptionByStripeCustomer,
  updateStripeCustomerId,
  upgradeSubscription,
  immediateDowngrade,
  updateSubscriptionStatus,
  updateSubscriptionPeriod,
  updateSubscriptionByStripeCustomer,
} from "../services/subscription";
import { requireAuth, loadSubscription, requirePro } from "../middleware/auth";
import { createLogger } from "../logger";

const log = createLogger("billing-routes");

// Rate limiter for checkout
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 checkout attempts per 15 minutes
  message: {
    success: false,
    error: "TOO_MANY_REQUESTS",
    message: "Too many checkout attempts. Please try again later.",
  },
});

// Validation schemas
const checkoutSchema = z.object({
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/**
 * Register billing routes
 */
export function registerBillingRoutes(
  app: Express,
  config: {
    appUrl: string;
  }
): void {
  /**
   * POST /api/v1/billing/checkout
   * Create a Stripe checkout session for Pro subscription
   */
  app.post(
    "/api/v1/billing/checkout",
    requireAuth,
    loadSubscription,
    checkoutLimiter,
    async (req: Request, res: Response) => {
      try {
        // Verify user is on Free tier
        if (req.subscription?.tier === "pro") {
          res.status(400).json({
            success: false,
            error: "ALREADY_PRO",
            message: "You already have a Pro subscription",
          });
          return;
        }

        const { successUrl, cancelUrl } = checkoutSchema.parse(req.body);

        // Get or create Stripe customer
        const customerId = await getOrCreateStripeCustomer(
          req.user!.id,
          req.user!.email,
          req.subscription?.stripeCustomerId
        );

        if (!customerId) {
          res.status(500).json({
            success: false,
            error: "STRIPE_ERROR",
            message: "Failed to create customer",
          });
          return;
        }

        // Update customer ID in database if new
        if (!req.subscription?.stripeCustomerId) {
          await updateStripeCustomerId(req.user!.id, customerId);
        }

        // Create checkout session
        const checkoutUrl = await createCheckoutSession(
          req.user!.id,
          req.user!.email,
          customerId,
          successUrl || `${config.appUrl}/?checkout=success`,
          cancelUrl || `${config.appUrl}/pricing?checkout=canceled`
        );

        if (!checkoutUrl) {
          res.status(500).json({
            success: false,
            error: "STRIPE_ERROR",
            message: "Failed to create checkout session",
          });
          return;
        }

        log.info("Created checkout session", { userId: req.user!.id });

        res.json({
          success: true,
          checkoutUrl,
        });
      } catch (error) {
        log.error("Checkout error", { error });
        res.status(500).json({
          success: false,
          error: "INTERNAL_ERROR",
          message: "Failed to create checkout session",
        });
      }
    }
  );

  /**
   * POST /api/v1/billing/portal
   * Create a Stripe Customer Portal session
   */
  app.post(
    "/api/v1/billing/portal",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req: Request, res: Response) => {
      try {
        const stripeCustomerId = req.subscription?.stripeCustomerId;

        if (!stripeCustomerId) {
          res.status(400).json({
            success: false,
            error: "NO_CUSTOMER",
            message: "No billing account found",
          });
          return;
        }

        const portalUrl = await createPortalSession(
          stripeCustomerId,
          `${config.appUrl}/`
        );

        if (!portalUrl) {
          res.status(500).json({
            success: false,
            error: "STRIPE_ERROR",
            message: "Failed to create portal session",
          });
          return;
        }

        log.info("Created portal session", { userId: req.user!.id });

        res.json({
          success: true,
          portalUrl,
        });
      } catch (error) {
        log.error("Portal error", { error });
        res.status(500).json({
          success: false,
          error: "INTERNAL_ERROR",
          message: "Failed to create portal session",
        });
      }
    }
  );

  /**
   * GET /api/v1/billing/status
   * Get current subscription status
   */
  app.get(
    "/api/v1/billing/status",
    requireAuth,
    loadSubscription,
    async (req: Request, res: Response) => {
      try {
        const subscription = req.subscription;

        res.json({
          success: true,
          subscription: subscription
            ? {
                tier: subscription.tier,
                status: subscription.status,
                currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              }
            : {
                tier: "free",
                status: "active",
              },
          stripeConfigured: isStripeConfigured(),
        });
      } catch (error) {
        log.error("Status error", { error });
        res.status(500).json({
          success: false,
          error: "INTERNAL_ERROR",
          message: "Failed to get subscription status",
        });
      }
    }
  );
}

/**
 * Handle Stripe webhook events
 * This should be registered BEFORE body parsers with raw body
 */
export function handleStripeWebhook(app: Express): void {
  app.post(
    "/api/v1/billing/webhook",
    // Note: This route needs raw body for signature verification
    // It should be registered before body-parser middleware
    async (req: Request, res: Response) => {
      const signature = req.headers["stripe-signature"] as string;

      if (!signature) {
        log.warn("Webhook received without signature");
        res.status(400).json({ error: "Missing signature" });
        return;
      }

      try {
        // Get raw body as string or buffer
        const payload =
          typeof req.body === "string"
            ? req.body
            : Buffer.isBuffer(req.body)
              ? req.body
              : JSON.stringify(req.body);

        const event = verifyWebhookSignature(payload, signature);

        if (!event) {
          log.warn("Webhook verification failed or Stripe not configured");
          res.status(200).json({ received: true }); // Return 200 to prevent retries
          return;
        }

        log.info("Received webhook event", { type: event.type });

        // Handle different event types
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            await handleCheckoutCompleted(session);
            break;
          }

          case "customer.subscription.updated": {
            const subscription = event.data.object as Stripe.Subscription;
            await handleSubscriptionUpdated(subscription);
            break;
          }

          case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription;
            await handleSubscriptionDeleted(subscription);
            break;
          }

          case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice;
            await handlePaymentFailed(invoice);
            break;
          }

          case "invoice.payment_succeeded": {
            const invoice = event.data.object as Stripe.Invoice;
            await handlePaymentSucceeded(invoice);
            break;
          }

          default:
            log.debug("Unhandled webhook event type", { type: event.type });
        }

        res.json({ received: true });
      } catch (error) {
        log.error("Webhook error", { error });
        res.status(400).json({ error: "Webhook error" });
      }
    }
  );
}

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const userId = session.metadata?.userId;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!userId) {
    log.error("Checkout completed without userId in metadata", { sessionId: session.id });
    return;
  }

  log.info("Processing checkout completion", { userId, customerId, subscriptionId });

  // Get subscription details from Stripe
  // For now, set reasonable defaults
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await upgradeSubscription(
    userId,
    subscriptionId,
    customerId,
    now,
    periodEnd
  );

  log.info("User upgraded to Pro", { userId });
}

/**
 * Handle customer.subscription.updated event
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = subscription.customer as string;

  log.info("Processing subscription update", {
    customerId,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  // Access the raw properties from Stripe response
  const subData = subscription as unknown as {
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
  };

  const periodStart = new Date(subData.current_period_start * 1000);
  const periodEnd = new Date(subData.current_period_end * 1000);

  await updateSubscriptionByStripeCustomer(customerId, {
    status: mapStripeStatus(subscription.status),
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: subData.cancel_at_period_end,
  });
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = subscription.customer as string;

  log.info("Processing subscription deletion", { customerId });

  const sub = await getSubscriptionByStripeCustomer(customerId);
  if (sub) {
    await immediateDowngrade(sub.userId);
  }
}

/**
 * Handle invoice.payment_failed event
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;

  log.warn("Payment failed", { customerId, invoiceId: invoice.id });

  await updateSubscriptionByStripeCustomer(customerId, {
    status: "past_due",
  });
}

/**
 * Handle invoice.payment_succeeded event
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;

  log.info("Payment succeeded", { customerId, invoiceId: invoice.id });

  // Ensure subscription is active
  await updateSubscriptionByStripeCustomer(customerId, {
    status: "active",
  });
}

/**
 * Map Stripe subscription status to our status
 */
function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): "active" | "canceled" | "past_due" | "trialing" {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
    default:
      return "canceled";
  }
}
