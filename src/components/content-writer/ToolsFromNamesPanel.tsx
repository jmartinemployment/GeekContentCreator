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
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const names = namesText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((name, i, all) => all.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === i);

  async function run() {
    setError(null);
    setSuccess(null);
    setProgress(null);
    if (names.length === 0) {
      setError("Add at least one tool name.");
      return;
    }
    setBusy(true);
    try {
      const next = await generateToolsFromNames(
        projectId,
        {
          toolNames: names,
          brief: brief.trim() || undefined,
        },
        (job) => {
          if (job.total > 0) {
            setProgress(`${job.completed}/${job.total} tool pages`);
          } else {
            setProgress("Starting…");
          }
        },
      );
      const n = next.toolPosts?.length ?? 0;
      const hub = next.toolPosts?.some((t) =>
        t.title.toLowerCase().startsWith("top ai tools"),
      );
      setSuccess(
        hub
          ? `Wrote ${n} tool document${n === 1 ? "" : "s"} (product pages + Top AI Tools hub). Use Export below.`
          : `Wrote ${n} tool document${n === 1 ? "" : "s"}. Use Export below.`,
      );
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
      setProgress(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Tool pages from names</h2>
      <p className="mt-1 text-sm text-muted">
        Writes one tool page per name (four H2s) plus a Top AI Tools hub. No crawl, no pillar.
        Runs in the background (poll) so the proxy does not time out. Then use Export / Commit
        for <code className="text-xs">content-writer-output/tools/</code>.
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
      {progress ? <p className="mt-2 text-sm text-muted">{progress}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-2 text-sm text-green-800">{success}</p> : null}
    </div>
  );
}
