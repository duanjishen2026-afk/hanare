import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// Every error leaves the API in one shape: { error: { code, message } }
export const fail = (c: Context, status: ContentfulStatusCode, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

// In-memory sliding window per IP and path. Enough for one instance; use Redis if you scale out.
const hits = new Map<string, number[]>();
export const rateLimit = (limit: number, windowMs = 60_000) =>
  createMiddleware(async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const key = `${c.req.path}:${ip}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) return fail(c, 429, "rate_limited", "Too many requests. Wait a minute and try again.");
    recent.push(now);
    hits.set(key, recent);
    await next();
  });
