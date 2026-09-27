import { NextResponse } from "next/server";
import { upsertWorkouts } from "@/lib/server";

export async function POST(request: Request) {
  if (!process.env.WORKOUT_IMPORT_TOKEN || request.headers.get("authorization") !== `Bearer ${process.env.WORKOUT_IMPORT_TOKEN}`) return NextResponse.json({ error: "A valid import token is required." }, { status: 401 });
  try {
    const body = await request.json();
    return NextResponse.json(await upsertWorkouts(body.workouts));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid workout batch." }, { status: 400 });
  }
}
