import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOpts } from "@/lib/auth/cookies";
import { authConfig } from "@/lib/config";

/**
 * Refreshes the access token before the request reaches any Server Component.
 *
 * Cookies cannot be written during Server Component rendering, so the refresh cannot live in
 * `getAccessToken`. It ran there anyway: the write threw, the surrounding catch swallowed it, and
 * the caller was bounced to `/api/auth/start` — a failed sign-in on every visit after the short
 * access cookie expired. Worse, GeekOAuth rotates refresh tokens, so each attempt consumed the
 * stored one and discarded its replacement, leaving the browser holding a revoked token.
 *
 * Proxy runs before rendering and can set response cookies, so the refresh belongs here.
 */
export async function proxy(request: NextRequest) {
  const hasAccess = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (hasAccess || !refresh) return NextResponse.next();

  let tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  try {
    const res = await fetch(authConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: authConfig.clientId,
        refresh_token: refresh,
      }).toString(),
      cache: "no-store",
    });
    if (!res.ok) {
      // The refresh token is spent or revoked. Clear it so the next hop is a clean sign-in
      // rather than another doomed refresh.
      const dead = NextResponse.next();
      dead.cookies.set(REFRESH_COOKIE, "", cookieOpts.clear);
      dead.cookies.set(ACCESS_COOKIE, "", cookieOpts.clear);
      return dead;
    }
    tokens = await res.json();
  } catch {
    // Network failure is not proof the session is dead — leave the cookie alone and let the
    // request through; the page will redirect to sign-in on its own if there is no token.
    return NextResponse.next();
  }

  // Hand the new token to this same request so the render sees it without a round trip.
  const headers = new Headers(request.headers);
  const jar = request.cookies;
  jar.set(ACCESS_COOKIE, tokens.access_token);
  if (tokens.refresh_token) jar.set(REFRESH_COOKIE, tokens.refresh_token);
  headers.set("cookie", jar.toString());

  const response = NextResponse.next({ request: { headers } });
  const maxAge = Math.max(30, Math.min(tokens.expires_in - 60, 60 * 10));
  response.cookies.set(ACCESS_COOKIE, tokens.access_token, { ...cookieOpts.access, maxAge });
  if (tokens.refresh_token) {
    response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, cookieOpts.refresh);
  }
  return response;
}

export const config = {
  // Only paths that need a session. Static assets and the auth routes must not trigger a refresh —
  // /api/auth/token in particular sets these cookies itself.
  matcher: ["/app/:path*", "/api/cw/:path*", "/api/site-analyzer/:path*"],
};
