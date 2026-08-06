"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export function AuthCallbackClient() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const oauthError = params.get("error");
    if (oauthError) {
      setError(params.get("error_description") || oauthError);
      return;
    }
    if (!code) {
      setError("Missing authorization code");
      return;
    }

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (cancelled) return;
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || "Sign-in failed");
        return;
      }
      window.location.assign("/app/site-analyzer");
    })();

    return () => {
      cancelled = true;
    };
  }, [params]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium text-[var(--gcc-ink)]">
          Sign-in failed
        </h1>
        <p className="text-sm text-[var(--gcc-muted)]">{error}</p>
        <a
          href="/api/auth/start"
          className="rounded-md bg-[var(--gcc-ink)] px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-[var(--gcc-muted)]">
      Completing sign-in…
    </div>
  );
}
