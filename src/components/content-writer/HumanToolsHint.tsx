"use client";

import { useState, useTransition } from "react";
import {
  generateToolsFromNames,
  generateToolsContent,
  ApiError,
  defaultLlmProvider,
} from "@/lib/content-writer/api";
import type { GeneratedContentSet } from "@/lib/content-writer/types";

/**
 * Content Creator addition: AI Tools from human names + brief (no Pillar Tools gate).
 * Optional secondary path still runs CWV2 POST …/generate/tools when a Tools section exists.
 */
export default function HumanToolsHint({
  projectId,
  canRunPillarTools,
  onGenerated,
}: {
  projectId: string;
  /** True when pillar body is long enough for CWV2 Tools-section generate. */
  canRunPillarTools: boolean;
  onGenerated: (result: GeneratedContentSet) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [namesText, setNamesText] = useState("");
  const [brief, setBrief] = useState("");

  const names = namesText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);

  const canRunFromNames = names.length > 0 && brief.trim().length > 0;

  function runFromNames() {
    setError(null);
    if (!canRunFromNames) {
      setError("Add at least one tool name and a short brief.");
      return;
    }
    startTransition(async () => {
      try {
        const next = await generateToolsFromNames(projectId, {
          toolNames: names,
          brief: brief.trim(),
          provider: defaultLlmProvider(),
        });
        onGenerated(next);
      } catch (e) {
        setError(
          e instanceof ApiError ? e.message : "Tool generate from names failed.",
        );
      }
    });
  }

  function runFromPillarTools() {
    setError(null);
    startTransition(async () => {
      try {
        const next = await generateToolsContent(projectId);
        onGenerated(next);
      } catch (e) {
        setError(
          e instanceof ApiError
            ? e.message
            : "Pillar Tools generate failed. Prefer names + brief above if there is no Tools section.",
        );
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">AI Tools</h2>
      <p className="mt-1 text-sm text-muted">
        Generate tool pages from names you supply and a short brief. Uses Content
        Writer v2 tool prompts — a pillar Tools section is not required.
      </p>

      <label className="mt-4 block space-y-1.5">
        <span className="text-sm font-medium text-foreground">
          Tool names (up to 5)
        </span>
        <textarea
          value={namesText}
          onChange={(e) => setNamesText(e.target.value)}
          rows={3}
          placeholder={"One per line, e.g.\nInvoice OCR\nQuote Builder"}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>

      <label className="mt-3 block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Brief</span>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          placeholder="Audience, use case, tone, and what each tool should cover"
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>

      <button
        type="button"
        disabled={pending || !canRunFromNames}
        onClick={runFromNames}
        className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? "Generating tools…" : "Generate tools from names"}
      </button>
      {!canRunFromNames ? (
        <p className="mt-2 text-xs text-muted">
          Enter tool names and a brief to enable generate.
        </p>
      ) : null}

      <div className="mt-6 border-t border-border pt-4">
        <p className="text-xs text-muted">
          Optional: if the pillar body already has a Tools section, you can still
          run CWV2&apos;s section-based generate.
        </p>
        <button
          type="button"
          disabled={pending || !canRunPillarTools}
          onClick={runFromPillarTools}
          className="mt-2 rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
        >
          Generate from pillar Tools section
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
