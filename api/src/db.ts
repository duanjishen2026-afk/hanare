import postgres from "postgres";
import { env } from "./env";

// prepare:false keeps this working behind Supabase's transaction pooler (port 6543) as well.
// Columns come back camelCase (title_en -> titleEn), which is what the frontend reads.
export const sql = postgres(env.DATABASE_URL, {
  max: 5,
  prepare: false,
  transform: { column: { from: postgres.toCamel } },
});
