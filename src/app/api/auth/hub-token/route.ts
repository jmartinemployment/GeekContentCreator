import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/session";

/** Short-lived JWT for the Geek-SEO SignalR hub (browser cannot read the httpOnly cookie). */
export async function GET() {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ accessToken: token });
}
