import { NextResponse } from "next/server";
import { currentUser, profileSummary } from "@/lib/server";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your profile." }, { status: 401 });
  const profile = await profileSummary(user.id);
  return NextResponse.json(profile);
}
