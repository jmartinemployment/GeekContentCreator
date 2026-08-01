"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GeneratedContentSet } from "@/lib/content-writer/types";

const storageKey = (projectId: string) => `gcc.contentApproved.${projectId}`;

/**
 * Content Creator addition: operator content approval on CWV2 drafts.
 * Gates Repurpose (Mix). Distinct from CWV2 LLM review verdicts.
 */
export default function ContentApprovalPanel({
  projectId,
  result,
}: {
  projectId: string;
  result: GeneratedContentSet | null;
}) {
  const [approved, setApproved] = useState(false);

  const hasDraft =
    (result?.article?.wordCount ?? 0) > 0 ||
    result?.blog != null ||
    (result?.toolPosts?.length ?? 0) > 0;

  useEffect(() => {
    try {
      setApproved(sessionStorage.getItem(storageKey(projectId)) === "1");
    } catch {
      setApproved(false);
    }
  }, [projectId]);

  function approve() {
    try {
      sessionStorage.setItem(storageKey(projectId), "1");
    } catch {
      /* private mode */
    }
    setApproved(true);
  }

  function revoke() {
    try {
      sessionStorage.removeItem(storageKey(projectId));
    } catch {
      /* private mode */
    }
    setApproved(false);
  }

  if (!hasDraft) return null;

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Content approval</h2>
      <p className="mt-1 text-sm text-muted">
        Operator sign-off on the current drafts before Repurpose (Mix). Separate
        from automated review verdicts below.
      </p>

      {approved ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-green-800">
            Content approved for this session.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/app/projects/${projectId}/repurpose`}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
            >
              Repurpose (Mix)
            </Link>
            <button
              type="button"
              onClick={revoke}
              className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
            >
              Revoke approval
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={approve}
          className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Content approval
        </button>
      )}
    </section>
  );
}
