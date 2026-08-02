import { NextRequest } from "next/server";
import { getAccessToken } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";

/**
 * Proxy to GeekAPI Content Writer v2 controllers (merged into GeekAPI).
 * Requires the signed-in user's OAuth Bearer. Does not fall back to API key
 * when the user token is rejected — that masked auth failures.
 * Never exposes keys to the browser.
 */
async function proxy(
  request: NextRequest,
  path: string[],
): Promise<Response> {
  const targetUrl = new URL(`/${path.join("/")}`, apiConfig.baseUrl);
  targetUrl.search = request.nextUrl.search;

  const token = await getAccessToken();
  if (!token) {
    return Response.json(
      { error: "Unauthorized — sign in required" },
      { status: 401 },
    );
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const bufferedBody = hasBody ? await request.arrayBuffer() : undefined;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: bufferedBody,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

async function handler(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
