import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";

export async function GET(request: Request) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");
  if (!domain?.trim()) {
    return NextResponse.json({ error: "domain required" }, { status: 400 });
  }
  const limit = searchParams.get("limit") ?? "50";
  const res = await fetch(
    `${apiConfig.baseUrl}/api/geek-content-creator/site-analyzer/profiles/by-domain?domain=${encodeURIComponent(domain.trim())}&limit=${encodeURIComponent(limit)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: body.error || body.title || body.detail || "Failed to list site_analysis_profiles by domain" },
      { status: res.status },
    );
  }

  return NextResponse.json(body);
}
