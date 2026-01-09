import { z } from "zod";
import { createLogger } from "../logger";

const log = createLogger("config");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("5000"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required for PDF processing"),
  DATABASE_URL: z.string().optional(),
  PDF_CACHE_TTL_MINUTES: z.string().default("30"),
  PDF_CACHE_MAX_ENTRIES: z.string().default("100"),
  ALLOWED_ORIGINS: z.string().optional(),
  PDF_PARALLEL_BATCHES: z.string().default("2"),
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
