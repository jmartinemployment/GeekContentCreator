"use client";

import { useEffect, useState } from "react";
import {
  hierarchyMatchId,
  hierarchyMatchKindLabel,
  normalizeHierarchyMatchesFromApi,
  type HierarchyMatch,
} from "@/lib/content-creator/hierarchy-match";
import { updateProjectHierarchyContext, ApiError } from "@/services/content-writer-api";
import type { ProjectDetail } from "@/lib/types";

export type HierarchyGateState = {
  matched: boolean;
  allowOutsideSiteScope: boolean;
  loadError: string | null;
  loading: boolean;
};

function sameMatch(a: HierarchyMatch | null, b: HierarchyMatch | null): boolean {
  if (!a || !b) return a === b;
  return hierarchyMatchId(a) === hierarchyMatchId(b);
}

function pickInitial(
  matches: HierarchyMatch[],
  initialPath: string | null,
  initialSourcePageUrl: string | null,
): HierarchyMatch | null {
  if (matches.length === 0) return null;
  if (initialPath && initialSourcePageUrl) {
    const saved = matches.find(
      (m) =>
        m.sourcePageUrl === initialSourcePageUrl && m.path.join(" › ") === initialPath,
    );
    if (saved) return saved;
  }
  // No default selection: restoring a saved choice is fine, guessing one is not. Auto-picking
  // matches[0] silently grounded writes on whichever node happened to sort first.
  return null;
}

export default function HierarchyContextPanel({
  projectId,
  targetKeyword,
  siteAnalysisProfileId,
  initialPath,
  initialChildren: _initialChildren,
  initialSourcePageUrl,
  initialAllowOutside,
  onProjectUpdated,
  onGateChange,
}: {
  projectId: string;
  targetKeyword: string;
  /** geek_seo.site_analysis_profiles.Id — required for SQL hierarchy match. */
  siteAnalysisProfileId: string | null;
  initialPath: string | null;
  initialChildren: string[];
  initialSourcePageUrl: string | null;
  initialAllowOutside: boolean;
  onProjectUpdated: (project: ProjectDetail) => void;
  onGateChange: (state: HierarchyGateState) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [matches, setMatches] = useState<HierarchyMatch[]>([]);
  const [selected, setSelected] = useState<HierarchyMatch | null>(null);
  const [allowOutside, setAllowOutside] = useState(initialAllowOutside);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [persisting, setPersisting] = useState(false);

  useEffect(() => {
    onGateChange({
      matched: selected !== null,
      allowOutsideSiteScope: allowOutside,
      loadError,
      loading,
    });
  }, [selected, allowOutside, loadError, loading, onGateChange]);

  async function persistSelection(
    next: HierarchyMatch | null,
    outside: boolean,
  ): Promise<void> {
    setPersistError(null);
    setPersisting(true);
    try {
      const project = await updateProjectHierarchyContext(projectId, {
        hierarchyPath: next?.path.join(" › ") ?? null,
        hierarchyChildHeadings: next?.childHeadings ?? [],
        hierarchyToolsByHeading: next?.toolsByHeading ?? [],
        hierarchyAssignmentMarkdown: next?.assignmentMarkdown ?? null,
        hierarchySourcePageUrl: next?.sourcePageUrl ?? null,
        allowOutsideSiteScope: next ? false : outside,
        siteAnalysisProfileId: siteAnalysisProfileId ?? undefined,
      });
      if (next) setAllowOutside(false);
      onProjectUpdated(project);
    } catch (persistErr) {
      console.error("Failed to persist hierarchy context:", persistErr);
      setPersistError(
        persistErr instanceof ApiError
          ? persistErr.status === 404
            ? "Could not save hierarchy context (API 404). Redeploy GeekAPI with the latest Content Writer changes, then refresh."
            : persistErr.message
          : persistErr instanceof Error
            ? `Could not save hierarchy context: ${persistErr.message}`
            : "Could not save hierarchy context.",
      );
      throw persistErr;
    } finally {
      setPersisting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!siteAnalysisProfileId) {
        setLoadError(
          "No site_analysis_profiles.Id on this project. Select a crawl in Site Analyzer, then create the project again, or acknowledge an out-of-scope keyword.",
        );
        setMatches([]);
        setSelected(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(
          `/api/site-analyzer/profiles/${encodeURIComponent(siteAnalysisProfileId)}/hierarchy-match?keyword=${encodeURIComponent(targetKeyword)}`,
          { cache: "no-store" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "Could not load Site Analyzer hierarchy match.",
          );
        }

        const nextMatches = normalizeHierarchyMatchesFromApi(body);
        if (cancelled) return;
        setMatches(nextMatches);
        const nextSelected = pickInitial(nextMatches, initialPath, initialSourcePageUrl);
        setSelected(nextSelected);

        try {
          await persistSelection(nextSelected, nextSelected ? false : allowOutside);
        } catch (persistErr) {
          console.error("Auto-persist of hierarchy selection failed:", persistErr);
        }
        if (cancelled) return;
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Hierarchy load failed.");
        setMatches([]);
        setSelected(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial* only seeds selection
  }, [projectId, siteAnalysisProfileId, targetKeyword]);

  async function handleSelect(match: HierarchyMatch) {
    if (sameMatch(selected, match) || persisting) return;
    const previous = selected;
    setSelected(match);
    try {
      await persistSelection(match, false);
    } catch (persistErr) {
      console.error("Failed to persist hierarchy selection:", persistErr);
      setSelected(previous);
    }
  }

  async function handleAllowOutsideChange(checked: boolean) {
    setPersistError(null);
    setAllowOutside(checked);
    try {
      await persistSelection(selected, checked);
    } catch (persistErr) {
      console.error("Failed to persist outside-scope acknowledgement:", persistErr);
      setAllowOutside(!checked);
    }
  }

  const children = selected?.childHeadings ?? [];
  const sourceUrl = selected?.sourcePageUrl ?? null;

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">2. Site hierarchy context</h2>
      <p className="mt-1 text-sm text-muted">
        Match the project keyword against site_analysis_page_section_trees for this
        site_analysis_profiles.Id. Choose which match grounds Generate (pillar/blog must use
        its child headings). Tone &amp; Focus stay omitted this phase.
      </p>

      {loading ? <p className="mt-4 text-sm text-muted">Loading hierarchy…</p> : null}

      {loadError ? <p className="mt-4 text-sm text-red-600">{loadError}</p> : null}

      {!loading && matches.length > 0 ? (
        <div className="mt-4 space-y-4 text-sm">
          <div>
            <p className="font-medium text-foreground">
              {matches.length === 1
                ? "Matched path"
                : `${matches.length} matches — select the node for this write`}
            </p>
            <fieldset className="mt-2 space-y-2" disabled={persisting}>
              <legend className="sr-only">Hierarchy match</legend>
              {matches.map((m) => {
                const id = hierarchyMatchId(m);
                const checked = sameMatch(selected, m);
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
                      checked
                        ? "border-brand bg-brand/5"
                        : "border-border hover:border-brand/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="hierarchy-match"
                      className="mt-1 h-4 w-4 border-border text-brand focus:ring-2 focus:ring-brand/20"
                      checked={checked}
                      onChange={() => void handleSelect(m)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">
                        {m.path.join(" › ")}
                      </span>
                      <span className="mt-0.5 block break-all text-xs text-muted">
                        {hierarchyMatchKindLabel(m.kind)}
                        {m.sourcePageUrl ? ` · ${m.sourcePageUrl}` : ""}
                      </span>
                      {m.childHeadings.length > 0 ? (
                        <span className="mt-1 block text-xs text-muted">
                          {m.childHeadings.length} child heading
                          {m.childHeadings.length === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="mt-1 block text-xs text-muted">No child headings</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          </div>

          {selected ? (
            <>
              {sourceUrl ? (
                <div>
                  <p className="font-medium text-foreground">Selected source page</p>
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
                <p className="font-medium text-foreground">Child headings (injected)</p>
                {children.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                    {children.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">Selected node has no child headings.</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {!loading && matches.length === 0 && !loadError ? (
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
