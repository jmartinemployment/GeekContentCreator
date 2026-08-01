import { NextRequest } from "next/server";
import { getAccessToken } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";

/**
 * Proxy to GeekAPI Content Writer v2 controllers (merged into GeekAPI).
 * Prefer the signed-in user's OAuth Bearer; fall back to GEEK_BACKEND_API_KEY.
 * Never exposes keys to the browser.
 */
async function proxy(
  request: NextRequest,
  path: string[],
): Promise<Response> {
  const targetUrl = new URL(`/${path.join("/")}`, apiConfig.baseUrl);
  targetUrl.search = request.nextUrl.search;

  const token = await getAccessToken();
  const apiKey = process.env.GEEK_BACKEND_API_KEY?.trim();
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const bufferedBody = hasBody ? await request.arrayBuffer() : undefined;

  async function forward(auth: "bearer" | "apikey"): Promise<Response> {
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);

    if (auth === "bearer" && token) {
      headers.set("Authorization", `Bearer ${token}`);
    } else if (auth === "apikey" && apiKey) {
      headers.set("X-API-Key", apiKey);
    } else {
      return Response.json(
        { error: "Unauthorized — sign in or configure GEEK_BACKEND_API_KEY" },
        { status: 401 },
      );
    }

    return fetch(targetUrl, {
      method: request.method,
      headers,
      body: bufferedBody,
      redirect: "manual",
      cache: "no-store",
    });
  }

  let response: Response;
  if (token) {
    response = await forward("bearer");
    if (response.status === 401 && apiKey) {
      response = await forward("apikey");
    }
  } else if (apiKey) {
    response = await forward("apikey");
  } else {
    return Response.json(
      { error: "Unauthorized — sign in or configure GEEK_BACKEND_API_KEY" },
      { status: 401 },
    );
  }

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

/** CWV2 generate steps can run several minutes. */
export const maxDuration = 300;
