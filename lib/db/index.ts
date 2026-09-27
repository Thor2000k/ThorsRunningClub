import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
const client = postgres(connectionString || "postgres://localhost/thors_running_club", {
  prepare: false,
  max: 5,
});

export const db = drizzle(client, { schema });
export { client };
