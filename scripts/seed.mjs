import postgres from "postgres";
import { randomBytes, scryptSync } from "node:crypto";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) throw new Error("DATABASE_URL, POSTGRES_URL_NON_POOLING, or POSTGRES_URL is required.");

const sql = postgres(url, { prepare: false, max: 1 });
const password = process.env.TEST_LOGIN_PASSWORD || "RunClub-test-2026!";
const salt = randomBytes(16).toString("hex");
const passwordHash = `${salt}:${scryptSync(password, Buffer.from(salt, "hex"), 64, { N: 16384, r: 8, p: 1 }).toString("hex")}`;

await sql`
  insert into "users" ("id", "name", "email", "alias", "password_hash")
  values ('local-test-user', 'Local test account', 'test@example.com', 'Test Runner', ${passwordHash})
  on conflict ("email") do update set "name" = excluded."name", "alias" = excluded."alias", "password_hash" = excluded."password_hash"
`;

const monday = new Date();
monday.setUTCHours(0, 0, 0, 0);
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const templates = [
  [0, 18, "The Monday reset", "Easy run", 6, 40, "6:00–6:30 /km", "Søerne, Dronning Louises Bro, Copenhagen", "A relaxed lap around the lakes. Meet on the bridge, ready to run."],
  [2, 18, "A little speed, a lot of fun", "Intervals", 8, 55, "Your own pace", "Fælledparken, Copenhagen", "2 km warm-up, then 6 × 400 m with 200 m easy jogging between efforts."],
  [4, 17, "Friday flow", "Tempo", 7, 45, "5:15–5:45 /km", "Kastellet, Copenhagen", "Start easy, settle into a comfortably hard effort for 20 minutes, then ease back down."],
  [5, 9, "The weekend wander", "Long run", 14, 90, "6:00–6:30 /km", "Dyrehaven, Klampenborg", "Fresh air, forest trails, and a little more time on our feet. Bring water."],
  [6, 10, "Easy like Sunday", "Recovery", 5, 35, "Conversation pace", "Amager Strandpark, Copenhagen", "An easy coastal loop. Walk breaks are welcome."],
];
for (const [day, hour, title, kind, distance, duration, pace, location, notes] of templates) {
  const start = new Date(monday); start.setUTCDate(start.getUTCDate() + day); start.setUTCHours(hour, 0, 0, 0);
  await sql`
    insert into "workouts" ("external_id", "title", "kind", "starts_at", "distance_km", "duration_minutes", "pace", "location", "notes", "translations")
    values (${`demo-seed-${day}`}, ${title}, ${kind}, ${start.toISOString()}, ${distance}, ${duration}, ${pace}, ${location}, ${notes}, ${sql.json({})})
    on conflict ("external_id") do update set "title" = excluded."title", "kind" = excluded."kind", "starts_at" = excluded."starts_at", "distance_km" = excluded."distance_km", "duration_minutes" = excluded."duration_minutes", "pace" = excluded."pace", "location" = excluded."location", "notes" = excluded."notes"
  `;
}
await sql.end();
console.log(`Seeded demo workouts and ${password === "RunClub-test-2026!" ? "the default" : "the configured"} test password.`);
