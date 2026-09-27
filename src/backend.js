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

export const supabaseConfigured = false;
export async function api(path, method = "GET", data) { return localApi(path, method, data); }
export async function subscribeToAuth() { return () => {}; }
