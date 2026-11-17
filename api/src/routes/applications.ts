import { Hono } from "hono";
import postgres from "postgres";
import { z } from "zod";
import { requireUser } from "../auth";
import { sql } from "../db";
import { fail } from "../http";

const NewApplication = z.object({
  jobId: z.uuid(),
  messageEn: z.string().trim().max(4000),
  messageJa: z.string().trim().max(4000),
}).refine((a) => a.messageEn.length >= 20 || a.messageJa.length >= 20, { message: "Write a few lines first", path: ["messageEn"] });

const StagePatch = z.object({ stage: z.enum(["viewed", "interview", "offer", "rejected"]) });

export const applicationRoutes = new Hono()
  .post("/applications", requireUser("worker"), async (c) => {
    const b = NewApplication.parse(await c.req.json());
    try {
      const [app] = await sql`
        insert into applications (job_id, worker_id, message_en, message_ja)
        select id, ${c.get("user").id}, ${b.messageEn}, ${b.messageJa} from jobs where id = ${b.jobId} and status = 'open'
        returning *`;
      return app ? c.json({ application: app }, 201) : fail(c, 404, "not_found", "This listing is closed.");
    } catch (err) {
      if (err instanceof postgres.PostgresError && err.code === "23505") return fail(c, 409, "already_applied", "You already applied to this job.");
      throw err;
    }
  })
  // Workers see their own applications; employers see the ones sent to their jobs.
  .get("/applications", requireUser(), async (c) => {
    const user = c.get("user");
    if (user.role === "worker") {
      const applications = await sql`
        select a.id, a.stage, a.message_en, a.message_ja, a.created_at, a.updated_at,
               j.id as job_id, j.title_en, j.category, co.name_en as company_en
        from applications a join jobs j on j.id = a.job_id join companies co on co.id = j.company_id
        where a.worker_id = ${user.id} order by a.created_at desc`;
      return c.json({ applications });
    }
    // Opening the list counts as "viewed", so the worker's tracker moves on its own.
    await sql`
      update applications set stage = 'viewed', updated_at = now()
      where stage = 'sent' and job_id in (select j.id from jobs j join companies co on co.id = j.company_id where co.owner_id = ${user.id})`;
    const applications = await sql`
      select a.id, a.stage, a.message_en, a.message_ja, a.created_at,
             j.id as job_id, j.title_ja, j.title_en, u.display_name as worker_name,
             p.tz as worker_tz, p.jp_level as worker_jp_level, p.languages as worker_languages
      from applications a
      join jobs j on j.id = a.job_id
      join companies co on co.id = j.company_id
      join users u on u.id = a.worker_id
      left join worker_profiles p on p.user_id = a.worker_id
      where co.owner_id = ${user.id} order by a.created_at desc`;
    return c.json({ applications });
  })
  .patch("/applications/:id", requireUser("employer"), async (c) => {
    const { stage } = StagePatch.parse(await c.req.json());
    const rows = await sql`
      update applications set stage = ${stage}, updated_at = now()
      where id = ${c.req.param("id")}
        and job_id in (select j.id from jobs j join companies co on co.id = j.company_id where co.owner_id = ${c.get("user").id})
      returning id, stage`;
    return rows.length ? c.json({ application: rows[0] }) : fail(c, 404, "not_found", "No application on your jobs with that id.");
  })
  .get("/saved", requireUser("worker"), async (c) => {
    const rows = await sql`select job_id from saved_jobs where user_id = ${c.get("user").id} order by created_at desc`;
    return c.json({ jobIds: rows.map((r) => r.jobId) });
  })
  .put("/saved/:jobId", requireUser("worker"), async (c) => {
    await sql`insert into saved_jobs (user_id, job_id) values (${c.get("user").id}, ${c.req.param("jobId")}) on conflict do nothing`;
    return c.json({ ok: true });
  })
  .delete("/saved/:jobId", requireUser("worker"), async (c) => {
    await sql`delete from saved_jobs where user_id = ${c.get("user").id} and job_id = ${c.req.param("jobId")}`;
    return c.json({ ok: true });
  });
