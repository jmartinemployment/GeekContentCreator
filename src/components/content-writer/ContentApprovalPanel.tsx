"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { GeneratedContentSet } from "@/lib/content-writer/types";
import {
  getProjectContentApproval,
  setProjectContentApproval,
} from "@/lib/content-writer/api";

/**
 * Content Creator addition: operator content approval on CWV2 drafts.
 * Source of truth is GeekAPI project approval — not browser localStorage.
 */
export default function ContentApprovalPanel({
  projectId,
  result,
}: {
  projectId: string;
  result: GeneratedContentSet | null;
}) {
  const [approved, setApproved] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasDraft =
    (result?.article?.wordCount ?? 0) > 0 ||
    result?.blog != null ||
    (result?.toolPosts?.length ?? 0) > 0;

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setError(null);
    getProjectContentApproval(projectId)
      .then((res) => {
        if (cancelled) return;
        setApproved(res.approved);
        setLoadState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setApproved(false);
        setLoadState("error");
        setError(e instanceof Error ? e.message : "Could not load approval state");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function approve() {
    setError(null);
    startTransition(async () => {
      try {
        await setProjectContentApproval(projectId, true);
        setApproved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Approval failed");
      }
    });
  }

  function revoke() {
    setError(null);
    startTransition(async () => {
      try {
        await setProjectContentApproval(projectId, false);
        setApproved(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Revoke failed");
      }
    });
  }

  if (!hasDraft) return null;

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Content approval</h2>
      <p className="mt-1 text-sm text-muted">
        Operator sign-off on the current drafts before Repurpose (Mix). Separate
        from automated review verdicts below.
      </p>

      {loadState === "loading" ? (
        <p className="mt-4 text-sm text-muted">Loading approval state…</p>
      ) : null}

      {loadState === "ready" && approved ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-green-800">Content approved.</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/app/projects/${projectId}/repurpose`}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
            >
              Repurpose (Mix)
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={revoke}
              className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
            >
              Revoke approval
            </button>
          </div>
        </div>
      ) : null}

      {loadState === "ready" && !approved ? (
        <button
          type="button"
          disabled={pending}
          onClick={approve}
          className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Content approval"}
        </button>
      ) : null}

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
