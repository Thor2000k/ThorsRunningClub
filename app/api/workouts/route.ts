import { NextResponse } from "next/server";
import { currentUser, listWorkouts, upsertWorkouts } from "@/lib/server";

export async function GET() {
  try {
    const user = await currentUser();
    return NextResponse.json({ workouts: await listWorkouts(user?.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Database operation failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!process.env.WORKOUT_IMPORT_TOKEN || authorization !== `Bearer ${process.env.WORKOUT_IMPORT_TOKEN}`) return NextResponse.json({ error: "A valid import token is required." }, { status: 401 });
  try {
    const body = await request.json();
    return NextResponse.json(await upsertWorkouts(body.workouts));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid workout batch." }, { status: 400 });
  }
}
