import { NextResponse } from "next/server";
import { getAccessTokenWithRefresh } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const token = await getAccessTokenWithRefresh();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const res = await fetch(
    `${apiConfig.baseUrl}/api/geek-content-creator/site-analyzer/${encodeURIComponent(id)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: body.error || body.title || body.detail || "Status failed" },
      { status: res.status },
    );
  }

  return NextResponse.json(body);
}
