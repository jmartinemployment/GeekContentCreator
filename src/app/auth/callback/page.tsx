import { Suspense } from "react";
import { AuthCallbackClient } from "./callback-client";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-[var(--gcc-muted)]">
          Completing sign-in…
        </div>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
