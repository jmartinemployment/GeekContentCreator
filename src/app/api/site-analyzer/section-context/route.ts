import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";

export async function GET(request: Request) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const analysisId = searchParams.get("analysisId");
  const gapTopic = searchParams.get("gapTopic");
  if (!analysisId || !gapTopic) {
    return NextResponse.json(
      { error: "analysisId and gapTopic required" },
      { status: 400 },
    );
  }

  const res = await fetch(
    `${apiConfig.baseUrl}/api/geek-content-creator/site-analyzer/${analysisId}/section-context?gapTopic=${encodeURIComponent(gapTopic)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: body.error || body.title || body.detail || "Failed" },
      { status: res.status },
    );
  }
  return NextResponse.json(body);
}
