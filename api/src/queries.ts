import { sql } from "./db";

// JLPT levels as stored in jp_level: 0 none, 1 N5 ... 5 N1
export const JP = ["none", "N5", "N4", "N3", "N2", "N1"] as const;

export type PayUnit = "hr" | "article" | "video_minute" | "finished_minute";

export type JobRow = {
  id: string;
  status: "draft" | "open" | "closed";
  category: string;
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
  payUnit: PayUnit;
  hourlyEquivYen: number;
  hoursMin: number;
  hoursMax: number;
  liveStartMin: number | null; // JST minutes after midnight
  liveEndMin: number | null;
  liveDays: string | null;
  publishedAt: Date | null;
  companyId: string;
  companyEn: string;
  companyJa: string;
  verified: boolean;
  applicants: number;
};

// Shared SELECT for every job read. Call it as a fragment: sql`${jobSelect()} where ...`
export const jobSelect = () => sql`
  select j.id, j.status, j.category, j.title_en, j.title_ja, j.desc_en, j.desc_ja, j.tasks_en, j.reqs_en,
         j.tags, j.languages, j.jp_level, j.pay_yen, j.pay_unit, j.hourly_equiv_yen, j.hours_min, j.hours_max,
         j.live_start_min, j.live_end_min, j.live_days, j.published_at,
         c.id as company_id, c.name_en as company_en, c.name_ja as company_ja, c.verified_at is not null as verified,
         (select count(*)::int from applications a where a.job_id = j.id) as applicants
  from jobs j
  join companies c on c.id = j.company_id`;
