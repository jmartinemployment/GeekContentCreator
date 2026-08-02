"use client";

import { useState, useTransition } from "react";
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
  const [pending, startTransition] = useTransition();

  function analyze() {
    setError(null);
    setGaps([]);
    setAnalysisId(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/site-analyzer/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain,
            seedTopic: seedTopic || null,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Analyze failed");
        setAnalysisId(body.id);
        setGaps(body.gaps ?? []);
        if (!(body.gaps ?? []).length) {
          setError(
            "Site analysis loaded, but Geek-SEO reported no content gaps for this domain.",
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Analyze failed");
      }
    });
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
        if (!siteSection.relatedPages?.length) {
          throw new Error(
            "Site section context missing related pages — cannot start keyword-only.",
          );
        }
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

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="flex-1 rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
          />
          <input
            value={seedTopic}
            onChange={(e) => setSeedTopic(e.target.value)}
            placeholder="Optional seed topic"
            className="flex-1 rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending || !domain.trim()}
            onClick={analyze}
            className="rounded-md bg-[var(--gcc-teal)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Working…" : "Analyze"}
          </button>
        </div>
        <p className="text-xs text-[var(--gcc-muted)]">
          Loads content gaps and existing pages from your Geek-SEO project for
          this domain. If the site is not analyzed there yet, Analyze returns an
          error — it does not invent gaps.
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {analysisId ? (
        <p className="text-xs text-[var(--gcc-muted)]">Analysis {analysisId}</p>
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
                disabled={pending}
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
