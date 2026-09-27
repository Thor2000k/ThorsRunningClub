import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    google_enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    test_login_enabled: process.env.ALLOW_TEST_LOGIN === "true",
  });
}
