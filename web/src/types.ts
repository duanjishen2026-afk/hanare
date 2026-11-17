// Mirrors JobRow in api/src/queries.ts (the API returns camelCase columns).
export type Job = {
  id: string;
  category: "L" | "T" | "M" | "S" | "Q" | "C" | "R";
  titleEn: string;
  titleJa: string;
  descEn: string;
  descJa: string;
  tasksEn: string[];
  reqsEn: string[];
  tags: string[];
  languages: string[];
  jpLevel: number;
  payYen: number;
  payUnit: "hr" | "article" | "video_minute" | "finished_minute";
  hourlyEquivYen: number;
  hoursMin: number;
  hoursMax: number;
  liveStartMin: number | null;
  liveEndMin: number | null;
  liveDays: string | null;
  publishedAt: string | null;
  companyEn: string;
  companyJa: string;
  verified: boolean;
  applicants: number;
};

export type MatchResult = {
  source: "ai" | "keyword";
  note?: string;
  profile: { languages: string[]; japaneseLevel: string; skills: string[]; hoursPerWeek: number | null; summary: string };
  matches: { jobId: string; score: number; why: string }[];
};
