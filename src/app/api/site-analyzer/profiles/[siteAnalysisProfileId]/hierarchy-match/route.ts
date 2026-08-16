import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";

export async function GET(
  request: Request,
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

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword");
  if (!keyword?.trim()) {
    return NextResponse.json({ error: "keyword required" }, { status: 400 });
  }

  const res = await fetch(
    `${apiConfig.baseUrl}/api/geek-content-creator/site-analyzer/profiles/${encodeURIComponent(siteAnalysisProfileId)}/hierarchy-match?keyword=${encodeURIComponent(keyword.trim())}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: body.error || body.title || body.detail || "Hierarchy match failed" },
      { status: res.status },
    );
  }

  return NextResponse.json(body);
}
