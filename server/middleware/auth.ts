import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { subscriptionsTable } from "@shared/schema";
import type { User, Subscription } from "@shared/schema";
import { getUserById } from "../services/auth";
import { createLogger } from "../logger";

const log = createLogger("auth-middleware");

// Extend Express Request type to include user and subscription
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      passwordHash: string;
      emailVerified: boolean;
      createdAt: Date;
      updatedAt: Date;
    }

    interface Request {
      user?: User;
      subscription?: Subscription;
    }
  }
}

/**
 * Middleware to require authentication
 * Returns 401 if user is not logged in
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.session?.userId) {
    res.status(401).json({
      success: false,
      error: "AUTHENTICATION_REQUIRED",
      message: "You must be logged in to access this resource",
    });
    return;
  }

  try {
    const user = await getUserById(req.session.userId);

    if (!user) {
      // Session exists but user was deleted
      req.session.destroy(() => {});
      res.status(401).json({
        success: false,
        error: "AUTHENTICATION_REQUIRED",
        message: "Your session is invalid. Please log in again.",
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    log.error("Error in requireAuth middleware", { error });
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "An error occurred while authenticating",
    });
  }
}

/**
 * Middleware to optionally attach user if logged in
 * Does not return error if not logged in
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.session?.userId) {
    next();
    return;
  }

  try {
    const user = await getUserById(req.session.userId);

    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    log.error("Error in optionalAuth middleware", { error });
    // Don't fail the request, just continue without user
    next();
  }
}

/**
 * Middleware to load user's subscription (requires requireAuth or optionalAuth first)
 */
export async function loadSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    next();
    return;
  }

  try {
    const db = getDb();
    const [subscription] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, req.user.id))
      .limit(1);

    if (subscription) {
      req.subscription = {
        id: subscription.id,
        userId: subscription.userId,
        tier: subscription.tier as "free" | "pro",
        status: subscription.status as "active" | "canceled" | "past_due" | "trialing",
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
      };
    }

    next();
  } catch (error) {
    log.error("Error in loadSubscription middleware", { error });
    // Don't fail the request, just continue without subscription
    next();
  }
}

/**
 * Middleware to require Pro tier subscription
 */
export function requirePro(req: Request, res: Response, next: NextFunction): void {
  if (!req.subscription || req.subscription.tier !== "pro") {
    res.status(403).json({
      success: false,
      error: "PRO_FEATURE",
      message: "This feature requires a Pro subscription",
      upgradeUrl: "/pricing",
    });
    return;
  }

  if (req.subscription.status !== "active" && req.subscription.status !== "trialing") {
    res.status(403).json({
      success: false,
      error: "SUBSCRIPTION_INACTIVE",
      message: "Your Pro subscription is not active. Please update your payment method.",
      billingUrl: "/billing",
    });
    return;
  }

  next();
}
