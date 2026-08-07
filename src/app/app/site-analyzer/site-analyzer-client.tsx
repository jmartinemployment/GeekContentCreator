"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { writeSiteSectionHandoff } from "@/lib/site-section-storage";
import { useWorkflowGate } from "@/components/WorkflowGate";
import type { ContentGap, SiteSectionContext } from "@/lib/types";
import type { CuratedSerpSeed } from "@/lib/content-writer/serp-lens";
import { SerpIngestPanel } from "@/components/content-writer/SerpIngestPanel";

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

function toAbsoluteSiteUrl(domain: string): string {
  const d = domain.trim().replace(/\/$/, "");
  if (!d) return "";
  if (/^https?:\/\//i.test(d)) return d;
  return `https://${d}`;
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

  const selectedGap = gaps.find((g) => g.id === selectedGapId) ?? null;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
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
        // Unlock Workflow on any successful run — a zero-gap crawl is still a
        // real, complete Site Analyzer result, not a failure.
        unlockWorkflow();
        if (!(body.gaps ?? []).length) {
          throw new Error("Site analysis finished but produced no content gaps.");
        }
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

  function openWorkflow() {
    if (!analysisId || !selectedGap || !section) return;
    setError(null);
    startTransition(() => {
      try {
        const projectUrl = toAbsoluteSiteUrl(domain);
        const gapSectionPath =
          selectedGap.sectionPath ?? section.gapSectionPath ?? null;
        writeSiteSectionHandoff({
          siteAnalysisId: analysisId,
          gapTopic: selectedGap.topic,
          gapReason: selectedGap.reason,
          gapSectionPath,
          projectUrl,
          section: {
            ...section,
            siteAnalysisId: section.siteAnalysisId || analysisId,
            gapTopic: section.gapTopic || selectedGap.topic,
            gapSectionPath: section.gapSectionPath ?? gapSectionPath,
          },
          curatedSerp,
        });

        const q = new URLSearchParams({
          topic: selectedGap.topic,
          siteAnalysisId: analysisId,
        });
        if (projectUrl) q.set("projectUrl", projectUrl);
        if (selectedGap.suggestPillar) q.set("suggestPillar", "1");
        if (gapSectionPath) q.set("sectionPath", gapSectionPath);
        if (selectedGap.reason) q.set("gapReason", selectedGap.reason);

        router.push(`/app/create?${q.toString()}`);
      } catch {
        setError(
          "Could not store site section context. Allow session storage and try again.",
        );
      }
    });
  }

  const busy = pending || analyzing;

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
          and Information Gain, then open Workflow with related pages from that site
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
                  {g.sectionPath ? (
                    <p className="text-sm text-[var(--gcc-muted)]">{g.sectionPath}</p>
                  ) : null}
                  <p className="text-xs text-[var(--gcc-muted)]">
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
                          SERP shortlist confirmed — will seed the Content Brief in Workflow.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-[var(--gcc-muted)]">
                          SERP ingest is optional but recommended. You can open Workflow
                          without it and hand-enter SERP fields later.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={openWorkflow}
                        className="mt-3 rounded-md bg-[var(--gcc-teal)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Open Workflow
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !analysisId ? (
        <div className="rounded-md border border-dashed border-[var(--gcc-line)] bg-white px-4 py-6 text-center">
          <p className="text-sm text-[var(--gcc-muted)]">No Site Analyzer run yet — run Analyze to enable Workflow.</p>
          <button
            type="button"
            disabled
            className="mt-3 rounded-md bg-[var(--gcc-teal)] px-4 py-2 text-sm font-semibold text-white opacity-40 cursor-not-allowed"
            title="Run Site Analyzer first"
          >
            Workflow disabled — run Site Analyzer
          </button>
        </div>
      ) : null}
      {gaps.length === 0 && analysisId && !busy && !error ? (
        <p className="text-xs text-amber-700">Site Analyzer ran but produced no gaps — try a different domain or seed topic.</p>
      ) : null}
    </div>
  );
}
