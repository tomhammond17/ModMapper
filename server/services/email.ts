import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { createLogger } from "../logger";

const log = createLogger("email");

let transporter: Transporter | null = null;

// Common email styles
const EMAIL_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: #2C5F9E; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
  .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
  .button { display: inline-block; background: #2C5F9E; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
  .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 3px; margin: 15px 0; }
  .feature-list { background: white; padding: 15px; border-radius: 3px; margin: 15px 0; }
`;

/**
 * Wrap content in base email template
 */
function wrapEmailTemplate(title: string, content: string, footerExtra = ""): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${EMAIL_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>ModMapper - Modbus Document Converter</p>
      ${footerExtra}
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Create link button HTML
 */
function createButton(url: string, text: string): string {
  return `<p style="text-align: center;"><a href="${url}" class="button">${text}</a></p>`;
}

/**
 * Create copyable link block
 */
function createLinkBlock(url: string): string {
  return `
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; background: #fff; padding: 10px; border-radius: 3px;">${url}</p>
  `;
}

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

  const content = `
    <p>Hi there,</p>
    <p>Thank you for signing up for ModMapper! Please verify your email address to get started.</p>
    ${createButton(verificationUrl, "Verify Email Address")}
    ${createLinkBlock(verificationUrl)}
    <p>This link will expire in 15 minutes.</p>
    <p>If you didn't create an account, you can safely ignore this email.</p>
  `;

  const html = wrapEmailTemplate("Welcome to ModMapper", content);

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

  const content = `
    <p>Hi there,</p>
    <p>You requested a magic link to log in to your ModMapper account. Click the button below to log in instantly:</p>
    ${createButton(magicLinkUrl, "Log In to ModMapper")}
    ${createLinkBlock(magicLinkUrl)}
    <div class="warning">
      <strong>Security Notice:</strong> This link will expire in 15 minutes and can only be used once.
    </div>
    <p>If you didn't request this login link, you can safely ignore this email. Your account remains secure.</p>
  `;

  const html = wrapEmailTemplate("Your Magic Login Link", content);

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

  const content = `
    <p>Hi there,</p>
    <p>Your account is all set up and ready to go! You're on the <strong>Free tier</strong> which includes:</p>
    <div class="feature-list">
      <ul>
        <li>10 CSV/JSON/XML conversions per month</li>
        <li>200,000 AI tokens for PDF parsing per month</li>
        <li>Access to all file formats (CSV, JSON, XML, PDF)</li>
        <li>Standard export options</li>
      </ul>
    </div>
    <p>Ready to start converting? Head over to the app:</p>
    ${createButton(appUrl, "Start Converting")}
    <p>Want unlimited conversions and premium features? Check out <strong>ModMapper Pro</strong> for:</p>
    <div class="feature-list">
      <ul>
        <li>Unlimited conversions</li>
        <li>Document storage & organization</li>
        <li>Folder management</li>
        <li>Version control</li>
        <li>Custom export templates</li>
      </ul>
    </div>
    <p style="text-align: center;">
      <a href="${appUrl}/pricing">Learn more about Pro</a>
    </p>
  `;

  const html = wrapEmailTemplate(
    "Welcome to ModMapper!",
    content,
    "<p>Need help? Reply to this email or visit our documentation.</p>"
  );

  try {
    await transporter.sendMail({
      from: fromEmail,
      to: email,
      subject: "Welcome to ModMapper!",
      html,
    });

    log.info("Welcome email sent", { email });
  } catch (error) {
    log.error("Failed to send welcome email", { email, error });
    // Don't throw - welcome email is not critical
  }
}
