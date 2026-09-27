import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/security";
import { localMode, ensureLocalData, testLoginEnabled } from "@/lib/local";

export async function POST(request: Request) {
  if (!testLoginEnabled) return NextResponse.json({ error: "Password login is disabled. Use Google sign-in." }, { status: 404 });
  const data = await request.json();
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  if (!name || name.length > 80) return NextResponse.json({ error: "Name must contain 1 to 80 characters." }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 8 || password.length > 128) return NextResponse.json({ error: "Password must contain 8 to 128 characters." }, { status: 400 });
  if (localMode) {
    const data = await ensureLocalData();
    if (data.users.some((user) => user.email === email)) return NextResponse.json({ error: "An account with this email already exists. Try signing in." }, { status: 409 });
    return NextResponse.json({ error: "Local testing uses the seeded test account." }, { status: 409 });
  }
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return NextResponse.json({ error: "An account with this email already exists. Try signing in." }, { status: 409 });
  const [user] = await db.insert(users).values({ id: crypto.randomUUID(), name, alias: name, email, passwordHash: await hashPassword(password) }).returning({ id: users.id, name: users.name, alias: users.alias, email: users.email });
  return NextResponse.json({ user }, { status: 201 });
}
