"use client";

import { useState } from "react";
import { generateToolsFromNames, ApiError } from "@/services/content-writer-api";
import type { GeneratedContentSet } from "@/lib/types";

export default function ToolsFromNamesPanel({
  projectId,
  onGenerated,
}: {
  projectId: string;
  onGenerated: (result: GeneratedContentSet) => void;
}) {
  const [namesText, setNamesText] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const names = namesText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((name, i, all) => all.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === i)
    .slice(0, 5);

  async function run() {
    setError(null);
    if (names.length === 0) {
      setError("Add at least one tool name.");
      return;
    }
    setBusy(true);
    try {
      const next = await generateToolsFromNames(projectId, {
        toolNames: names,
        brief: brief.trim() || undefined,
      });
      onGenerated(next);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Tool page generation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Tool pages from names</h2>
      <p className="mt-1 text-sm text-muted">
        Writes one tool page per name (Overview, Key Capabilities, Implementation, When to Use). Does
        not use crawl tools or Step 6. Replaces existing tool pages on this project.
      </p>

      <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="tool-names">
        Tool names
      </label>
      <textarea
        id="tool-names"
        value={namesText}
        onChange={(e) => setNamesText(e.target.value)}
        rows={4}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        placeholder={"ChatGPT\nJasper"}
      />

      <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="tool-brief">
        Brief (optional)
      </label>
      <textarea
        id="tool-brief"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={2}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        placeholder="Uses the project keyword when empty"
      />

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || names.length === 0}
        className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Generating…" : `Generate ${names.length || ""} tool page${names.length === 1 ? "" : "s"}`}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
