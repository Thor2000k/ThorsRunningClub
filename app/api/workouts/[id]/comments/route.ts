import { NextResponse } from "next/server";
import { addComment, listComments, requireUser } from "@/lib/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const workoutId = Number((await params).id);
    const comments = await listComments(workoutId);
    return NextResponse.json({ comments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load comments." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const body = await request.json();
    if (typeof body.body !== "string" || body.body.trim().length < 1 || body.body.trim().length > 500) return NextResponse.json({ error: "Comment must contain 1 to 500 characters." }, { status: 400 });
    const comment = await addComment(user.id, Number((await params).id), body.body.trim());
    if (!comment) return NextResponse.json({ error: "Workout not found." }, { status: 404 });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save comment." }, { status: error instanceof Error && error.message.startsWith("Sign in") ? 401 : 500 });
  }
}
