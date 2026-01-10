import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { createLogger } from "../logger";

const log = createLogger("email");

let transporter: Transporter | null = null;

/**
 * Initialize email transporter
 */
export function initializeEmailService(config: {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
}): void {
  if (!config.host || !config.port || !config.user || !config.pass) {
    log.warn("Email service not configured - emails will not be sent");
    return;
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  log.info("Email service initialized", { host: config.host, port: config.port });
}

/**
 * Check if email service is available
 */
export function isEmailServiceAvailable(): boolean {
  return transporter !== null;
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  email: string,
  verificationToken: string,
  appUrl: string,
  fromEmail: string
): Promise<void> {
  if (!transporter) {
    log.warn("Skipping email send - service not configured");
    return;
  }

  const verificationUrl = `${appUrl}/auth/verify/${verificationToken}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2C5F9E; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
    .button { display: inline-block; background: #2C5F9E; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ModMapper</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Thank you for signing up for ModMapper! Please verify your email address to get started.</p>
      <p style="text-align: center;">
        <a href="${verificationUrl}" class="button">Verify Email Address</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; background: #fff; padding: 10px; border-radius: 3px;">${verificationUrl}</p>
      <p>This link will expire in 15 minutes.</p>
      <p>If you didn't create an account, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>ModMapper - Modbus Document Converter</p>
    </div>
  </div>
</body>
</html>
  `;

  try {
    await transporter.sendMail({
      from: fromEmail,
      to: email,
      subject: "Verify your ModMapper email address",
      html,
    });

    log.info("Verification email sent", { email });
  } catch (error) {
    log.error("Failed to send verification email", { email, error });
    throw error;
  }
}

/**
 * Send magic link email for passwordless login
 */
export async function sendMagicLinkEmail(
  email: string,
  magicToken: string,
  appUrl: string,
  fromEmail: string
): Promise<void> {
  if (!transporter) {
    log.warn("Skipping email send - service not configured");
    return;
  }

  const magicLinkUrl = `${appUrl}/auth/verify/${magicToken}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2C5F9E; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
    .button { display: inline-block; background: #2C5F9E; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 3px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Magic Login Link</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>You requested a magic link to log in to your ModMapper account. Click the button below to log in instantly:</p>
      <p style="text-align: center;">
        <a href="${magicLinkUrl}" class="button">Log In to ModMapper</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; background: #fff; padding: 10px; border-radius: 3px;">${magicLinkUrl}</p>
      <div class="warning">
        <strong>⚠️ Security Notice:</strong> This link will expire in 15 minutes and can only be used once.
      </div>
      <p>If you didn't request this login link, you can safely ignore this email. Your account remains secure.</p>
    </div>
    <div class="footer">
      <p>ModMapper - Modbus Document Converter</p>
    </div>
  </div>
</body>
</html>
  `;

  try {
    await transporter.sendMail({
      from: fromEmail,
      to: email,
      subject: "Your magic login link for ModMapper",
      html,
    });

    log.info("Magic link email sent", { email });
  } catch (error) {
    log.error("Failed to send magic link email", { email, error });
    throw error;
  }
}

/**
 * Send welcome email after successful signup
 */
export async function sendWelcomeEmail(
  email: string,
  appUrl: string,
  fromEmail: string
): Promise<void> {
  if (!transporter) {
    log.warn("Skipping email send - service not configured");
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2C5F9E; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
    .button { display: inline-block; background: #2C5F9E; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
    .feature-list { background: white; padding: 15px; border-radius: 3px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to ModMapper!</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Your account is all set up and ready to go! You're on the <strong>Free tier</strong> which includes:</p>
      <div class="feature-list">
        <ul>
          <li>✅ 10 CSV/JSON/XML conversions per month</li>
          <li>✅ 200,000 AI tokens for PDF parsing per month</li>
          <li>✅ Access to all file formats (CSV, JSON, XML, PDF)</li>
          <li>✅ Standard export options</li>
        </ul>
      </div>
      <p>Ready to start converting? Head over to the app:</p>
      <p style="text-align: center;">
        <a href="${appUrl}" class="button">Start Converting</a>
      </p>
      <p>Want unlimited conversions and premium features? Check out <strong>ModMapper Pro</strong> for:</p>
      <div class="feature-list">
        <ul>
          <li>🚀 Unlimited conversions</li>
          <li>💾 Document storage & organization</li>
          <li>📂 Folder management</li>
          <li>🔄 Version control</li>
          <li>✨ Custom export templates</li>
        </ul>
      </div>
      <p style="text-align: center;">
        <a href="${appUrl}/pricing">Learn more about Pro →</a>
      </p>
    </div>
    <div class="footer">
      <p>ModMapper - Modbus Document Converter</p>
      <p>Need help? Reply to this email or visit our documentation.</p>
    </div>
  </div>
</body>
</html>
  `;

  try {
    await transporter.sendMail({
      from: fromEmail,
      to: email,
      subject: "Welcome to ModMapper! 🎉",
      html,
    });

    log.info("Welcome email sent", { email });
  } catch (error) {
    log.error("Failed to send welcome email", { email, error });
    // Don't throw - welcome email is not critical
  }
}
