import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";

export async function POST(request: Request) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const res = await fetch(
    `${apiConfig.baseUrl}/api/geek-content-creator/site-analyzer/analyze`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domain: body.domain,
        seedTopic: body.seedTopic ?? null,
        // Always force a new Geek-SEO run from this UI — never return a cached ready analysis.
        force: true,
      }),
      cache: "no-store",
    },
  );

  const analysis = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: analysis.error || analysis.title || analysis.detail || "Analyze failed" },
      { status: res.status },
    );
  }

  if (!analysis?.id) {
    return NextResponse.json(
      { error: "Analyze response missing analysis id" },
      { status: 502 },
    );
  }

  return NextResponse.json(analysis);
}
