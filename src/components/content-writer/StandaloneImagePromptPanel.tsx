"use client";

import { useState, useTransition } from "react";

/**
 * Content Creator addition: standalone image prompt (topic + notes required).
 * Returns prompt text inline — no legacy /app/creates redirect.
 */
export default function StandaloneImagePromptPanel({
  clientId,
}: {
  clientId: string | null;
}) {
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultJson, setResultJson] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    setResultJson(null);
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
            topic: topic.trim(),
            notes: notes.trim(),
            provider: "OpenAi",
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Image prompt generate failed");
        const raw =
          typeof body.promptJson === "string"
            ? body.promptJson
            : JSON.stringify(body.prompt ?? body, null, 2);
        try {
          setResultJson(JSON.stringify(JSON.parse(raw), null, 2));
        } catch {
          setResultJson(raw);
        }
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
        Prompt text only (no pixels). Topic and notes are required. For section
        prompts on a content set, use Image Prompts on a project after blog
        generate.
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
      {resultJson ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Result</p>
            <button
              type="button"
              className="text-xs font-semibold text-brand underline"
              onClick={() => navigator.clipboard.writeText(resultJson)}
            >
              Copy
            </button>
          </div>
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-surface-muted p-3 text-xs text-foreground whitespace-pre-wrap">
            {resultJson}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
