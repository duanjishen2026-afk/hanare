import { hm, liveInfo } from "../lib/time";
import type { JobRow } from "../queries";

export const DRAFT_SYSTEM = `You write job applications for people who live outside Japan and apply to remote part-time jobs at Japanese companies.

Output exactly two parts separated by a line containing only ===JA===
Part 1: the message in English, 90 to 130 words, first person, warm and specific to this job. Plain text: no subject line, no markdown.
Part 2: the same message in natural, polite business Japanese (です・ます with appropriate 敬語), opening with ご担当者様. Plain text: no romaji, no markdown.

Use only facts given in the request. Never invent employers, degrees, years of experience or a name. Sign off with [Your name] in English and ［お名前］ in Japanese. If the candidate gave no background, write a neutral draft with [square brackets] where they must add their own experience.`;

export function draftRequest(job: JobRow, bio: string, place: string, tz: string): string {
  const live = liveInfo(job.liveStartMin, job.liveEndMin, tz);
  const hours =
    job.liveStartMin == null || job.liveEndMin == null
      ? "No fixed hours."
      : `Live hours ${hm(job.liveStartMin)}-${hm(job.liveEndMin)} JST, which is ${live.text} for the candidate.`;
  return [
    "JOB",
    `Title: ${job.titleEn} (${job.titleJa})`,
    `Company: ${job.companyEn} (${job.companyJa})`,
    `About: ${job.descEn}`,
    `They ask for: ${job.reqsEn.join("; ")}`,
    `Hours: ${job.hoursMin} to ${job.hoursMax} per week. ${hours}`,
    "",
    `CANDIDATE (lives in ${place}; their own words, any language)`,
    bio.trim() ? `"""\n${bio.slice(0, 1500)}\n"""` : "(no background given)",
  ].join("\n");
}
