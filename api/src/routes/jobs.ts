import { Hono } from "hono";
import { z } from "zod";
import { translateJob } from "../ai/translateJob";
import { requireUser } from "../auth";
import { sql } from "../db";
import { fail, rateLimit } from "../http";
import { jobSelect, type JobRow } from "../queries";

const CATEGORY = z.enum(["L", "T", "M", "S", "Q", "C", "R"]);

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  cat: CATEGORY.optional(),
  jpMax: z.coerce.number().int().min(0).max(5).optional(), // "My Japanese": show jobs at or below this level
  hours: z.coerce.number().int().positive().optional(), // "Hours I have": hide jobs whose minimum is higher
  async: z.literal("1").optional(), // only jobs with no fixed hours
  sort: z.enum(["new", "pay"]).default("new"),
});

const NewJob = z
  .object({
    titleJa: z.string().trim().min(2).max(120),
    descJa: z.string().trim().min(20).max(4000),
    payYen: z.number().int().positive(),
    payUnit: z.enum(["hr", "article", "video_minute", "finished_minute"]),
    hourlyEquivYen: z.number().int().positive().optional(), // needed for per-piece pay so "highest pay" sorting is fair
    hoursMin: z.number().int().min(1).max(60),
    hoursMax: z.number().int().min(1).max(60),
    liveStartMin: z.number().int().min(0).max(1439).nullable().default(null), // JST minutes, null = async
    liveEndMin: z.number().int().min(1).max(2879).nullable().default(null),
    liveDays: z.string().trim().max(200).nullable().default(null),
  })
  .refine((j) => j.hoursMax >= j.hoursMin, { message: "hoursMax must be at least hoursMin", path: ["hoursMax"] })
  .refine((j) => (j.liveStartMin == null) === (j.liveEndMin == null), { message: "Give both live start and end, or neither", path: ["liveEndMin"] });

// What the employer may change after the AI fills the English side
const JobPatch = z
  .object({
    titleEn: z.string().trim().min(2).max(160),
    descEn: z.string().trim().min(20).max(4000),
    tasksEn: z.array(z.string().trim().min(1).max(200)).max(8),
    reqsEn: z.array(z.string().trim().min(1).max(200)).max(8),
    tags: z.array(z.string().trim().min(1).max(40)).max(10),
    languages: z.array(z.string().trim().min(1).max(60)).max(5),
    jpLevel: z.number().int().min(0).max(5),
    category: CATEGORY,
  })
  .partial();

export const jobRoutes = new Hono()
  // Public listing. "Hide overnight shifts" depends on the viewer's time zone, so the web app filters that itself.
  .get("/jobs", async (c) => {
    const f = ListQuery.parse(c.req.query());
    const like = f.q ? `%${f.q}%` : null;
    const jobs = await sql<JobRow[]>`
      ${jobSelect()}
      where j.status = 'open'
      ${f.cat ? sql`and j.category = ${f.cat}` : sql``}
      ${f.jpMax !== undefined ? sql`and j.jp_level <= ${f.jpMax}` : sql``}
      ${f.hours ? sql`and j.hours_min <= ${f.hours}` : sql``}
      ${f.async ? sql`and j.live_start_min is null` : sql``}
      ${like ? sql`and (j.title_en ilike ${like} or c.name_en ilike ${like} or exists (select 1 from unnest(j.tags || j.languages) t where t ilike ${like}))` : sql``}
      order by ${f.sort === "pay" ? sql`j.hourly_equiv_yen desc` : sql`j.published_at desc`}
      limit 100`;
    return c.json({ jobs });
  })
  .get("/jobs/:id{[0-9a-f-]{36}}", async (c) => {
    const [job] = await sql<JobRow[]>`${jobSelect()} where j.id = ${c.req.param("id")} and j.status = 'open'`;
    return job ? c.json({ job }) : fail(c, 404, "not_found", "This listing is closed or does not exist.");
  })
  // Employer posts in Japanese; the AI fills the English side and the job stays a draft until they publish.
  .post("/jobs", requireUser("employer"), rateLimit(10), async (c) => {
    const b = NewJob.parse(await c.req.json());
    const user = c.get("user");
    const [company] = await sql<{ id: string }[]>`select id from companies where owner_id = ${user.id} limit 1`;
    if (!company) return fail(c, 400, "no_company", "Add your company before posting a job.");
    const en = await translateJob(b.titleJa, b.descJa, user.id);
    const [{ id }] = await sql<{ id: string }[]>`
      insert into jobs (company_id, status, category, title_ja, desc_ja, title_en, desc_en, tasks_en, reqs_en, tags, languages,
                        jp_level, pay_yen, pay_unit, hourly_equiv_yen, hours_min, hours_max, live_start_min, live_end_min, live_days)
      values (${company.id}, 'draft', ${en?.category ?? "T"}, ${b.titleJa}, ${b.descJa},
              ${en?.titleEn ?? ""}, ${en?.descEn ?? ""}, ${en?.tasksEn ?? []}, ${en?.reqsEn ?? []},
              ${en?.tags ?? []}, ${en?.languages ?? []}, ${en?.jpLevel ?? 0},
              ${b.payYen}, ${b.payUnit}, ${b.hourlyEquivYen ?? b.payYen}, ${b.hoursMin}, ${b.hoursMax},
              ${b.liveStartMin}, ${b.liveEndMin}, ${b.liveDays})
      returning id`;
    const [job] = await sql<JobRow[]>`${jobSelect()} where j.id = ${id}`;
    return c.json({ job, translated: Boolean(en) }, 201);
  })
  .patch("/jobs/:id", requireUser("employer"), async (c) => {
    const p = JobPatch.parse(await c.req.json());
    const cols: Record<string, unknown> = {};
    if (p.titleEn !== undefined) cols.title_en = p.titleEn;
    if (p.descEn !== undefined) cols.desc_en = p.descEn;
    if (p.tasksEn) cols.tasks_en = p.tasksEn;
    if (p.reqsEn) cols.reqs_en = p.reqsEn;
    if (p.tags) cols.tags = p.tags;
    if (p.languages) cols.languages = p.languages;
    if (p.jpLevel !== undefined) cols.jp_level = p.jpLevel;
    if (p.category) cols.category = p.category;
    if (!Object.keys(cols).length) return fail(c, 400, "nothing_to_update", "Send at least one field to change.");
    const rows = await sql`
      update jobs set ${sql(cols)}
      where id = ${c.req.param("id")} and company_id in (select id from companies where owner_id = ${c.get("user").id})
      returning id`;
    if (!rows.length) return fail(c, 404, "not_found", "No job of yours with that id.");
    const [job] = await sql<JobRow[]>`${jobSelect()} where j.id = ${rows[0].id}`;
    return c.json({ job });
  })
  .post("/jobs/:id/publish", requireUser("employer"), async (c) => {
    const rows = await sql`
      update jobs set status = 'open', published_at = coalesce(published_at, now())
      where id = ${c.req.param("id")} and title_en <> '' and desc_en <> ''
        and company_id in (select id from companies where owner_id = ${c.get("user").id})
      returning id`;
    return rows.length ? c.json({ ok: true }) : fail(c, 400, "cannot_publish", "Fill in the English title and description before publishing.");
  })
  .get("/employer/jobs", requireUser("employer"), async (c) => {
    const jobs = await sql<JobRow[]>`
      ${jobSelect()} where c.owner_id = ${c.get("user").id} order by j.created_at desc`;
    return c.json({ jobs });
  });
