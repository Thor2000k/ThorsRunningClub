import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { attendance, users, workouts } from "@/lib/db/schema";

export async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const [user] = await db.select({ id: users.id, name: users.name, alias: users.alias, email: users.email })
    .from(users).where(eq(users.id, session.user.id)).limit(1);
  return user || null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("Sign in to join a run.");
  return user;
}

export function serializeWorkout(row: typeof workouts.$inferSelect, attendeeCount = 0, joined = false) {
  return {
    ...row,
    external_id: row.externalId,
    starts_at: row.startsAt.toISOString(),
    distance_km: Number(row.distanceKm),
    duration_minutes: row.durationMinutes,
    attendees: attendeeCount,
    joined,
  };
}

export async function listWorkouts(userId?: string | null) {
  const rows = await db.select().from(workouts).orderBy(asc(workouts.startsAt));
  const counts = await db.select({ workoutId: attendance.workoutId, attendees: sql<number>`count(*)::int` })
    .from(attendance).groupBy(attendance.workoutId);
  const joined = userId
    ? await db.select({ workoutId: attendance.workoutId }).from(attendance).where(eq(attendance.userId, userId))
    : [];
  const countMap = new Map(counts.map((item) => [item.workoutId, Number(item.attendees)]));
  const joinedSet = new Set(joined.map((item) => item.workoutId));
  return rows.map((row) => serializeWorkout(row, countMap.get(row.id) || 0, joinedSet.has(row.id)));
}

export function validateWorkout(value: any) {
  if (!value || typeof value !== "object") throw new Error("Each workout must be an object.");
  const required = ["external_id", "title", "kind", "starts_at", "distance_km", "duration_minutes", "pace", "location"];
  for (const field of required) if (value[field] === undefined || value[field] === null || value[field] === "") throw new Error(`${field} is required.`);
  if (!["Easy run", "Intervals", "Tempo", "Long run", "Recovery"].includes(value.kind)) throw new Error("Invalid workout kind.");
  const startsAt = new Date(value.starts_at);
  if (Number.isNaN(startsAt.getTime()) || !/[zZ]|[+-]\d\d:\d\d$/.test(value.starts_at)) throw new Error("starts_at must include a timezone offset.");
  if (!(Number(value.distance_km) > 0 && Number(value.distance_km) <= 500)) throw new Error("distance_km must be between 0 and 500.");
  if (!Number.isInteger(Number(value.duration_minutes)) || Number(value.duration_minutes) < 1 || Number(value.duration_minutes) > 10080) throw new Error("duration_minutes must be a positive integer.");
  return {
    externalId: String(value.external_id), title: String(value.title), kind: String(value.kind), startsAt,
    distanceKm: String(value.distance_km), durationMinutes: Number(value.duration_minutes), pace: String(value.pace),
    location: String(value.location), notes: String(value.notes || ""), translations: value.translations || {},
  };
}

export async function upsertWorkouts(values: any[]) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100) throw new Error("workouts must be an array containing 1 to 100 workouts.");
  const parsed = values.map(validateWorkout);
  if (new Set(parsed.map((item) => item.externalId)).size !== parsed.length) throw new Error("external_id values must be unique within the batch.");
  await db.transaction(async (tx) => {
    for (const workout of parsed) {
      await tx.insert(workouts).values(workout).onConflictDoUpdate({ target: workouts.externalId, set: workout });
    }
  });
  return { imported: parsed.length };
}
