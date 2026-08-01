"use client";

import { useMemo, useState } from "react";
import {
  analyzeOnPageSeo,
  analyzePolish,
  type PolishReport,
  type SeoReport,
} from "@/lib/draft-quality";
import type { GeneratedContentSet } from "@/lib/content-writer/types";

type DraftKind = "article" | "blog";

/**
 * Content Creator addition: on-page SEO + polish beside CWV2 drafts.
 * Heuristics live in lib/draft-quality.ts (new code — not a GCW component port).
 */
export default function DraftQualityPanel({
  result,
  targetKeyword,
  onApplyFeedback,
}: {
  result: GeneratedContentSet | null;
  targetKeyword: string;
  onApplyFeedback?: (
    feedback: string,
    contentType: "TechnicalArticle" | "BlogPost",
  ) => void;
}) {
  const [kind, setKind] = useState<DraftKind>("article");

  const draft =
    kind === "article"
      ? result?.article
      : result?.blog
        ? {
            title: result.blog.title,
            metaDescription: result.blog.metaDescription,
            bodyHtml: result.blog.bodyHtml,
            wordCount: result.blog.wordCount,
          }
        : null;

  const contentType =
    kind === "article" ? ("TechnicalArticle" as const) : ("BlogPost" as const);

  const seo: SeoReport | null = useMemo(() => {
    if (!draft) return null;
    return analyzeOnPageSeo({
      title: draft.title,
      metaDescription: draft.metaDescription,
      bodyHtml: draft.bodyHtml,
      targetKeyword,
    });
  }, [draft, targetKeyword]);

  const polish: PolishReport | null = useMemo(() => {
    if (!draft) return null;
    return analyzePolish({
      title: draft.title,
      bodyHtml: draft.bodyHtml,
    });
  }, [draft]);

  if (!result?.article && !result?.blog) {
    return (
      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">
          On-page SEO &amp; polish
        </h2>
        <p className="mt-1 text-sm text-muted">
          Generate a pillar or blog draft first — then run structural checks here.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">
        On-page SEO &amp; polish
      </h2>
      <p className="mt-1 text-sm text-muted">
        Structural checks against the project keyword. Apply fixes via Revise
        below.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!result.article}
          onClick={() => setKind("article")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            kind === "article"
              ? "bg-brand text-white"
              : "border border-border text-foreground disabled:opacity-40"
          }`}
        >
          Pillar
        </button>
        <button
          type="button"
          disabled={!result.blog}
          onClick={() => setKind("blog")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            kind === "blog"
              ? "bg-brand text-white"
              : "border border-border text-foreground disabled:opacity-40"
          }`}
        >
          Blog
        </button>
      </div>

      {seo ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium text-foreground">
            SEO score {seo.score} · {seo.wordCount} words · density{" "}
            {seo.keywordDensityPercent.toFixed(2)}%
          </p>
          <ul className="space-y-1.5 text-sm">
            {seo.checks.map((c) => (
              <li key={c.id} className={c.passed ? "text-green-800" : "text-amber-900"}>
                {c.passed ? "✓" : "○"} {c.label}: {c.detail}
              </li>
            ))}
          </ul>
          {seo.applyFeedback && onApplyFeedback ? (
            <button
              type="button"
              onClick={() => onApplyFeedback(seo.applyFeedback, contentType)}
              className="text-sm font-semibold text-brand underline"
            >
              Apply SEO fixes via revise
            </button>
          ) : seo.applyFeedback ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Apply via revise: {seo.applyFeedback}
            </p>
          ) : null}
        </div>
      ) : null}

      {polish ? (
        <div className="mt-6 space-y-3 border-t border-border pt-5">
          <p className="text-sm font-medium text-foreground">
            Polish score {polish.score}
            {polish.shipReady ? " · ship-ready heuristic" : ""}
          </p>
          <ul className="space-y-1.5 text-sm">
            {polish.checks.map((c) => (
              <li key={c.id} className={c.passed ? "text-green-800" : "text-amber-900"}>
                {c.passed ? "✓" : "○"} {c.label}: {c.detail}
              </li>
            ))}
          </ul>
          {polish.applyFeedback && onApplyFeedback ? (
            <button
              type="button"
              onClick={() => onApplyFeedback(polish.applyFeedback, contentType)}
              className="text-sm font-semibold text-brand underline"
            >
              Apply polish fixes via revise
            </button>
          ) : polish.applyFeedback ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Apply via revise: {polish.applyFeedback}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
