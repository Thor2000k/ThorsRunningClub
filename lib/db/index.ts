import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { databaseUrl } from "@/lib/env";

const client = postgres(databaseUrl || "postgres://localhost/thors_running_club", {
  prepare: false,
  max: 5,
});

export const db = drizzle(client, { schema });
export { client };
