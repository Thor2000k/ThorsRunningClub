import { defineConfig } from "drizzle-kit";
import { migrationDatabaseUrl } from "./lib/env";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: migrationDatabaseUrl || "postgres://localhost/thors_running_club" },
});
