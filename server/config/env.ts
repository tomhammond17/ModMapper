import { z } from "zod";
import { createLogger } from "../logger";

const log = createLogger("config");

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("5000"),

  // API Keys
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required for PDF processing"),

  // Database
  DATABASE_URL: z.string().optional(),

  // PDF Processing
  PDF_CACHE_TTL_MINUTES: z.string().default("30"),
  PDF_CACHE_MAX_ENTRIES: z.string().default("100"),
  PDF_PARALLEL_BATCHES: z.string().default("2"),

  // CORS
  ALLOWED_ORIGINS: z.string().optional(),

  // Authentication & Sessions (optional - enables premium features)
  SESSION_SECRET: z.string().optional(),
  MAGIC_LINK_SECRET: z.string().optional(),
  APP_URL: z.string().default("http://localhost:5000"),

  // Email (optional - required for authentication)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.string().optional(),

  // Stripe (optional - required for Pro subscriptions)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  try {
    const env = envSchema.parse(process.env);
    log.info("Environment variables validated successfully");
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.error("Environment validation failed:", error.errors);
      console.error("\n❌ Environment Variable Validation Failed:\n");
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      console.error("\nPlease check your .env file and ensure all required variables are set.");
      console.error("See .env.example for reference.\n");
    }
    process.exit(1);
  }
}
