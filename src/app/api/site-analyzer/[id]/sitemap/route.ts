import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";

/**
 * Downloads the generated sitemap.xml for a Site Analyzer run. Proxies to GeekAPI, which
 * delegates to Geek-SEO — the document is rebuilt from the current step-1 URL inventory on
 * every request, so it always reflects the latest Analyze. No dedicated Sitemap page, no
 * FTP/root upload: this route only ever returns the XML for download.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const res = await fetch(
    `${apiConfig.baseUrl}/api/geek-content-creator/site-analyzer/${encodeURIComponent(id)}/sitemap`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: body.error || body.title || body.detail || "Sitemap download failed" },
      { status: res.status },
    );
  }

  const xml = await res.text();
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": "attachment; filename=\"sitemap.xml\"",
    },
  });
}
