import Anthropic from "@anthropic-ai/sdk";
import { sql } from "../db";
import { env } from "../env";

// null when ANTHROPIC_API_KEY is empty: every AI route then uses its non-AI fallback
export const claude = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 90_000 }) : null;
export const MODEL = env.CLAUDE_MODEL;

// Server-side refusal fallback: if the model declines, the API re-runs the request on a fallback model
// inside the same call. Opus 5.5 / Opus 5 / Sonnet 5.5 / Fable support it; Haiku does not, so it switches off there.
export const fallbackParams = /^claude-(opus-5|sonnet-5-5|fable-5)/.test(MODEL)
  ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
  : {};

type Usage = { input_tokens: number; output_tokens: number };

// One row per call in ai_calls, so you can watch cost and latency during the demo.
export async function logCall(kind: string, userId: string | null, started: number, ok: boolean, usage?: Usage) {
  await sql`
    insert into ai_calls (kind, user_id, ok, input_tokens, output_tokens, ms)
    values (${kind}, ${userId}, ${ok}, ${usage?.input_tokens ?? null}, ${usage?.output_tokens ?? null}, ${Date.now() - started})
  `.catch((e) => console.error("ai_calls insert failed", e));
}
