"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useWorkflowGate } from "@/components/WorkflowGate";
import { createGccCreate } from "@/services/gcc-api";
import Link from "next/link";

export default function WorkflowPage() {
  const router = useRouter();
  const { workflowUnlocked } = useWorkflowGate();
  const [pending, startTransition] = useTransition();

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

  async function handleStartCreate() {
    startTransition(async () => {
      try {
        const created = await createGccCreate({
          clientId: "default",
          topic: "Content Brief",
        });
        router.push(`/app/creates/${created.id}`);
      } catch (e) {
        console.error("Failed to create:", e);
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          Content Creator
        </p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">Workflow</h1>
        <p className="mt-2 text-sm text-muted">
          Start with Site Analyzer results seeded into your Content Brief, then
          generate, revise, and publish.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <p className="mb-4 text-sm text-muted">
          Ready to create content based on your Site Analysis? Click below to
          open the full Content Brief workflow.
        </p>
        <button
          onClick={handleStartCreate}
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? "Opening..." : "Start Content Brief"}
        </button>
      </div>
    </div>
  );
}
