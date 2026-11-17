import { compare, hash } from "bcryptjs";
import { Hono } from "hono";
import postgres from "postgres";
import { z } from "zod";
import { issueToken, requireUser } from "../auth";
import { sql } from "../db";
import { fail, rateLimit } from "../http";

const Register = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  password: z.string().min(8, "Use at least 8 characters"),
  role: z.enum(["worker", "employer"]),
  displayName: z.string().trim().min(1).max(80),
  company: z.object({ nameEn: z.string().trim().min(1), nameJa: z.string().trim().min(1) }).optional(),
});
const Login = z.object({ email: z.email().transform((s) => s.toLowerCase()), password: z.string() });
const Profile = z.object({
  bioRaw: z.string().max(4000),
  tz: z.string().max(64),
  currency: z.string().length(3),
  jpLevel: z.number().int().min(0).max(5).optional(),
  languages: z.array(z.string().max(60)).max(10).optional(),
  skills: z.array(z.string().max(60)).max(20).optional(),
  hoursPerWeek: z.number().int().min(1).max(60).nullable().optional(),
});

type UserRow = { id: string; email: string; role: "worker" | "employer"; displayName: string };

export const authRoutes = new Hono()
  .post("/auth/register", rateLimit(10), async (c) => {
    const b = Register.parse(await c.req.json());
    if (b.role === "employer" && !b.company) return fail(c, 400, "company_required", "Add your company name in English and Japanese.");
    const passwordHash = await hash(b.password, 10);
    try {
      const user = await sql.begin(async (tx) => {
        const [u] = await tx<UserRow[]>`
          insert into users (email, password_hash, role, display_name)
          values (${b.email}, ${passwordHash}, ${b.role}, ${b.displayName})
          returning id, email, role, display_name`;
        if (b.role === "worker") await tx`insert into worker_profiles (user_id) values (${u.id})`;
        else await tx`insert into companies (owner_id, name_en, name_ja) values (${u.id}, ${b.company!.nameEn}, ${b.company!.nameJa})`;
        return u;
      });
      return c.json({ token: await issueToken(user), user }, 201);
    } catch (err) {
      if (err instanceof postgres.PostgresError && err.code === "23505") return fail(c, 409, "email_taken", "That email already has an account. Sign in instead.");
      throw err;
    }
  })
  .post("/auth/login", rateLimit(10), async (c) => {
    const b = Login.parse(await c.req.json());
    const [row] = await sql<(UserRow & { passwordHash: string })[]>`
      select id, email, role, display_name, password_hash from users where email = ${b.email}`;
    if (!row || !(await compare(b.password, row.passwordHash))) return fail(c, 401, "bad_login", "Email or password is wrong.");
    const { passwordHash: _, ...user } = row;
    return c.json({ token: await issueToken(user), user });
  })
  .get("/me", requireUser(), async (c) => {
    const { id } = c.get("user");
    const [user] = await sql<UserRow[]>`select id, email, role, display_name from users where id = ${id}`;
    if (!user) return fail(c, 401, "unauthorized", "This account no longer exists. Sign in again.");
    const [profile] = user.role === "worker" ? await sql`select * from worker_profiles where user_id = ${id}` : [];
    const [company] = user.role === "employer" ? await sql`select id, name_en, name_ja, verified_at from companies where owner_id = ${id}` : [];
    return c.json({ user, profile: profile ?? null, company: company ?? null });
  })
  .put("/me/profile", requireUser("worker"), async (c) => {
    const b = Profile.parse(await c.req.json());
    const { id } = c.get("user");
    const [profile] = await sql`
      update worker_profiles set
        bio_raw = ${b.bioRaw}, tz = ${b.tz}, currency = ${b.currency.toUpperCase()},
        jp_level = coalesce(${b.jpLevel ?? null}, jp_level),
        languages = coalesce(${b.languages ?? null}::text[], languages),
        skills = coalesce(${b.skills ?? null}::text[], skills),
        hours_per_week = ${b.hoursPerWeek === undefined ? sql`hours_per_week` : b.hoursPerWeek},
        updated_at = now()
      where user_id = ${id}
      returning *`;
    return c.json({ profile });
  });
