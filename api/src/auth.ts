import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import { env } from "./env";
import { fail } from "./http";

export type Role = "worker" | "employer";
export type AuthUser = { id: string; role: Role };
export type AuthEnv = { Variables: { user: AuthUser } };

const WEEK = 60 * 60 * 24 * 7;

export const issueToken = (u: AuthUser) =>
  sign({ sub: u.id, role: u.role, exp: Math.floor(Date.now() / 1000) + WEEK }, env.JWT_SECRET, "HS256");

// Returns the signed-in user, or null for anonymous requests and bad tokens.
export async function readUser(authorization: string | undefined): Promise<AuthUser | null> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  try {
    const p = await verify(token, env.JWT_SECRET, "HS256");
    if (typeof p.sub === "string" && (p.role === "worker" || p.role === "employer")) return { id: p.sub, role: p.role };
  } catch {
    // expired or tampered token: treat as signed out
  }
  return null;
}

export const requireUser = (role?: Role) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const user = await readUser(c.req.header("Authorization"));
    if (!user) return fail(c, 401, "unauthorized", "Sign in to continue.");
    if (role && user.role !== role) return fail(c, 403, "forbidden", `This needs ${role === "employer" ? "an employer" : "a worker"} account.`);
    c.set("user", user);
    await next();
  });
