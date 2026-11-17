import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, fallbackParams, logCall, MODEL } from "./client";

const JobEn = z.object({
  titleEn: z.string(),
  descEn: z.string(),
  tasksEn: z.array(z.string()),
  reqsEn: z.array(z.string()),
  category: z.enum(["L", "T", "M", "S", "Q", "C", "R"]),
  jpLevel: z.number().int(),
  languages: z.array(z.string()),
  tags: z.array(z.string()),
});
export type JobEn = z.infer<typeof JobEn>;

const SYSTEM = `You localize Japanese job postings for remote part-time workers who live outside Japan and may read little or no Japanese.

From the Japanese title and description, produce:
- titleEn: a plain English job title a foreign applicant would search for, not a literal translation.
- descEn: the description in natural English, 2 to 4 sentences. Keep every concrete fact: deliverables, deadlines, tools, how feedback works.
- tasksEn and reqsEn: 3 short bullet points each, in English.
- category: L language teaching, T translation and localization, M marketing and sales, S customer support, Q tech and QA, C creative, R research and data.
- jpLevel: the Japanese the job needs as a JLPT level: 0 none, 1 N5, 2 N4, 3 N3, 4 N2, 5 N1. Use 0 when the posting says Japanese is not needed or never mentions it.
- languages: other languages the job needs, such as "Spanish (native)".
- tags: 4 to 7 lowercase skill keywords people would search for.
Do not add facts that are not in the posting.`;

// Returns null when AI is off or fails; the employer then fills the English fields by hand.
export async function translateJob(titleJa: string, descJa: string, userId: string): Promise<JobEn | null> {
  if (!claude) return null;
  const started = Date.now();
  try {
    const res = await claude.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...fallbackParams,
      output_config: { effort: "medium", format: betaZodOutputFormat(JobEn) },
      system: SYSTEM,
      messages: [{ role: "user", content: `TITLE:\n${titleJa}\n\nDESCRIPTION:\n${descJa}` }],
    });
    await logCall("translate_job", userId, started, true, res.usage);
    const out = res.parsed_output;
    if (res.stop_reason === "refusal" || !out) return null;
    return { ...out, jpLevel: Math.max(0, Math.min(5, out.jpLevel)) };
  } catch (err) {
    console.error("translate_job failed:", err);
    await logCall("translate_job", userId, started, false);
    return null;
  }
}
