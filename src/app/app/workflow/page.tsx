"use client";

import { useWorkflowGate } from "@/components/WorkflowGate";
import Link from "next/link";
import { useState } from "react";

export default function WorkflowPage() {
  const { workflowUnlocked } = useWorkflowGate();
  const [isLoading, setIsLoading] = useState(false);

  const contentTypes = [
    { id: "pillar", label: "Pillar", description: "Comprehensive deep-dive article (3000+ words)" },
    { id: "blog", label: "Blog Post", description: "Accessible blog article (1500-2000 words)" },
    { id: "email", label: "Email", description: "Cold outreach email (150-200 words)" },
    { id: "linkedin", label: "LinkedIn", description: "Professional post (200-300 words)" },
    { id: "facebook", label: "Facebook", description: "Casual link-share post (30-50 words)" },
  ];

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
        <h1 className="mt-1 text-3xl font-bold text-foreground">Generate Content</h1>
        <p className="mt-2 text-sm text-muted">
          Create optimized content grounded in your site's context.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {contentTypes.map((type) => (
          <div
            key={type.id}
            className="rounded-lg border border-border bg-surface p-6 hover:bg-surface/80 transition-colors"
          >
            <h3 className="font-semibold text-foreground">{type.label}</h3>
            <p className="mt-2 text-sm text-muted">{type.description}</p>
            <button
              disabled={isLoading}
              onClick={() => {
                setIsLoading(true);
                // TODO: Navigate to create page with type pre-selected
              }}
              className="mt-4 w-full px-4 py-2 text-sm font-medium rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
            >
              Generate
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
