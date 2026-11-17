import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().default(8787),
  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(), // empty = run without AI (keyword match + template drafts)
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET needs at least 32 characters"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
});

export const env = Env.parse(process.env);
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
