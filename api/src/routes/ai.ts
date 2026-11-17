import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { claude, fallbackParams, logCall, MODEL } from "../ai/client";
import { DRAFT_SYSTEM, draftRequest } from "../ai/draft";
import { templateDraft } from "../ai/fallback";
import { matchJobs } from "../ai/match";
import { readUser } from "../auth";
import { sql } from "../db";
import { fail, rateLimit } from "../http";
import { jobSelect, type JobRow } from "../queries";

const MatchBody = z.object({
  bio: z.string().trim().min(12, "Write a sentence or two about yourself").max(4000),
  tz: z.string().max(64),        // IANA zone from the "I live in" picker
  place: z.string().max(80),     // city label, for the prompt
});
const DraftBody = z.object({
  jobId: z.uuid(),
  bio: z.string().max(4000).default(""),
  tz: z.string().max(64),
  place: z.string().max(80),
});

export const aiRoutes = new Hono()
  // Works signed out. Signed-in workers also get their text saved to their profile.
  .post("/ai/match", rateLimit(8), async (c) => {
    const b = MatchBody.parse(await c.req.json());
    const user = await readUser(c.req.header("Authorization"));
    const jobs = await sql<JobRow[]>`${jobSelect()} where j.status = 'open' order by j.published_at desc limit 60`;
    const result = await matchJobs({ ...b, userId: user?.id ?? null }, jobs);
    if (user?.role === "worker") {
      await sql`update worker_profiles set bio_raw = ${b.bio}, tz = ${b.tz}, updated_at = now() where user_id = ${user.id}`;
    }
    return c.json(result);
  })
  // Streams the cover letter as Server-Sent Events: "delta" {text} ... then "done" or "error".
  // The text is English, a line "===JA===", then Japanese; the client splits it.
  .post("/ai/draft", rateLimit(6), async (c) => {
    const b = DraftBody.parse(await c.req.json());
    const user = await readUser(c.req.header("Authorization"));
    const [job] = await sql<JobRow[]>`${jobSelect()} where j.id = ${b.jobId}`;
    if (!job) return fail(c, 404, "not_found", "That job no longer exists.");

    return streamSSE(c, async (out) => {
      if (!claude) {
        await out.writeSSE({ event: "delta", data: JSON.stringify({ text: templateDraft(job, b.place, b.tz) }) });
        await out.writeSSE({ event: "done", data: JSON.stringify({ source: "template" }) });
        return;
      }
      const started = Date.now();
      const stream = claude.beta.messages.stream({
        model: MODEL,
        max_tokens: 8000,
        ...fallbackParams,
        output_config: { effort: "medium" },
        system: DRAFT_SYSTEM,
        messages: [{ role: "user", content: draftRequest(job, b.bio, b.place, b.tz) }],
      });
      out.onAbort(() => stream.abort()); // the user pressed Stop or closed the tab: stop paying for tokens
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            await out.writeSSE({ event: "delta", data: JSON.stringify({ text: ev.delta.text }) });
          }
        }
        const final = await stream.finalMessage();
        const refused = final.stop_reason === "refusal";
        await logCall("draft", user?.id ?? null, started, !refused, final.usage);
        await out.writeSSE(
          refused
            ? { event: "error", data: JSON.stringify({ code: "refused", message: "The AI declined to write this one. Write it yourself, or change your profile text." }) }
            : { event: "done", data: JSON.stringify({ source: "ai", truncated: final.stop_reason === "max_tokens" }) },
        );
      } catch (err) {
        if (out.aborted) return;
        console.error("draft failed:", err);
        await logCall("draft", user?.id ?? null, started, false);
        await out.writeSSE({ event: "error", data: JSON.stringify({ code: "ai_failed", message: "The draft was interrupted. Try again, or finish it by hand." }) });
      }
    });
  });
