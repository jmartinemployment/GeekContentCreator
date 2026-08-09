"use client";

import { useEffect, useState } from "react";
import {
  matchKeywordToHierarchy,
  type HierarchyMatch,
  type PageSectionTreePage,
} from "@/lib/content-creator/hierarchy-match";
import { updateProjectHierarchyContext, ApiError } from "@/services/content-writer-api";
import type { ProjectDetail } from "@/lib/types";

export type HierarchyGateState = {
  matched: boolean;
  allowOutsideSiteScope: boolean;
  loadError: string | null;
  loading: boolean;
};

export default function HierarchyContextPanel({
  projectId,
  targetKeyword,
  siteAnalysisId,
  initialPath: _initialPath,
  initialChildren: _initialChildren,
  initialSourcePageUrl: _initialSourcePageUrl,
  initialAllowOutside,
  onProjectUpdated,
  onGateChange,
}: {
  projectId: string;
  targetKeyword: string;
  siteAnalysisId: string | null;
  initialPath: string | null;
  initialChildren: string[];
  initialSourcePageUrl: string | null;
  initialAllowOutside: boolean;
  onProjectUpdated: (project: ProjectDetail) => void;
  onGateChange: (state: HierarchyGateState) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [match, setMatch] = useState<HierarchyMatch | null>(null);
  const [allowOutside, setAllowOutside] = useState(initialAllowOutside);
  const [persistError, setPersistError] = useState<string | null>(null);

  useEffect(() => {
    onGateChange({
      matched: match !== null,
      allowOutsideSiteScope: allowOutside,
      loadError,
      loading,
    });
  }, [match, allowOutside, loadError, loading, onGateChange]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!siteAnalysisId) {
        setLoadError(
          "No Site Analyzer handoff on this project. Unlock Workflow from Site Analyzer and create the project again, or acknowledge an out-of-scope keyword.",
        );
        setMatch(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(
          `/api/site-analyzer/${encodeURIComponent(siteAnalysisId)}/page-section-trees`,
          { cache: "no-store" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "Could not load Site Analyzer hierarchy.",
          );
        }

        const trees = (Array.isArray(body) ? body : []) as PageSectionTreePage[];
        const next = matchKeywordToHierarchy(trees, targetKeyword);
        if (cancelled) return;
        setMatch(next);

        const pathLabel = next?.path.join(" › ") ?? null;
        const children = next?.childHeadings ?? [];
        const sourceUrl = next?.sourcePageUrl ?? null;

        // Persist match (or clear) so generate is server-complete. Keep allowOutside if still unmatched.
        const project = await updateProjectHierarchyContext(projectId, {
          hierarchyPath: pathLabel,
          hierarchyChildHeadings: children,
          hierarchySourcePageUrl: sourceUrl,
          allowOutsideSiteScope: next ? false : allowOutside,
          siteAnalysisId,
        });
        if (cancelled) return;
        if (next) setAllowOutside(false);
        onProjectUpdated(project);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Hierarchy load failed.");
        setMatch(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // Re-match when keyword or analysis changes; allowOutside toggled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialAllowOutside only seeds checkbox
  }, [projectId, siteAnalysisId, targetKeyword]);

  async function handleAllowOutsideChange(checked: boolean) {
    setPersistError(null);
    setAllowOutside(checked);
    try {
      const project = await updateProjectHierarchyContext(projectId, {
        hierarchyPath: match?.path.join(" › ") ?? null,
        hierarchyChildHeadings: match?.childHeadings ?? [],
        hierarchySourcePageUrl: match?.sourcePageUrl ?? null,
        allowOutsideSiteScope: checked,
        siteAnalysisId: siteAnalysisId ?? undefined,
      });
      onProjectUpdated(project);
    } catch (err) {
      setPersistError(
        err instanceof ApiError ? err.message : "Could not save outside-scope acknowledgment.",
      );
      setAllowOutside(!checked);
    }
  }

  const pathLabel = match?.path.join(" › ") ?? null;
  const children = match?.childHeadings ?? [];
  const sourceUrl = match?.sourcePageUrl ?? null;

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">2. Site hierarchy context</h2>
      <p className="mt-1 text-sm text-muted">
        Match the project keyword against Site Analyzer heading trees. Child topics ground Generate
        (pillar/blog must use them as child headings). Tone &amp; Focus stay omitted this phase.
      </p>

      {loading ? <p className="mt-4 text-sm text-muted">Loading hierarchy…</p> : null}

      {loadError ? <p className="mt-4 text-sm text-red-600">{loadError}</p> : null}

      {!loading && match ? (
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <p className="font-medium text-foreground">Matched path</p>
            <p className="text-muted">{pathLabel}</p>
          </div>
          {sourceUrl ? (
            <div>
              <p className="font-medium text-foreground">Source page</p>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-brand hover:underline"
              >
                {sourceUrl}
              </a>
            </div>
          ) : null}
          <div>
            <p className="font-medium text-foreground">Child headings</p>
            {children.length > 0 ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                {children.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Matched node has no child headings.</p>
            )}
          </div>
        </div>
      ) : null}

      {!loading && !match ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-amber-800">
            No hierarchy match for &ldquo;{targetKeyword}&rdquo; — page/site hierarchy context will be
            omitted. Generate stays blocked until you acknowledge the keyword is outside site scope.
          </p>
          <label className="flex items-start gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={allowOutside}
              onChange={(e) => void handleAllowOutsideChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-2 focus:ring-brand/20"
            />
            <span>
              Keyword is outside site scope — generate without hierarchy context
            </span>
          </label>
        </div>
      ) : null}

      {persistError ? <p className="mt-3 text-sm text-red-600">{persistError}</p> : null}
    </div>
  );
}
