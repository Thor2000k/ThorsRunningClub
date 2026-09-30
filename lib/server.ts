import { and, asc, desc, eq, inArray, gte, lte, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { attendance, comments, users, workouts } from "@/lib/db/schema";
import { localAddComment, localComments, localMode, localProfile, localUser, localWorkouts, localUpsert } from "@/lib/local";
import { normalizeRouteMap } from "@/lib/route-map";

export async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (localMode) {
    const user = await localUser(session.user.id);
    return user ? { id: user.id, name: user.name, alias: user.alias, email: user.email } : null;
  }
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
    route_url: row.routeUrl,
    starts_at: row.startsAt.toISOString(),
    distance_km: Number(row.distanceKm),
    duration_minutes: row.durationMinutes,
    attendees: attendeeCount,
    joined,
  };
}

export async function listWorkouts(userId?: string | null) {
  if (localMode) return localWorkouts(userId);
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
    ...(Object.hasOwn(value, "route_url") ? { routeUrl: normalizeRouteMap(value.route_url) } : {}),
  };
}

export async function upsertWorkouts(values: any[]) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100) throw new Error("workouts must be an array containing 1 to 100 workouts.");
  const parsed = values.map(validateWorkout);
  if (new Set(parsed.map((item) => item.externalId)).size !== parsed.length) throw new Error("external_id values must be unique within the batch.");
  if (localMode) return localUpsert(parsed.map((item) => ({ ...item, external_id: item.externalId, starts_at: item.startsAt.toISOString(), distance_km: Number(item.distanceKm), duration_minutes: item.durationMinutes, ...(item.routeUrl !== undefined ? { route_url: item.routeUrl } : {}) })));
  await db.transaction(async (tx) => {
    for (const workout of parsed) {
      await tx.insert(workouts).values(workout).onConflictDoUpdate({ target: workouts.externalId, set: workout });
    }
  });
  return { imported: parsed.length };
}

export async function listComments(workoutId: number, limit?: number) {
  if (localMode) return localComments(workoutId, limit);
  const rows = await db.select({ id: comments.id, workoutId: comments.workoutId, body: comments.body, createdAt: comments.createdAt, author: users.alias })
    .from(comments).innerJoin(users, eq(comments.userId, users.id)).where(eq(comments.workoutId, workoutId)).orderBy(desc(comments.createdAt));
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}

export async function addComment(userId: string, workoutId: number, body: string) {
  if (localMode) return localAddComment(userId, workoutId, body);
  const [workout] = await db.select({ id: workouts.id }).from(workouts).where(eq(workouts.id, workoutId)).limit(1);
  if (!workout) return null;
  const [comment] = await db.insert(comments).values({ workoutId, userId, body }).returning({ id: comments.id, workoutId: comments.workoutId, body: comments.body, createdAt: comments.createdAt });
  const [author] = await db.select({ author: users.alias }).from(users).where(eq(users.id, userId)).limit(1);
  return { ...comment, author: author?.author || "Runner" };
}

export async function profileSummary(userId: string) {
  if (localMode) return localProfile(userId);
  const user = await currentUser();
  if (!user || user.id !== userId) return null;
  const joined = await db.select({
    id: workouts.id, external_id: workouts.externalId, title: workouts.title, kind: workouts.kind,
    starts_at: workouts.startsAt, distance_km: workouts.distanceKm, duration_minutes: workouts.durationMinutes,
    pace: workouts.pace, location: workouts.location, notes: workouts.notes, translations: workouts.translations, route_url: workouts.routeUrl,
  }).from(attendance).innerJoin(workouts, eq(attendance.workoutId, workouts.id)).where(eq(attendance.userId, userId)).orderBy(desc(workouts.startsAt));
  const participantRows = joined.length ? await db.select({ workoutId: attendance.workoutId, alias: users.alias }).from(attendance).innerJoin(users, eq(attendance.userId, users.id)).where(inArray(attendance.workoutId, joined.map((workout) => workout.id))) : [];
  const participantMap = new Map<number, string[]>();
  for (const row of participantRows) participantMap.set(row.workoutId, [...(participantMap.get(row.workoutId) || []), row.alias || "Runner"]);
  const authored = await db.select({ count: sql<number>`count(*)::int` }).from(comments).where(eq(comments.userId, userId));
  const completed = joined.filter((workout) => workout.starts_at <= new Date());
  const upcoming = joined.filter((workout) => workout.starts_at > new Date()).reverse();
  const serialize = (workout: typeof joined[number]) => ({ ...workout, starts_at: workout.starts_at.toISOString(), distance_km: Number(workout.distance_km), joined: true, attendees: (participantMap.get(workout.id) || []).length, participants: participantMap.get(workout.id) || [] });
  return { user, stats: { completed: completed.length, upcoming: upcoming.length, distance: completed.reduce((total, workout) => total + Number(workout.distance_km), 0), comments: Number(authored[0]?.count || 0) }, completed: completed.map(serialize), upcoming: upcoming.map(serialize) };
}
