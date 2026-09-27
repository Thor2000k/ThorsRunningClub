export const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || "";
export const migrationDatabaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

export function assertProductionDatabase() {
  if (process.env.NODE_ENV === "production" && !databaseUrl) throw new Error("DATABASE_URL is missing. Add DATABASE_URL (or POSTGRES_URL) to the Vercel Production environment.");
}
