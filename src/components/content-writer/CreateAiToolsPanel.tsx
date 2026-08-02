"use client";

import { useMemo, useState, useTransition } from "react";
import { ApiError } from "@/lib/content-writer/api";
import {
  generateGccTools,
  type GccArtifact,
} from "@/lib/gcc-api";

/**
 * AI Tools on a Content Creator create — names + brief, or names + source artifact.
 * Fail closed: no invented brief when names are typed manually.
 */
export default function CreateAiToolsPanel({
  createId,
  artifacts,
  onGenerated,
}: {
  createId: string;
  artifacts: GccArtifact[];
  onGenerated: () => void;
}) {
  const [namesText, setNamesText] = useState("");
  const [brief, setBrief] = useState("");
  const [sourceArtifactId, setSourceArtifactId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sourceOptions = useMemo(
    () =>
      artifacts.filter((a) =>
        ["blog", "pillar", "techarticle", "technicalarticle"].includes(
          a.type.toLowerCase(),
        ),
      ),
    [artifacts],
  );

  const names = namesText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);

  function run() {
    setError(null);
    setMsg(null);
    if (names.length === 0) {
      setError("Add at least one tool name.");
      return;
    }
    if (!sourceArtifactId && !brief.trim()) {
      setError("Short brief required when not using a source artifact.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await generateGccTools({
          createId,
          toolNames: names,
          brief: brief.trim() || null,
          sourceArtifactId: sourceArtifactId || null,
        });
        const n = result.created?.length ?? 0;
        setMsg(`Generated ${n} AI Tool artifact${n === 1 ? "" : "s"}.`);
        onGenerated();
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "AI Tools generate failed",
        );
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">AI Tools</h2>
      <p className="mt-1 text-sm text-muted">
        Context required: tool names plus a short brief, and/or a source draft on
        this create. Not blocked for a missing Tools section.
      </p>

      <label className="mt-4 block text-sm font-medium">
        Tool names (one per line, max 5)
        <textarea
          value={namesText}
          onChange={(e) => setNamesText(e.target.value)}
          rows={3}
          placeholder={"Invoice OCR\nQuote Builder"}
          className="mt-1.5 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
        />
      </label>

      <label className="mt-3 block text-sm font-medium">
        Short brief
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={2}
          placeholder="Audience, use case, tone"
          className="mt-1.5 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
        />
      </label>

      <label className="mt-3 block text-sm font-medium">
        Source artifact (optional)
        <select
          value={sourceArtifactId}
          onChange={(e) => setSourceArtifactId(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
        >
          <option value="">None — brief required</option>
          {sourceOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.type} — {a.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate AI Tools"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="mt-2 text-sm text-green-700">{msg}</p> : null}
    </section>
  );
}
