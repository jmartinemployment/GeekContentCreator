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
        nicheProfileId: body.nicheProfileId ?? null,
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

  // Prefer gaps from analyze response; fall back to gaps endpoint for older APIs.
  let gaps = Array.isArray(analysis.gaps) ? analysis.gaps : null;
  if (!gaps) {
    const gapsRes = await fetch(
      `${apiConfig.baseUrl}/api/geek-content-creator/site-analyzer/${analysis.id}/gaps`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    gaps = gapsRes.ok ? await gapsRes.json() : [];
  }

  return NextResponse.json({ ...analysis, gaps });
}
