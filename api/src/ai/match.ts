import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { liveInfo, tzOffsetMin } from "../lib/time";
import { JP, type JobRow } from "../queries";
import { claude, fallbackParams, logCall, MODEL } from "./client";
import { keywordMatch } from "./fallback";

const MatchOut = z.object({
  profile: z.object({
    languages: z.array(z.string()),
    japaneseLevel: z.enum(JP),
    skills: z.array(z.string()),
    hoursPerWeek: z.number().int().nullable(),
    summary: z.string(),
  }),
  matches: z.array(z.object({ job: z.number().int(), score: z.number().int(), why: z.string() })),
});

export type Profile = z.infer<typeof MatchOut>["profile"];
export type Match = { jobId: string; score: number; why: string };
export type MatchResult = { source: "ai" | "keyword"; profile: Profile; matches: Match[]; note?: string };

const SYSTEM = `You rank remote part-time jobs at Japanese companies for one candidate who lives outside Japan.

Read the candidate's self-description, which may be in any language. Extract their profile, score the jobs in the catalog from 0 to 100, and return the 5 best, best first.

Scoring:
- Lower the score sharply when a job needs more Japanese than the candidate has, or a language they do not speak.
- Lower it when the job's live hours fall between 00:00 and 06:00 in the candidate's local time. Local live hours are listed in the request.
- Raise it for concrete skill overlap and when their weekly hours fit the job's range.
- Use only what the candidate wrote. Do not assume skills, languages or a Japanese level they did not state; with no Japanese level stated, use "none".

Write each "why" in the language the candidate wrote in: one sentence of at most 24 words naming the concrete reasons.
Write profile.summary in English, one short sentence.`;

// Jobs are numbered 1..n so the model returns short numbers instead of copying UUIDs.
const catalog = (jobs: JobRow[]) =>
  jobs.map((j, i) => ({
    job: i + 1,
    title: j.titleEn,
    category: j.category,
    japanese: j.jpLevel ? `${JP[j.jpLevel]} or better` : "not needed",
    languages: j.languages,
    hoursPerWeek: `${j.hoursMin}-${j.hoursMax}`,
    skills: j.tags,
    pay: `¥${j.payYen} per ${j.payUnit.replace("_", " ")}`,
  }));

export async function matchJobs(
  input: { bio: string; tz: string; place: string; userId: string | null },
  jobs: JobRow[],
): Promise<MatchResult> {
  if (!claude) return { ...keywordMatch(input.bio, input.tz, jobs), note: "AI is off on this server, so this is a keyword match." };

  const off = tzOffsetMin(input.tz) / 60;
  const localHours = jobs.map((j, i) => `#${i + 1}: ${liveInfo(j.liveStartMin, j.liveEndMin, input.tz).text}`).join("\n");
  const started = Date.now();
  try {
    const res = await claude.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...fallbackParams,
      output_config: { effort: "low", format: betaZodOutputFormat(MatchOut) },
      system: [
        { type: "text", text: SYSTEM },
        // The catalog changes only when jobs change, so it is cached across candidates.
        { type: "text", text: "JOB CATALOG (JSON):\n" + JSON.stringify(catalog(jobs)), cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content:
            `Candidate lives in ${input.place} (UTC${off >= 0 ? "+" : ""}${off}).\n\n` +
            `Live hours of each job in the candidate's local time:\n${localHours}\n\n` +
            `CANDIDATE:\n"""\n${input.bio.slice(0, 2000)}\n"""`,
        },
      ],
    });
    await logCall("match", input.userId, started, true, res.usage);
    const out = res.parsed_output;
    if (res.stop_reason === "refusal" || !out) throw new Error(`no usable output (stop_reason=${res.stop_reason})`);

    // Never trust model output blindly: map numbers back to real jobs, drop unknowns and repeats, clamp scores.
    const seen = new Set<string>();
    const matches = out.matches
      .flatMap((m) => {
        const job = jobs[m.job - 1];
        if (!job || seen.has(job.id)) return [];
        seen.add(job.id);
        return [{ jobId: job.id, score: Math.max(0, Math.min(100, Math.round(m.score))), why: m.why.slice(0, 240) }];
      })
      .slice(0, 5);
    if (!matches.length) throw new Error("model returned no valid job numbers");
    return { source: "ai", profile: out.profile, matches };
  } catch (err) {
    console.error("match failed, using keyword fallback:", err);
    await logCall("match", input.userId, started, false);
    return { ...keywordMatch(input.bio, input.tz, jobs), note: "The AI match did not come through, so this is a keyword match." };
  }
}
