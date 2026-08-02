"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  generateToolsFromNames,
  generateToolsContent,
  listToolNameCandidates,
  ApiError,
  defaultLlmProvider,
} from "@/lib/content-writer/api";
import type { GeneratedContentSet } from "@/lib/content-writer/types";

/**
 * Content Creator addition: AI Tools from human names + brief (no Pillar Tools gate).
 * Also pick names from pillar Tools / existing tool drafts when present.
 */
export default function HumanToolsHint({
  projectId,
  canRunPillarTools,
  result,
  onGenerated,
}: {
  projectId: string;
  /** True when pillar body is long enough for CWV2 Tools-section generate. */
  canRunPillarTools: boolean;
  result: GeneratedContentSet | null;
  onGenerated: (result: GeneratedContentSet) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [namesText, setNamesText] = useState("");
  const [brief, setBrief] = useState("");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    listToolNameCandidates(projectId)
      .then((names) => {
        if (cancelled) return;
        setCandidates(names);
        setSelected((prev) => {
          const next = { ...prev };
          for (const n of names) {
            if (!(n in next)) next[n] = false;
          }
          return next;
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "Could not load tool name candidates from this project",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, result?.toolPosts?.length, result?.article?.wordCount]);

  const picked = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  const manualNames = namesText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const names = [...new Set([...picked, ...manualNames])].slice(0, 5);
  const fromArtifactOnly = picked.length > 0 && manualNames.length === 0;
  const resolvedBrief = brief.trim()
    || (fromArtifactOnly
      ? "Generate tool pages for the selected tools already named on this project."
      : "");
  const canRunFromNames = names.length > 0 && resolvedBrief.length > 0;

  function runFromNames() {
    setError(null);
    if (names.length === 0) {
      setError("Add or pick at least one tool name.");
      return;
    }
    if (!resolvedBrief) {
      setError("A short brief is required when supplying names manually.");
      return;
    }
    startTransition(async () => {
      try {
        const next = await generateToolsFromNames(projectId, {
          toolNames: names,
          brief: resolvedBrief,
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
        Context required, source flexible — pick names from this project&apos;s
        drafts when present, or supply a list + brief. A pillar Tools section is
        not required.
      </p>

      {candidates.length > 0 ? (
        <fieldset className="mt-4 space-y-1.5">
          <legend className="text-sm font-medium text-foreground">
            From this project
          </legend>
          {candidates.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={Boolean(selected[name])}
                onChange={(e) =>
                  setSelected((prev) => ({ ...prev, [name]: e.target.checked }))
                }
              />
              {name}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="mt-4 text-xs text-muted">
          No candidate names detected yet — use the human list below.
        </p>
      )}

      <label className="mt-4 block space-y-1.5">
        <span className="text-sm font-medium text-foreground">
          Or human-supplied names (up to 5 total)
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
        <span className="text-sm font-medium text-foreground">
          Brief{" "}
          <span className="font-normal text-muted">
            (required for manual names; optional when picking from this project)
          </span>
        </span>
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
          Pick or enter tool names
          {fromArtifactOnly ? "" : " and a brief"} to enable generate.
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
