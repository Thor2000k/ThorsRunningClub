import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendance, workouts } from "@/lib/db/schema";
import { requireUser } from "@/lib/server";
import { localJoin, localLeave, localMode } from "@/lib/local";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = Number((await params).id);
    if (localMode) {
      const result = await localJoin(user.id, id);
      if (result === "missing") return NextResponse.json({ error: "Workout not found." }, { status: 404 });
      if (result === "past") return NextResponse.json({ error: "This run has already started." }, { status: 409 });
      return NextResponse.json({ joined: true });
    }
    const [workout] = await db.select().from(workouts).where(eq(workouts.id, id)).limit(1);
    if (!workout) return NextResponse.json({ error: "Workout not found." }, { status: 404 });
    if (workout.startsAt <= new Date()) return NextResponse.json({ error: "This run has already started." }, { status: 409 });
    await db.insert(attendance).values({ userId: user.id, workoutId: id }).onConflictDoNothing();
    return NextResponse.json({ joined: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Database operation failed." }, { status: error instanceof Error && error.message.startsWith("Sign in") ? 401 : error instanceof Error && error.message === "This run has already started." ? 409 : error instanceof Error && error.message === "Workout not found." ? 404 : 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (localMode) { await localLeave(user.id, Number((await params).id)); return NextResponse.json({ joined: false }); }
    const [workout] = await db.select().from(workouts).where(eq(workouts.id, Number((await params).id))).limit(1);
    if (!workout) return NextResponse.json({ error: "Workout not found." }, { status: 404 });
    if (workout.startsAt <= new Date()) return NextResponse.json({ error: "This run has already started." }, { status: 409 });
    await db.delete(attendance).where(and(eq(attendance.userId, user.id), eq(attendance.workoutId, Number((await params).id))));
    return NextResponse.json({ joined: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Database operation failed." }, { status: error instanceof Error && error.message.startsWith("Sign in") ? 401 : error instanceof Error && error.message === "This run has already started." ? 409 : error instanceof Error && error.message === "Workout not found." ? 404 : 500 });
  }
}
