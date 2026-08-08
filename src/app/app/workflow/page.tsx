"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkflowGate } from "@/components/WorkflowGate";
import { clearSiteSectionHandoff, readWorkflowClientHandoff } from "@/lib/site-section-storage";
import ContentBriefPanel from "@/components/content-creator/ContentBriefPanel";
import Link from "next/link";

export default function WorkflowPage() {
  const router = useRouter();
  const { workflowUnlocked } = useWorkflowGate();
  const [handoff, setHandoff] = useState<{ clientId: string; domain: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Guard against stale gap-detail handoff contaminating Workflow-initiated creates
    clearSiteSectionHandoff();

    // Read the Workflow client handoff from Site Analyzer
    const workflowHandoff = readWorkflowClientHandoff();
    setHandoff(workflowHandoff);
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return null;
  }

  if (!workflowUnlocked) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-muted">
          Workflow is disabled. Run Site Analyzer first to unlock it.{" "}
          <Link href="/app/site-analyzer" className="text-brand hover:underline">
            Go to Site Analyzer
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          Content Creator
        </p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">Workflow</h1>
        <p className="mt-2 text-sm text-muted">
          Define your content brief and let us generate optimized content aligned to your brand
          strategy.
        </p>
      </div>

      {!handoff ? (
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            No Site Analysis client available. Run Site Analyzer first to create content.{" "}
            <Link href="/app/site-analyzer" className="text-brand hover:underline">
              Go to Site Analyzer
            </Link>
          </p>
        </div>
      ) : (
        <ContentBriefPanel
          clientId={handoff.clientId}
          targetKeyword=""
          onBriefSaved={(createId) => router.push(`/app/creates/${createId}`)}
          onBriefValidityChange={() => {}}
        />
      )}
    </div>
  );
}
