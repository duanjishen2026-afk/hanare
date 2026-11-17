// Non-AI fallbacks, ported from the prototype's localMatch() and templateDraft().
// They keep the demo working when there is no API key, the API is slow, or a call fails.
import { liveInfo } from "../lib/time";
import { JP, type JobRow } from "../queries";
import type { MatchResult } from "./match";

const LANG_WORDS: Record<string, string[]> = {
  english: ["english", "inglês", "ingles", "inglés", "englisch", "anglais", "英语", "英語"],
  spanish: ["spanish", "español", "espanol", "espanhol", "spanisch"],
  portuguese: ["portuguese", "português", "portugues"],
  indonesian: ["indonesian", "bahasa"],
  vietnamese: ["vietnamese", "tiếng việt"],
  thai: ["thai", "ไทย"],
  german: ["german", "deutsch"],
  french: ["french", "français", "francais"],
  chinese: ["chinese", "mandarin", "中文", "汉语"],
};
const langKey = (label: string) => Object.keys(LANG_WORDS).find((k) => label.toLowerCase().startsWith(k));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function keywordMatch(bio: string, tz: string, jobs: JobRow[]): Omit<MatchResult, "note"> {
  const t = bio.toLowerCase();
  const has = (w: string) => t.includes(w.toLowerCase());
  const langs = Object.keys(LANG_WORDS).filter((k) => LANG_WORDS[k].some(has));
  const level = t.match(/\bn\s?-?([1-5])\b/);
  const myJp = level ? 6 - Number(level[1]) : 0;
  const hours = t.match(/(\d{1,2})\s*(?:h\b|hrs?|hours?|horas?|stunden|小时|時間)/);
  const myHours = hours ? Number(hours[1]) : null;
  const skills = new Set<string>();

  const matches = jobs
    .map((j) => {
      let score = 45;
      const why: string[] = [];
      const hits = j.tags.filter(has);
      hits.forEach((h) => skills.add(h));
      score += Math.min(hits.length, 3) * 9;
      if (hits.length) why.push(`matches your ${hits.slice(0, 2).join(" and ")} experience`);

      const keys = j.languages.map(langKey).filter((k): k is string => !!k);
      const needed = keys.length > 1 ? keys.filter((k) => k !== "english") : keys;
      if (needed.length) {
        if (needed.every((k) => langs.includes(k))) { score += 18; why.push("you have the language"); }
        else score -= 32;
      }
      const gap = j.jpLevel - myJp;
      if (gap <= 0) { score += 8; why.push(j.jpLevel === 0 ? "no Japanese needed" : "your Japanese is enough"); }
      else score -= 18 * gap;

      const v = liveInfo(j.liveStartMin, j.liveEndMin, tz).verdict;
      if (v === "bad") score -= 15;
      else if (v === "warn") score -= 5;
      else if (v === "async") { score += 3; why.push("no fixed hours"); }
      if (myHours && j.hoursMin > myHours) score -= 10;

      const text = why.length ? why.join("; ") : "partial keyword overlap";
      return { jobId: j.id, score: Math.max(5, Math.min(96, Math.round(score))), why: cap(text) + "." };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    source: "keyword",
    profile: { languages: langs.map(cap), japaneseLevel: JP[myJp], skills: [...skills].slice(0, 6), hoursPerWeek: myHours, summary: "" },
    matches,
  };
}

// Same "English ===JA=== Japanese" shape the AI draft uses, so the client handles both the same way.
export function templateDraft(job: JobRow, place: string, tz: string): string {
  const live = liveInfo(job.liveStartMin, job.liveEndMin, tz);
  const en =
    `Hello,\n\nI would like to apply for the ${job.titleEn} role at ${job.companyEn}. ` +
    `[One or two sentences about your most relevant experience.]\n\n` +
    `I can work ${job.hoursMin} to ${job.hoursMax} hours a week from ${place}` +
    (live.verdict === "async" ? "." : `, and the live hours (${live.text} my time) work for me.`) +
    ` [Your languages and levels.]\n\nThank you for your time. I would be glad to do a short trial task.\n\n[Your name]`;
  const ja =
    `ご担当者様\n\nはじめまして。貴社の「${job.titleJa}」の募集を拝見し、応募いたしました。\n` +
    `［関連するご経験を1〜2文でご記入ください］\n\n` +
    `現在${place}に在住しており、週${job.hoursMin}〜${job.hoursMax}時間の稼働が可能です。\n\n` +
    `お忙しいところ恐れ入りますが、ご検討のほどよろしくお願いいたします。トライアル課題にも喜んで対応いたします。\n\n［お名前］`;
  return `${en}\n===JA===\n${ja}`;
}
