import type { Express, Request, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import {
  createUser,
  authenticateUser,
  getUserByEmail,
  createMagicLink,
  verifyMagicLink,
  verifyUserEmail,
} from "../services/auth";
import {
  sendVerificationEmail,
  sendMagicLinkEmail,
  sendWelcomeEmail,
  isEmailServiceAvailable,
} from "../services/email";
import { requireAuth, loadSubscription } from "../middleware/auth";
import { createLogger } from "../logger";

const log = createLogger("auth-routes");

// Rate limiters
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 signups per hour per IP
  message: { success: false, error: "TOO_MANY_REQUESTS", message: "Too many signup attempts. Please try again later." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 minutes per IP
  message: { success: false, error: "TOO_MANY_REQUESTS", message: "Too many login attempts. Please try again later." },
});

const magicLinkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 magic link requests per hour per IP
  message: { success: false, error: "TOO_MANY_REQUESTS", message: "Too many magic link requests. Please try again later." },
});

// Validation schemas
const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const magicLinkSchema = z.object({
  email: z.string().email("Invalid email address"),
});

/**
 * Register authentication routes
 */
export function registerAuthRoutes(
  app: Express,
  config: {
    appUrl: string;
    fromEmail: string;
  }
): void {
  /**
   * POST /api/v1/auth/signup
   * Create a new user account
   */
  app.post("/api/v1/auth/signup", signupLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = signupSchema.parse(req.body);

      // Create user
      const user = await createUser(email, password);

      // Create verification token (using magic link system)
      const verificationToken = await createMagicLink(user.id);

      // Send verification email if email service is configured
      if (isEmailServiceAvailable()) {
        await sendVerificationEmail(email, verificationToken, config.appUrl, config.fromEmail);
      } else {
        log.warn("Email service not available - skipping verification email", { userId: user.id });
      }

      // Auto-login after signup
      req.session.userId = user.id;

      res.json({
        success: true,
        message: isEmailServiceAvailable()
          ? "Account created! Please check your email to verify your address."
          : "Account created successfully!",
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: error.errors[0].message,
        });
      }

      if (error instanceof Error && error.message.includes("already exists")) {
        return res.status(409).json({
          success: false,
          error: "USER_EXISTS",
          message: "An account with this email already exists",
        });
      }

      log.error("Signup error", { error });
      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to create account. Please try again.",
      });
    }
  });

  /**
   * POST /api/v1/auth/login
   * Login with email and password
   */
  app.post("/api/v1/auth/login", loginLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await authenticateUser(email, password);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        });
      }

      // Create session
      req.session.userId = user.id;

      res.json({
        success: true,
        message: "Logged in successfully",
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: error.errors[0].message,
        });
      }

      log.error("Login error", { error });
      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to log in. Please try again.",
      });
    }
  });

  /**
   * POST /api/v1/auth/logout
   * Logout and destroy session
   */
  app.post("/api/v1/auth/logout", async (req: Request, res: Response) => {
    if (!req.session) {
      return res.json({ success: true, message: "Already logged out" });
    }

    req.session.destroy((err) => {
      if (err) {
        log.error("Logout error", { error: err });
        return res.status(500).json({
          success: false,
          error: "INTERNAL_ERROR",
          message: "Failed to log out. Please try again.",
        });
      }

      res.json({
        success: true,
        message: "Logged out successfully",
      });
    });
  });

  /**
   * POST /api/v1/auth/magic-link
   * Request a magic link for passwordless login
   */
  app.post("/api/v1/auth/magic-link", magicLinkLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = magicLinkSchema.parse(req.body);

      const user = await getUserByEmail(email);

      if (!user) {
        // Don't reveal whether user exists (security best practice)
        return res.json({
          success: true,
          message: "If an account exists with this email, a magic link has been sent.",
        });
      }

      // Create magic link token
      const magicToken = await createMagicLink(user.id);

      // Send magic link email if email service is configured
      if (isEmailServiceAvailable()) {
        await sendMagicLinkEmail(email, magicToken, config.appUrl, config.fromEmail);
      } else {
        log.warn("Email service not available - cannot send magic link", { userId: user.id });
        return res.status(503).json({
          success: false,
          error: "EMAIL_SERVICE_UNAVAILABLE",
          message: "Email service is not configured. Please use password login.",
        });
      }

      res.json({
        success: true,
        message: "If an account exists with this email, a magic link has been sent.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: error.errors[0].message,
        });
      }

      log.error("Magic link error", { error });
      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to send magic link. Please try again.",
      });
    }
  });

  /**
   * GET /api/v1/auth/verify/:token
   * Verify email or magic link token
   */
  app.get("/api/v1/auth/verify/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: "INVALID_TOKEN",
          message: "Verification token is required",
        });
      }

      const user = await verifyMagicLink(token);

      if (!user) {
        return res.status(400).json({
          success: false,
          error: "INVALID_TOKEN",
          message: "Invalid or expired verification token",
        });
      }

      // Verify email if not already verified
      if (!user.emailVerified) {
        await verifyUserEmail(user.id);

        // Send welcome email
        if (isEmailServiceAvailable()) {
          await sendWelcomeEmail(user.email, config.appUrl, config.fromEmail);
        }
      }

      // Create session (log in the user)
      req.session.userId = user.id;

      // Redirect to app (or return JSON for SPA)
      res.redirect(config.appUrl);
    } catch (error) {
      log.error("Verification error", { error });
      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to verify token. Please try again.",
      });
    }
  });

  /**
   * GET /api/v1/auth/me
   * Get current user info (requires authentication)
   */
  app.get("/api/v1/auth/me", requireAuth, loadSubscription, async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "AUTHENTICATION_REQUIRED",
        message: "Not authenticated",
      });
    }

    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        emailVerified: req.user.emailVerified,
        createdAt: req.user.createdAt,
      },
      subscription: req.subscription
        ? {
            tier: req.subscription.tier,
            status: req.subscription.status,
            currentPeriodEnd: req.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: req.subscription.cancelAtPeriodEnd,
          }
        : null,
    });
  });
}
