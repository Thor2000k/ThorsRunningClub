import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashPassword } from "@/lib/security";
import { databaseUrl } from "@/lib/env";

export const localMode = process.env.NODE_ENV !== "production" && !databaseUrl;
export const testLoginEnabled = process.env.ALLOW_TEST_LOGIN === "true" || (process.env.NODE_ENV !== "production" && process.env.ALLOW_TEST_LOGIN !== "false");
const file = join(process.cwd(), "data", "next-local.json");

type LocalUser = { id: string; name: string; alias: string; email: string; passwordHash: string };
type LocalWorkout = { id: number; external_id: string; title: string; kind: string; starts_at: string; distance_km: number; duration_minutes: number; pace: string; location: string; notes: string; translations: Record<string, Record<string, string>>; attendees: number; joined: boolean };
type LocalComment = { id: number; workoutId: number; userId: string; body: string; createdAt: string };
type LocalData = { users: LocalUser[]; workouts: LocalWorkout[]; attendance: { userId: string; workoutId: number }[]; comments?: LocalComment[] };

function read(): LocalData {
  if (!existsSync(file)) return { users: [], workouts: [], attendance: [], comments: [] };
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.comments ||= [];
  return data;
}

function write(data: LocalData) {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function demoWorkouts(): LocalWorkout[] {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const templates = [
    [0, 18, "The Monday reset", "Easy run", 6, 40, "6:00–6:30 /km", "Søerne, Dronning Louises Bro, Copenhagen", "A relaxed lap around the lakes. Meet on the bridge, ready to run."],
    [2, 18, "A little speed, a lot of fun", "Intervals", 8, 55, "Your own pace", "Fælledparken, Copenhagen", "2 km warm-up, then 6 × 400 m with 200 m easy jogging between efforts."],
    [4, 17, "Friday flow", "Tempo", 7, 45, "5:15–5:45 /km", "Kastellet, Copenhagen", "Start easy, settle into a comfortably hard effort for 20 minutes, then ease back down."],
    [5, 9, "The weekend wander", "Long run", 14, 90, "6:00–6:30 /km", "Dyrehaven, Klampenborg", "Fresh air, forest trails, and a little more time on our feet. Bring water."],
    [6, 10, "Easy like Sunday", "Recovery", 5, 35, "Conversation pace", "Amager Strandpark, Copenhagen", "An easy coastal loop. Walk breaks are welcome."],
  ] as const;
  return templates.map(([day, hour, title, kind, distance, duration, pace, location, notes], index) => {
    const start = new Date(monday); start.setDate(start.getDate() + day); start.setHours(hour, 0, 0, 0);
    return { id: index + 1, external_id: `local-demo-${index}`, title, kind, starts_at: start.toISOString(), distance_km: distance, duration_minutes: duration, pace, location, notes, translations: {}, attendees: 0, joined: false };
  });
}

export async function ensureLocalData() {
  const data = read();
  let changed = false;
  if (process.env.SEED_DEMO !== "false" && data.workouts.length === 0) { data.workouts = demoWorkouts(); changed = true; }
  if (testLoginEnabled && !data.users.some((user) => user.email === "test@example.com")) {
    data.users.push({ id: "local-test-user", name: "Local test account", alias: "Test Runner", email: "test@example.com", passwordHash: await hashPassword("RunClub-test-2026!") });
    changed = true;
  }
  if (changed) write(data);
  return data;
}

export async function localUser(id: string) { return (await ensureLocalData()).users.find((user) => user.id === id) || null; }
export async function localUserByEmail(email: string) { return (await ensureLocalData()).users.find((user) => user.email === email) || null; }
export async function updateLocalAlias(id: string, alias: string) { const data = await ensureLocalData(); const user = data.users.find((item) => item.id === id); if (!user) return null; user.alias = alias; write(data); return user; }
export async function localWorkouts(userId?: string | null) {
  const data = await ensureLocalData();
  return data.workouts.map((workout) => ({ ...workout, attendees: data.attendance.filter((item) => item.workoutId === workout.id).length, joined: Boolean(userId && data.attendance.some((item) => item.userId === userId && item.workoutId === workout.id)) })).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
export async function localComments(workoutId: number, limit?: number) {
  const data = await ensureLocalData();
  const rows = (data.comments || []).filter((comment) => comment.workoutId === workoutId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows.slice(0, limit).map((comment) => ({ ...comment, author: data.users.find((user) => user.id === comment.userId)?.alias || "Runner" }));
}
export async function localAddComment(userId: string, workoutId: number, body: string) {
  const data = await ensureLocalData();
  if (!data.workouts.some((workout) => workout.id === workoutId)) return null;
  const comment = { id: Math.max(0, ...(data.comments || []).map((item) => item.id)) + 1, workoutId, userId, body, createdAt: new Date().toISOString() };
  data.comments ||= []; data.comments.push(comment); write(data);
  return { ...comment, author: data.users.find((user) => user.id === userId)?.alias || "Runner" };
}
export async function localProfile(userId: string) {
  const data = await ensureLocalData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) return null;
  const joinedIds = new Set(data.attendance.filter((item) => item.userId === userId).map((item) => item.workoutId));
  const joined = data.workouts.filter((workout) => joinedIds.has(workout.id)).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const completed = joined.filter((workout) => new Date(workout.starts_at) <= new Date());
  const upcoming = joined.filter((workout) => new Date(workout.starts_at) > new Date()).reverse();
  return { user: { id: user.id, name: user.name, alias: user.alias, email: user.email }, stats: { completed: completed.length, upcoming: upcoming.length, distance: completed.reduce((total, workout) => total + workout.distance_km, 0), comments: (data.comments || []).filter((comment) => comment.userId === userId).length }, completed, upcoming };
}
export async function localJoin(userId: string, workoutId: number) { const data = await ensureLocalData(); const workout = data.workouts.find((item) => item.id === workoutId); if (!workout) return "missing"; if (new Date(workout.starts_at) <= new Date()) return "past"; if (!data.attendance.some((item) => item.userId === userId && item.workoutId === workoutId)) data.attendance.push({ userId, workoutId }); write(data); return "joined"; }
export async function localLeave(userId: string, workoutId: number) { const data = await ensureLocalData(); data.attendance = data.attendance.filter((item) => !(item.userId === userId && item.workoutId === workoutId)); write(data); }
export async function localUpsert(rows: any[]) { const data = await ensureLocalData(); for (const row of rows) { const index = data.workouts.findIndex((item) => item.external_id === row.external_id); const value = { ...row, id: index >= 0 ? data.workouts[index].id : Math.max(0, ...data.workouts.map((item) => item.id)) + 1, attendees: index >= 0 ? data.workouts[index].attendees : 0, joined: false }; if (index >= 0) data.workouts[index] = value; else data.workouts.push(value); } write(data); return { imported: rows.length }; }
