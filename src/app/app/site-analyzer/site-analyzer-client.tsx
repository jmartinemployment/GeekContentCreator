"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearSiteSectionHandoff, writeWorkflowClientHandoff } from "@/lib/site-section-storage";
import { useWorkflowGate } from "@/components/WorkflowGate";
import type { ContentGap, SiteSectionContext, SiteAnalysis } from "@/lib/types";
import type { CuratedSerpSeed } from "@/lib/content-creator/serp-lens";
import { SerpIngestPanel } from "@/components/content-creator/SerpIngestPanel";
import { SiteHeadingHierarchy } from "@/components/SiteHeadingHierarchy";
import { createGccCreate, createGccClient, getGccClientByName, ApiError } from "@/services/gcc-api";
import { getClients } from "@/services/content-writer-api";
import type { Client } from "@/lib/types";

const POLL_MS = 2500;
const MAX_WAIT_MS = 15 * 60 * 1000;
const SHOW_GAP_GENERATE_BUTTON = false; // Site Analyzer currently only returns headings without matching pages (missing-page gaps). Generate is disabled pending Workflow rebuild. Flip this line if gap types expand to include real content gaps.

async function downloadSitemap(analysisId: string): Promise<void> {
  const response = await fetch(
    `/api/site-analyzer/${encodeURIComponent(analysisId)}/sitemap`,
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Sitemap download failed.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sitemap.xml";
  link.click();
  URL.revokeObjectURL(url);
}

function gapSectionFirstSegment(path: string | null | undefined): string | null {
  const p = path?.trim();
  if (!p) return null;
  const seg = p.split("/").map((s) => s.trim()).filter(Boolean)[0];
  return seg || null;
}

/** Normalize poll/API gap shapes (camelCase or PascalCase) into ContentGap. */
function normalizeGap(raw: Record<string, unknown>): ContentGap {
  const topic = String(raw.topic ?? raw.Topic ?? "");
  const hierarchyRaw = raw.hierarchy ?? raw.Hierarchy;
  const hierarchy = Array.isArray(hierarchyRaw)
    ? hierarchyRaw.map((h) => String(h)).filter(Boolean)
    : null;
  const sourcePageUrl = (raw.sourcePageUrl ?? raw.SourcePageUrl) as string | null | undefined;
  return {
    id: String(raw.id ?? raw.Id ?? ""),
    topic,
    sectionPath: (raw.sectionPath ?? raw.SectionPath ?? null) as string | null,
    reason: String(raw.reason ?? raw.Reason ?? ""),
    hierarchy: hierarchy && hierarchy.length > 0 ? hierarchy : null,
    sourcePageUrl: sourcePageUrl?.trim() || null,
  };
}

/**
 * Build leveled breadcrumb for a gap from site pages when API hierarchy is missing
 * or to attach H-levels for display.
 */
function resolveGapHierarchy(
  gap: ContentGap,
  pages: SiteAnalysis["pages"] | undefined,
): { levels: Array<{ level: number; text: string }>; sourcePageUrl: string | null } {
  const pagesList = pages ?? [];
  const topicKey = gap.topic.trim().toLowerCase();

  for (const page of pagesList) {
    const stack: Array<{ level: number; text: string }> = [];
    for (const h of page.headings ?? []) {
      while (stack.length > 0 && stack[stack.length - 1]!.level >= h.level) {
        stack.pop();
      }
      stack.push({ level: h.level, text: h.text });
      if (h.text.trim().toLowerCase() === topicKey) {
        return {
          levels: stack.map((n) => ({ level: n.level, text: n.text })),
          sourcePageUrl: gap.sourcePageUrl || page.url || null,
        };
      }
    }
  }

  // Fall back to API hierarchy strings without levels (assume H1..Hn).
  if (gap.hierarchy && gap.hierarchy.length > 0) {
    return {
      levels: gap.hierarchy.map((text, i) => ({ level: i + 1, text })),
      sourcePageUrl: gap.sourcePageUrl ?? null,
    };
  }

  if (gap.sectionPath) {
    return {
      levels: [
        { level: 1, text: gap.sectionPath },
        { level: 2, text: gap.topic },
      ],
      sourcePageUrl: gap.sourcePageUrl ?? null,
    };
  }

  return { levels: [{ level: 1, text: gap.topic }], sourcePageUrl: gap.sourcePageUrl ?? null };
}

export function SiteAnalyzerClient() {
  const router = useRouter();
  const { unlockWorkflow } = useWorkflowGate();
  const [domain, setDomain] = useState("");
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [gaps, setGaps] = useState<ContentGap[]>([]);
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);
  const [section, setSection] = useState<SiteSectionContext | null>(null);
  const [curatedSerp, setCuratedSerp] = useState<CuratedSerpSeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepLabel, setStepLabel] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [pending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showReuseConfirm, setShowReuseConfirm] = useState(false);
  const [sitePages, setSitePages] = useState<SiteAnalysis['pages']>([]);

  const selectedGap = gaps.find((g) => g.id === selectedGapId) ?? null;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    getClients()
      .then((list) => {
        setClients(list);
        setClientError(null);
        if (list[0] && !clientId) setClientId(list[0].id);
      })
      .catch((e) =>
        setClientError(e instanceof Error ? e.message : "Could not load clients."),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pollUntilDone(id: string, signal: AbortSignal) {
    const started = Date.now();
    while (!signal.aborted) {
      if (Date.now() - started > MAX_WAIT_MS) {
        throw new Error("Site analysis timed out after 15 minutes.");
      }
      const res = await fetch(`/api/site-analyzer/${encodeURIComponent(id)}`, {
        signal,
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Could not poll site analysis");
      }

      const status = String(body.status || body.Status || "").toLowerCase();
      if (body.step || body.stepNumber) {
        const n = body.stepNumber ?? "";
        const total = body.totalSteps ?? "";
        setStepLabel(
          body.step
            ? `Step ${n}${total ? `/${total}` : ""}: ${body.step}`
            : `Step ${n}${total ? `/${total}` : ""}`,
        );
      }

      if (status === "ready") {
        const rawGaps = (body.gaps ?? body.Gaps ?? []) as Record<string, unknown>[];
        setGaps(rawGaps.map(normalizeGap));
        setSitePages(body.pages ?? body.Pages ?? []);
        setStepLabel(null);
        if (!rawGaps.length) {
          throw new Error("Site analysis finished but produced no content gaps.");
        }

        // Resolve domain → client and write Workflow handoff
        try {
          const domainTrimmed = domain.trim();
          let clientId: string | null = null;

          // Try to get existing client by name
          const existing = await getGccClientByName(domainTrimmed);
          if (existing) {
            clientId = existing.id;
          } else {
            // Create new client for this domain
            const created = await createGccClient({ name: domainTrimmed });
            clientId = created.id;
          }

          if (clientId) {
            writeWorkflowClientHandoff({ clientId, domain: domainTrimmed, siteAnalysisId: id });
          }
        } catch (e) {
          // Log but don't fail — handoff is optional, Workflow can still proceed without it
          console.error("Failed to resolve Workflow client:", e);
        }

        unlockWorkflow();
        return;
      }
      if (status === "failed") {
        throw new Error(body.error || "Site analysis failed.");
      }

      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw new Error("Analysis cancelled.");
  }

  function analyze() {
    setError(null);
    setGaps([]);
    setSelectedGapId(null);
    setSection(null);
    setCuratedSerp(null);
    setAnalysisId(null);
    setStepLabel(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setAnalyzing(true);

    startTransition(async () => {
      try {
        const res = await fetch("/api/site-analyzer/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain,
            // Content Creator always starts a new crawl — never reuse a ready/cached analysis.
            force: true,
          }),
          signal: ac.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not start site analysis");
        if (!body.id) throw new Error("Analyze response missing analysis id");

        setAnalysisId(body.id);
        // force:true always starts processing — poll until ready (do not trust a cached ready body).
        await pollUntilDone(body.id, ac.signal);
      } catch (e) {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Site analysis failed");
        setGaps([]);
      } finally {
        if (!ac.signal.aborted) setAnalyzing(false);
      }
    });
  }

  function cancel() {
    abortRef.current?.abort();
    setAnalyzing(false);
    setStepLabel(null);
    setError("Analysis cancelled.");
  }

  function openGapDetail(gap: ContentGap) {
    setError(null);
    setSelectedGapId(gap.id);
    setSection(null);
    setCuratedSerp(null);
    if (!analysisId) return;
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/site-analyzer/section-context?analysisId=${encodeURIComponent(analysisId)}&gapTopic=${encodeURIComponent(gap.topic)}`,
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Section context failed");
        if (!body.relatedPages?.length) {
          throw new Error("Site section context missing related pages");
        }
        setSection(body as SiteSectionContext);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load gap detail");
        setSelectedGapId(null);
      }
    });
  }

  async function doCreate() {
    if (!analysisId || !selectedGap || !section) return;
    if (!clientId) {
      setError("Select a client before starting a create.");
      return;
    }
    setShowReuseConfirm(false);
    setError(null);
    setCreating(true);
    try {
      const gapSectionPath =
        selectedGap.sectionPath ?? section.gapSectionPath ?? null;
      const department =
        gapSectionFirstSegment(gapSectionPath) || "marketing";
      const gapReason = selectedGap.reason?.trim() || null;
      const normalizedSection: SiteSectionContext = {
        ...section,
        siteAnalysisId: section.siteAnalysisId || analysisId,
        gapTopic: section.gapTopic || selectedGap.topic,
        gapSectionPath: section.gapSectionPath ?? gapSectionPath,
      };
      const created = await createGccCreate({
        clientId,
        topic: selectedGap.topic,
        notes: gapReason,
        siteAnalysisId: analysisId,
        siteSection: normalizedSection,
        department,
      });
      clearSiteSectionHandoff();
      // Seed curated SERP bits into local brief storage is now handled in Workflow;
      // no sessionStorage handoff needed.
      router.push(`/app/creates/${created.id}`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not start create.",
      );
    } finally {
      setCreating(false);
    }
  }

  const busy = pending || analyzing || creating;

  function startCreate() {
    if (!analysisId || !selectedGap || !section) return;
    if (!clientId) {
      setError("Select a client before starting a create.");
      return;
    }
    // Disabled until Site Analyzer run — now a run exists (analysisId+gap+section), ask if new run needed.
    if (analysisId && selectedGap && section && clients.length > 0) {
      setShowReuseConfirm(true);
      return;
    }
    void doCreate();
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="geekatyourspot.com"
            className="flex-1 rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
            disabled={analyzing}
          />
          <button
            type="button"
            disabled={busy || !domain.trim()}
            onClick={analyze}
            className="rounded-md bg-[var(--gcc-teal)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : "Analyze"}
          </button>
          {analyzing ? (
            <button
              type="button"
              onClick={cancel}
              className="rounded-md border border-[var(--gcc-line)] px-4 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
          ) : null}
        </div>
        <p className="text-xs text-[var(--gcc-muted)]">
          Enter a site domain and click Analyze. Pick a gap to review SERP shape, PAA,
          and Information Gain, then start a create with related pages from that site
          section.
        </p>
        {stepLabel ? (
          <p className="text-xs text-[var(--gcc-muted)]">{stepLabel}</p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {analysisId ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-[var(--gcc-muted)]">Analysis {analysisId}</p>
          <button
            type="button"
            onClick={() => {
              downloadSitemap(analysisId).catch((err) => {
                setError(err instanceof Error ? err.message : "Sitemap download failed.");
              });
            }}
            className="rounded-md border border-[var(--gcc-line)] px-3 py-1 text-xs font-semibold"
          >
            Download sitemap
          </button>
        </div>
      ) : null}

      <SiteHeadingHierarchy pages={sitePages} gaps={gaps} />

      {gaps.length > 0 ? (
        <ul className="divide-y divide-[var(--gcc-line)] border border-[var(--gcc-line)] bg-white">
          {gaps.map((g) => {
            const { levels, sourcePageUrl } = resolveGapHierarchy(g, sitePages);
            return (
            <li key={g.id} className="px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-medium text-[var(--gcc-ink)]">{g.topic}</p>
                  <div className="rounded-md border border-[var(--gcc-line)] bg-[var(--gcc-teal)]/5 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gcc-teal-deep)]">
                      Hierarchy
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {levels.map((h, i) => {
                        const isGapHeading =
                          h.text.trim().toLowerCase() === g.topic.trim().toLowerCase();
                        return (
                          <li
                            key={`${h.level}-${h.text}-${i}`}
                            className={
                              isGapHeading
                                ? "text-sm font-medium text-red-700"
                                : "text-sm text-[var(--gcc-ink)]"
                            }
                            style={{ paddingLeft: `${Math.max(0, h.level - 1) * 0.75}rem` }}
                          >
                            H{h.level}: {h.text}
                            {isGapHeading ? " — missing page" : ""}
                          </li>
                        );
                      })}
                    </ul>
                    {sourcePageUrl ? (
                      <p className="mt-2 text-xs text-[var(--gcc-muted)]">
                        On{" "}
                        <a
                          href={sourcePageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all underline decoration-[var(--gcc-line)] hover:text-[var(--gcc-teal-deep)]"
                        >
                          {sourcePageUrl}
                        </a>
                      </p>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--gcc-muted)]">{g.reason}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openGapDetail(g)}
                  className="shrink-0 rounded-md border border-[var(--gcc-teal)] px-3 py-1.5 text-sm font-semibold text-[var(--gcc-teal-deep)]"
                >
                  {selectedGapId === g.id ? "Selected" : "Review gap"}
                </button>
              </div>

              {selectedGapId === g.id ? (
                <div className="mt-4 border-t border-[var(--gcc-line)] pt-4">
                  {!section ? (
                    <p className="text-xs text-[var(--gcc-muted)]">Loading section context…</p>
                  ) : (
                    <>
                      <p className="text-xs text-[var(--gcc-muted)]">
                        {section.relatedPages.length} related page
                        {section.relatedPages.length === 1 ? "" : "s"}
                        {section.informationGain
                          ? ` · ${section.informationGain.summary}`
                          : ""}
                      </p>
                      <SerpIngestPanel
                        gapTopic={g.topic}
                        informationGain={section.informationGain}
                        onCurated={setCuratedSerp}
                      />
                      {curatedSerp ? (
                        <p className="mt-2 text-xs text-green-700">
                          SERP shortlist confirmed — will seed the Content Brief on create.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-[var(--gcc-muted)]">
                          SERP ingest is optional but recommended. You can start create without
                          it and hand-enter SERP fields later.
                        </p>
                      )}
                      <div className="mt-3 flex flex-col gap-2">
                        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--gcc-muted)]">
                          Client
                          <select
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            className="mt-1 rounded-md border border-[var(--gcc-line)] bg-white px-2 py-1.5 text-sm text-foreground"
                          >
                            {clients.length === 0 ? (
                              <option value="">No clients yet</option>
                            ) : null}
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {clientError ? (
                          <p className="text-xs text-red-600">{clientError}</p>
                        ) : null}
                      </div>
                      {SHOW_GAP_GENERATE_BUTTON ? (
                        <>
                          <button
                            type="button"
                            disabled={busy || !clientId || !analysisId || !selectedGap || !section || creating}
                            onClick={() => void startCreate()}
                            className="mt-3 rounded-md bg-[var(--gcc-teal)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              !analysisId || !selectedGap || !section
                                ? "Run Site Analyzer and select a gap to enable"
                                : !clientId
                                  ? "Select a client"
                                  : undefined
                            }
                          >
                            {creating ? "Starting…" : "Start create"}
                          </button>
                          {showReuseConfirm ? (
                            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm">
                              <p className="font-medium text-amber-900">A Site Analyzer run already exists for this domain.</p>
                              <p className="mt-1 text-xs text-amber-800">Need a new Site Analyzer run before creating, or use the existing grounding?</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={creating}
                                  onClick={() => void doCreate()}
                                  className="rounded-md bg-[var(--gcc-teal)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  {creating ? "Starting…" : "Use existing run"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setShowReuseConfirm(false);
                                    setError(null);
                                    // Re-run analyzer for this domain
                                    analyze();
                                  }}
                                  className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50"
                                >
                                  Run new Site Analyzer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowReuseConfirm(false)}
                                  className="rounded-md px-3 py-1.5 text-xs text-amber-800 hover:underline"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-xs text-[var(--gcc-muted)] mt-3">
                          Generate is temporarily disabled while Workflow is being rebuilt.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </li>
            );
          })}
        </ul>
      ) : !analysisId ? (
        <div className="rounded-md border border-dashed border-[var(--gcc-line)] bg-white px-4 py-6 text-center">
          <p className="text-sm text-[var(--gcc-muted)]">No Site Analyzer run yet — run Analyze to enable Create.</p>
          <button
            type="button"
            disabled
            className="mt-3 rounded-md bg-[var(--gcc-teal)] px-4 py-2 text-sm font-semibold text-white opacity-40 cursor-not-allowed"
            title="Run Site Analyzer first"
          >
            Create disabled — run Site Analyzer
          </button>
        </div>
      ) : null}
      {gaps.length === 0 && analysisId && !busy && !error ? (
        <p className="text-xs text-amber-700">Site Analyzer ran but produced no gaps — try a different domain or seed topic.</p>
      ) : null}
    </div>
  );
}
