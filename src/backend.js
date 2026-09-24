import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

const localApi = async (path, method = "GET", data) => {
  const response = await fetch(`/api${path}`, { method, headers: { "Content-Type": "application/json" }, ...(data !== undefined && { body: JSON.stringify(data) }) });
  let result;
  try { result = await response.json(); } catch { throw new Error("The server is unavailable. Please try again shortly."); }
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
};

function fail(error) { if (error) throw new Error(error.message || "Something went wrong. Please try again."); }

async function currentProfile() {
  const { data: { user }, error } = await supabase.auth.getUser();
  fail(error);
  if (!user) return null;
  const { data: profile, error: profileError } = await supabase.from("profiles").select("alias,display_name").eq("id", user.id).maybeSingle();
  fail(profileError);
  return { id: user.id, email: user.email, name: profile?.display_name || user.user_metadata?.full_name || user.email.split("@")[0], alias: profile?.alias || user.user_metadata?.full_name || user.email.split("@")[0] };
}

async function workoutsForUser() {
  const user = await currentProfile();
  const { data: workouts, error } = await supabase.from("workouts").select("*").order("starts_at");
  fail(error);
  const { data: attendance, error: attendanceError } = await supabase.from("attendance").select("workout_id");
  fail(attendanceError);
  const { data: counts, error: countError } = await supabase.from("workout_attendee_counts").select("workout_id,attendees");
  fail(countError);
  return { user, workouts: (workouts || []).map(workout => {
    const count = (counts || []).find(item => item.workout_id === workout.id);
    return { ...workout, attendees: count?.attendees || 0, joined: Boolean(user && (attendance || []).some(item => item.workout_id === workout.id)) };
  }) };
}

export async function api(path, method = "GET", data) {
  if (!supabaseConfigured) return localApi(path, method, data);
  if (path === "/auth/config") return { google_enabled: true, test_login_enabled: false };
  if (path === "/auth/google/start") {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    fail(error); return { ok: true };
  }
  if (path === "/me" && method === "GET") return { user: await currentProfile() };
  if (path === "/me" && method === "PATCH") {
    const user = await currentProfile();
    if (!user) throw new Error("Sign in to edit your alias.");
    const alias = data?.alias;
    if (typeof alias !== "string" || alias.trim().length < 1 || alias.trim().length > 80) throw new Error("Alias must contain 1 to 80 characters.");
    const { data: profile, error } = await supabase.from("profiles").upsert({ id: user.id, alias: alias.trim(), display_name: user.name }).select("alias,display_name").single();
    fail(error); return { user: { ...user, alias: profile.alias } };
  }
  if (path === "/workouts" && method === "GET") return workoutsForUser();
  const attendanceMatch = path.match(/^\/workouts\/(\d+)\/attendance$/);
  if (attendanceMatch && (method === "POST" || method === "DELETE")) {
    const user = await currentProfile();
    if (!user) throw new Error("Sign in to join a run.");
    const workoutId = Number(attendanceMatch[1]);
    if (method === "POST") {
      const { error } = await supabase.from("attendance").insert({ user_id: user.id, workout_id: workoutId });
      fail(error);
    } else {
      const { error } = await supabase.from("attendance").delete().eq("user_id", user.id).eq("workout_id", workoutId);
      fail(error);
    }
    return { joined: method === "POST" };
  }
  if (path === "/logout" && method === "POST") { const { error } = await supabase.auth.signOut(); fail(error); return { ok: true }; }
  return localApi(path, method, data);
}

export async function subscribeToAuth(callback) {
  if (!supabaseConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange(() => callback());
  return () => data.subscription.unsubscribe();
}
