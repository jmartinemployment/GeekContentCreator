"use client";

import { useEffect, useState, useTransition } from "react";
import {
  reviseProjectContent,
  ApiError,
  defaultLlmProvider,
} from "@/lib/content-writer/api";
import type { GeneratedContentSet } from "@/lib/content-writer/types";

type Target = "TechnicalArticle" | "BlogPost" | "ToolPost";

/**
 * Content Creator addition: Revise textarea + Full/Section on CWV2 drafts.
 * Not a multi-turn chat — each submit replaces the selected draft body.
 */
export default function DraftRevisePanel({
  projectId,
  result,
  seedFeedback,
  seedContentType,
  onGenerated,
  onSeedConsumed,
}: {
  projectId: string;
  result: GeneratedContentSet | null;
  seedFeedback?: string | null;
  seedContentType?: Target | null;
  onGenerated: (result: GeneratedContentSet) => void;
  onSeedConsumed?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [scope, setScope] = useState<"full" | "section">("full");
  const [sectionPath, setSectionPath] = useState("");
  const [target, setTarget] = useState<Target>("TechnicalArticle");
  const [toolSlug, setToolSlug] = useState("");

  const tools = result?.toolPosts ?? [];
  const hasArticle = (result?.article?.wordCount ?? 0) > 0;
  const hasBlog = result?.blog != null;
  const hasTools = tools.length > 0;
  const hasAny = hasArticle || hasBlog || hasTools;

  useEffect(() => {
    if (!seedFeedback) return;
    setFeedback(seedFeedback);
    if (seedContentType) setTarget(seedContentType);
    setScope("full");
    onSeedConsumed?.();
    // Intentionally only when seedFeedback changes — avoid re-running on callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedFeedback, seedContentType]);

  useEffect(() => {
    if (tools.length === 0) {
      setToolSlug("");
      return;
    }
    setToolSlug((prev) =>
      prev && tools.some((t) => t.slug === prev) ? prev : tools[0].slug,
    );
  }, [tools]);

  function run() {
    setError(null);
    if (!feedback.trim()) {
      setError("Feedback is required.");
      return;
    }
    if (scope === "section" && !sectionPath.trim()) {
      setError("Section path is required when scope is Section.");
      return;
    }
    if (target === "ToolPost" && !toolSlug) {
      setError("Choose which tool to revise.");
      return;
    }
    startTransition(async () => {
      try {
        const next = await reviseProjectContent(projectId, {
          contentType: target,
          feedback: feedback.trim(),
          scope,
          sectionPath: scope === "section" ? sectionPath.trim() : undefined,
          toolSlug: target === "ToolPost" ? toolSlug : undefined,
          provider: defaultLlmProvider(),
        });
        onGenerated(next);
        setFeedback("");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Revise failed.");
      }
    });
  }

  if (!hasAny) {
    return (
      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Revise</h2>
        <p className="mt-1 text-sm text-muted">
          Generate a draft first, then revise with Full or Section feedback.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Revise</h2>
      <p className="mt-1 text-sm text-muted">
        Feedback textarea · Full or Section · replaces the selected draft (new
        body, not a chat thread).
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!hasArticle}
          onClick={() => setTarget("TechnicalArticle")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            target === "TechnicalArticle"
              ? "bg-brand text-white"
              : "border border-border text-foreground disabled:opacity-40"
          }`}
        >
          Pillar
        </button>
        <button
          type="button"
          disabled={!hasBlog}
          onClick={() => setTarget("BlogPost")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            target === "BlogPost"
              ? "bg-brand text-white"
              : "border border-border text-foreground disabled:opacity-40"
          }`}
        >
          Blog
        </button>
        <button
          type="button"
          disabled={!hasTools}
          onClick={() => setTarget("ToolPost")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            target === "ToolPost"
              ? "bg-brand text-white"
              : "border border-border text-foreground disabled:opacity-40"
          }`}
        >
          Tool
        </button>
      </div>

      {target === "ToolPost" && tools.length > 0 ? (
        <label className="mt-3 block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Tool</span>
          <select
            value={toolSlug}
            onChange={(e) => setToolSlug(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          >
            {tools.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.title || t.slug}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="mt-3 block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Feedback</span>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={4}
          placeholder="What should change?"
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="radio"
            name="revise-scope"
            checked={scope === "full"}
            onChange={() => setScope("full")}
          />
          Full
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="radio"
            name="revise-scope"
            checked={scope === "section"}
            onChange={() => setScope("section")}
          />
          Section
        </label>
      </div>

      {scope === "section" ? (
        <label className="mt-3 block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Section path</span>
          <input
            value={sectionPath}
            onChange={(e) => setSectionPath(e.target.value)}
            placeholder='e.g. "Key Capabilities"'
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          />
        </label>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? "Revising…" : "Revise → update draft"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
