import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOpts,
} from "@/lib/auth/cookies";
import {
  isSessionDeadError,
  refreshAccessToken,
} from "@/services/auth-tokens";

/**
 * Read-only session lookup, safe in Server Components.
 *
 * Cookies cannot be written during Server Component rendering (Next: "Setting cookies is not
 * supported during Server Component rendering"), so refreshing here is not an option — the write
 * throws, and a swallowed throw looks exactly like "no session", bouncing the user to sign-in.
 * `proxy.ts` refreshes ahead of the render instead.
 */
export const getAccessToken = cache(async (): Promise<string | null> => {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value ?? null;
});

/**
 * Refreshing variant for Route Handlers only, where writing cookies is allowed. Route Handlers
 * reached directly (not through a page navigation) can still find an expired access cookie.
 */
export async function getAccessTokenWithRefresh(): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(ACCESS_COOKIE)?.value;
  if (existing) return existing;

  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;

  try {
    const tokens = await refreshAccessToken(refresh);
    // GeekOAuth rotates refresh tokens: persist the replacement or the stored one is revoked.
    if (tokens.refresh_token) {
      jar.set(REFRESH_COOKIE, tokens.refresh_token, cookieOpts.refresh);
    }
    const maxAge = Math.max(30, Math.min(tokens.expires_in - 60, 60 * 10));
    jar.set(ACCESS_COOKIE, tokens.access_token, {
      ...cookieOpts.access,
      maxAge,
    });
    return tokens.access_token;
  } catch (error) {
    if (isSessionDeadError(error)) {
      jar.set(REFRESH_COOKIE, "", cookieOpts.clear);
      jar.set(ACCESS_COOKIE, "", cookieOpts.clear);
    }
    return null;
  }
}

export async function requireAccessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) redirect("/api/auth/start");
  return token;
}
