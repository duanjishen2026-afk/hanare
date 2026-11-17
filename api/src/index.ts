import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ZodError } from "zod";
import { corsOrigins, env } from "./env";
import { fail } from "./http";
import { aiRoutes } from "./routes/ai";
import { applicationRoutes } from "./routes/applications";
import { authRoutes } from "./routes/auth";
import { jobRoutes } from "./routes/jobs";
import { metaRoutes } from "./routes/meta";

const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: corsOrigins,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  }),
);

app.route("/api", metaRoutes);
app.route("/api", authRoutes);
app.route("/api", jobRoutes);
app.route("/api", applicationRoutes);
app.route("/api", aiRoutes);

app.notFound((c) => fail(c, 404, "not_found", "No such endpoint."));
app.onError((err, c) => {
  if (err instanceof ZodError) {
    return fail(c, 400, "invalid_input", err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  if (err instanceof SyntaxError) return fail(c, 400, "invalid_json", "The request body is not valid JSON.");
  console.error(err);
  return fail(c, 500, "server_error", "Something went wrong on our side. Try again.");
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => console.log(`Hanare API listening on :${info.port}`));
