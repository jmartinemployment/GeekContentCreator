import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOpts } from "@/lib/auth/cookies";
import { authConfig } from "@/lib/config";

export async function POST() {
  const res = NextResponse.redirect(new URL("/", authConfig.appUrl), 303);
  res.cookies.set(REFRESH_COOKIE, "", cookieOpts.clear);
  res.cookies.set(ACCESS_COOKIE, "", cookieOpts.clear);
  return res;
}
