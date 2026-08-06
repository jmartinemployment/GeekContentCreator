"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearSiteSectionHandoff } from "@/lib/site-section-storage";
import { useWorkflowGate } from "@/components/WorkflowGate";
import type { ContentGap, SiteSectionContext } from "@/lib/types";
import type { CuratedSerpSeed } from "@/lib/content-writer/serp-lens";
import { SerpIngestPanel } from "@/components/content-writer/SerpIngestPanel";
import { createGccCreate } from "@/lib/gcc-api";
import { getClients, ApiError } from "@/lib/content-writer/api";
import type { Client } from "@/lib/content-writer/types";

const POLL_MS = 2500;
const MAX_WAIT_MS = 15 * 60 * 1000;

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

export function SiteAnalyzerClient() {
  const router = useRouter();
  const { unlockWorkflow } = useWorkflowGate();
  const [domain, setDomain] = useState("");
  const [seedTopic, setSeedTopic] = useState("");
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
        setGaps(body.gaps ?? []);
        setStepLabel(null);
        if (!(body.gaps ?? []).length) {
          throw new Error("Site analysis finished but produced no content gaps.");
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
            seedTopic: seedTopic || null,
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
          <input
            value={seedTopic}
            onChange={(e) => setSeedTopic(e.target.value)}
            placeholder="Optional seed topic"
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

      {gaps.length > 0 ? (
        <ul className="divide-y divide-[var(--gcc-line)] border border-[var(--gcc-line)] bg-white">
          {gaps.map((g) => (
            <li key={g.id} className="px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{g.topic}</p>
                  <p className="text-xs text-[var(--gcc-muted)]">
                    {g.sectionPath ? `${g.sectionPath} · ` : ""}
                    {g.reason}
                    {g.suggestPillar ? " · suggest pillar" : ""}
                  </p>
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
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
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
      )}
      {gaps.length === 0 && analysisId && !busy ? (
        <p className="text-xs text-amber-700">Site Analyzer ran but produced no gaps — try a different domain or seed topic.</p>
      ) : null}
    </div>
  );
}
