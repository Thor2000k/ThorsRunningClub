import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/security";

export async function POST(request: Request) {
  if (process.env.ALLOW_TEST_LOGIN !== "true") return NextResponse.json({ error: "Password login is disabled. Use Google sign-in." }, { status: 404 });
  const data = await request.json();
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  return NextResponse.json({ user: { id: user.id, name: user.name, alias: user.alias, email: user.email } });
}
