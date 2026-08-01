"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Content Creator addition: standalone image prompt (topic + notes required).
 * Server route creates the draft; CWV2 project Image Prompts remain the attached path.
 */
export default function StandaloneImagePromptPanel({
  clientId,
}: {
  clientId: string | null;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    if (!clientId) {
      setError("Select or create a client first.");
      return;
    }
    if (!topic.trim() || !notes.trim()) {
      setError("Topic and notes are required for a standalone image prompt.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/image-prompts/standalone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            topic: topic.trim(),
            notes: notes.trim(),
            provider: "OpenAi",
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Image prompt generate failed");
        router.push(`/app/creates/${body.createId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Image prompt generate failed");
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">
        Standalone image prompt
      </h2>
      <p className="mt-1 text-sm text-muted">
        Content Creator addition — prompt text only (no pixels). For section prompts on a
        full content set, use Image Prompts on a project after pillar + blog.
      </p>

      <label className="mt-4 block space-y-1.5">
        <span className="text-sm font-medium">Topic / title</span>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          placeholder="Hero image for payroll automation guide"
        />
      </label>
      <label className="mt-3 block space-y-1.5">
        <span className="text-sm font-medium">Description / notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          placeholder="Audience, mood, must-include elements, avoid list…"
        />
      </label>

      <button
        type="button"
        disabled={pending || !clientId}
        onClick={run}
        className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate image prompt"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
