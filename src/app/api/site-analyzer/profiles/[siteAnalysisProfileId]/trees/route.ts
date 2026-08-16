import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";

export async function GET(
  _request: Request,
  context: { params: Promise<{ siteAnalysisProfileId: string }> },
) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteAnalysisProfileId } = await context.params;
  if (!siteAnalysisProfileId) {
    return NextResponse.json({ error: "siteAnalysisProfileId required" }, { status: 400 });
  }

  const res = await fetch(
    `${apiConfig.baseUrl}/api/geek-content-creator/site-analyzer/profiles/${encodeURIComponent(siteAnalysisProfileId)}/trees`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: body.error || body.title || body.detail || "Failed to load trees" },
      { status: res.status },
    );
  }

  return NextResponse.json(body);
}
