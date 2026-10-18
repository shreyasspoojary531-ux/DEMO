import { z } from "zod";

const envSchema = z.object({
  // Required
  LLM_PROVIDER: z.string().min(1, "LLM_PROVIDER is required"),
  LLM_API_KEY: z.string().min(1, "LLM_API_KEY is required"),
  LLM_MODEL: z.string().min(1, "LLM_MODEL is required"),

  // Optional
  SEARCH_PROVIDER: z.string().optional(),
  SEARCH_API_KEY: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  SAFE_BROWSING_API_KEY: z.string().optional(),
  URLSCAN_API_KEY: z.string().optional(),
  CLASSIFIER_URL: z.string().optional(),
  DB_PATH: z.string().default("./data/app.db"),
});

/**
 * Validates and parses environment variables.
 * Prints clear error messages naming missing variables without exposing values.
 *
 * @param {Record<string, string | undefined>} [sourceEnv]
 * @returns {z.infer<typeof envSchema>}
 */
export function getEnv(sourceEnv = process.env) {
  const result = envSchema.safeParse(sourceEnv);

  if (!result.success) {
    const missingOrInvalid = result.error.issues.map((issue) => {
      const field = issue.path.join(".");
      return ` - ${field}: ${issue.message}`;
    });

    const errorMessage = [
      "Environment validation failed. The following environment variables are missing or invalid:",
      ...missingOrInvalid,
      "Please check your .env.local or environment settings (see .env.example).",
    ].join("\n");

    throw new Error(errorMessage);
  }

  return result.data;
}

// Lazy or safe singleton for runtime usage
let cachedEnv = null;

export const env = new Proxy({}, {
  get(_target, prop) {
    if (!cachedEnv) {
      cachedEnv = getEnv(process.env);
    }
    return cachedEnv[prop];
  },
});
