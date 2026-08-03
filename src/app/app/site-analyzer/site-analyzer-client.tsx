"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Gap = {
  id: string;
  topic: string;
  sectionPath: string | null;
  reason: string;
  suggestPillar: boolean;
};

import { writeSiteSectionHandoff } from "@/lib/site-section-storage";
import type { SiteSectionContext } from "@/lib/types";

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
  const [domain, setDomain] = useState("");
  const [seedTopic, setSeedTopic] = useState("");
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stepLabel, setStepLabel] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [pending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

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
          }),
          signal: ac.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not start site analysis");
        if (!body.id) throw new Error("Analyze response missing analysis id");

        setAnalysisId(body.id);
        const status = String(body.status || "").toLowerCase();
        if (status === "ready" && Array.isArray(body.gaps)) {
          setGaps(body.gaps);
          if (!body.gaps.length) {
            throw new Error("Site analysis finished but produced no content gaps.");
          }
          return;
        }

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

  function pickGap(gap: Gap) {
    setError(null);
    startTransition(async () => {
      try {
        if (!analysisId) return;
        const res = await fetch(
          `/api/site-analyzer/section-context?analysisId=${encodeURIComponent(analysisId)}&gapTopic=${encodeURIComponent(gap.topic)}`,
        );
        const section = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(section.error || "Section context failed");
        if (!section.relatedPages?.length) {
          throw new Error("Site section context missing related pages");
        }

        const projectUrl = toAbsoluteSiteUrl(domain);
        const siteSection = section as SiteSectionContext;
        try {
          writeSiteSectionHandoff({
            siteAnalysisId: analysisId,
            gapTopic: gap.topic,
            projectUrl,
            section: {
              ...siteSection,
              siteAnalysisId: siteSection.siteAnalysisId || analysisId,
              gapTopic: siteSection.gapTopic || gap.topic,
            },
          });
        } catch {
          throw new Error(
            "Could not store site section context. Allow session storage and try again.",
          );
        }

        const q = new URLSearchParams({
          topic: gap.topic,
          siteAnalysisId: analysisId,
        });
        if (projectUrl) q.set("projectUrl", projectUrl);
        if (gap.suggestPillar) q.set("suggestPillar", "1");

        router.push(`/app/create?${q.toString()}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start create");
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
          Enter a site domain and click Analyze. Analysis runs here and lists content
          gaps when ready. Pick a gap to start a create with related pages from that
          site section.
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
            <li
              key={g.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
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
                onClick={() => pickGap(g)}
                className="shrink-0 rounded-md border border-[var(--gcc-teal)] px-3 py-1.5 text-sm font-semibold text-[var(--gcc-teal-deep)]"
              >
                Start create
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
