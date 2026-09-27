import { NextResponse } from "next/server";
import { testLoginEnabled } from "@/lib/local";

export async function GET() {
  return NextResponse.json({
    google_enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    test_login_enabled: testLoginEnabled,
  });
}
