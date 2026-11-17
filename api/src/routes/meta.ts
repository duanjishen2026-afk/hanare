import { Hono } from "hono";
import { claude } from "../ai/client";
import { sql } from "../db";

// Indicative rates (units of currency per 1 yen), used until the live fetch succeeds.
const STATIC_RATES: Record<string, number> = {
  USD: 0.0066, EUR: 0.0061, GBP: 0.0052, PHP: 0.38, IDR: 106, VND: 168, THB: 0.23,
  INR: 0.56, CNY: 0.047, KES: 0.85, BRL: 0.037, MXN: 0.125, AUD: 0.0101,
};
let cached = { at: 0, rates: STATIC_RATES, source: "static" as "static" | "live" };
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export const metaRoutes = new Hono()
  .get("/health", async (c) => {
    const db = await sql`select 1 as ok`.then(() => true, () => false);
    return c.json({ ok: db, db, ai: Boolean(claude) }, db ? 200 : 503);
  })
  .get("/rates", async (c) => {
    if (Date.now() - cached.at > TWELVE_HOURS) {
      try {
        // Free, keyless daily rates. Their terms ask for attribution: show "Rates by exchangerate-api.com".
        const r = await fetch("https://open.er-api.com/v6/latest/JPY", { signal: AbortSignal.timeout(5000) });
        const j = (await r.json()) as { result?: string; rates?: Record<string, number> };
        if (j.result === "success" && j.rates) cached = { at: Date.now(), rates: j.rates, source: "live" };
        else cached.at = Date.now();
      } catch {
        cached.at = Date.now(); // keep the last rates; try again in 12 hours
      }
    }
    return c.json({ base: "JPY", rates: cached.rates, source: cached.source, fetchedAt: new Date(cached.at).toISOString() });
  });
