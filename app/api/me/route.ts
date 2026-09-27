import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { currentUser } from "@/lib/server";

export async function GET() { return NextResponse.json({ user: await currentUser() }); }

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to edit your alias." }, { status: 401 });
  const { alias } = await request.json();
  if (typeof alias !== "string" || alias.trim().length < 1 || alias.trim().length > 80) return NextResponse.json({ error: "Alias must contain 1 to 80 characters." }, { status: 400 });
  const [updated] = await db.update(users).set({ alias: alias.trim() }).where(eq(users.id, user.id)).returning({ id: users.id, name: users.name, alias: users.alias, email: users.email });
  return NextResponse.json({ user: updated });
}
