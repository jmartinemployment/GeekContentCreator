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
import { connectThroughCoverageHub } from "@/services/site-analysis-hub";
const SHOW_GAP_GENERATE_BUTTON = false; // Site Analyzer currently only returns headings without matching pages (missing-page gaps). Generate is disabled pending Workflow rebuild. Flip this line if gap types expand to include real content gaps.

type SiteAnalysisProfileListItem = {
  id: string;
  domain: string;
  status?: string | null;
  analyzedAt?: string | null;
  primaryFocus?: string | null;
};

type TreeNode = {
  level?: number;
  Level?: number;
  headingText?: string;
  HeadingText?: string;
  children?: TreeNode[] | null;
  Children?: TreeNode[] | null;
};

type SitePageRow = NonNullable<SiteAnalysis["pages"]>[number];

function flattenTreeHeadings(nodes: TreeNode[] | null | undefined): Array<{ level: number; text: string }> {
  const out: Array<{ level: number; text: string }> = [];
  function walk(list: TreeNode[], depth: number) {
    for (const n of list) {
      const text = String(n.headingText ?? n.HeadingText ?? "").trim();
      const level = Number(n.level ?? n.Level ?? depth) || depth;
      if (text) out.push({ level: Math.min(Math.max(level, 1), 6), text });
      const kids = n.children ?? n.Children;
      if (kids?.length) walk(kids, depth + 1);
    }
  }
  if (nodes?.length) walk(nodes, 1);
  return out;
}

function treesToSitePages(
  rows: Array<{ pageUrl?: string; PageUrl?: string; treeJson?: string; TreeJson?: string }>,
): SitePageRow[] {
  const pages: SitePageRow[] = [];
  for (const row of rows) {
    const url = String(row.pageUrl ?? row.PageUrl ?? "").trim();
    if (!url) continue;
    let roots: TreeNode[] = [];
    try {
      const raw = row.treeJson ?? row.TreeJson ?? "[]";
      const parsed = JSON.parse(typeof raw === "string" ? raw : "[]") as unknown;
      roots = Array.isArray(parsed) ? (parsed as TreeNode[]) : [];
    } catch {
      roots = [];
    }
    pages.push({
      url,
      title: url,
      headings: flattenTreeHeadings(roots),
    });
  }
  return pages;
}

async function downloadSitemap(siteAnalysisProfileId: string): Promise<void> {
  const response = await fetch(
    `/api/site-analyzer/${encodeURIComponent(siteAnalysisProfileId)}/sitemap`,
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
  const [siteAnalysisProfileId, setSiteAnalysisProfileId] = useState<string | null>(null);
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
  const [reportBefore, setReportBefore] = useState<NonNullable<SiteAnalysis['pages']> | null>(null);
  const [reportAfter, setReportAfter] = useState<NonNullable<SiteAnalysis['pages']>>([]);
  const [profiles, setProfiles] = useState<SiteAnalysisProfileListItem[]>([]);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [loadingTrees, setLoadingTrees] = useState(false);

  // For hierarchy helpers that still need a pages array (use AFTER when available, else BEFORE)
  const sitePages = (reportAfter?.length ?? 0) > 0 ? (reportAfter as SiteAnalysis["pages"]) : (reportBefore ?? []);
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

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        setLoadingProfiles(true);
        setProfilesError(null);
        try {
          const host = domain.trim();
          const url = host
            ? `/api/site-analyzer/profiles/by-domain?domain=${encodeURIComponent(host)}&limit=50`
            : `/api/site-analyzer/profiles/recent?limit=50`;
          const res = await fetch(url, { cache: "no-store" });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(
              typeof body.error === "string" ? body.error : "Could not list site_analysis_profiles",
            );
          }
          const list = (Array.isArray(body) ? body : []) as SiteAnalysisProfileListItem[];
          if (cancelled) return;
          setProfiles(
            list.map((p) => ({
              id: String((p as { id?: string; Id?: string }).id ?? (p as { Id?: string }).Id ?? ""),
              domain: String(
                (p as { domain?: string; Domain?: string }).domain ??
                  (p as { Domain?: string }).Domain ??
                  "",
              ),
              status: (p as { status?: string }).status ?? null,
              analyzedAt:
                (p as { analyzedAt?: string; AnalyzedAt?: string }).analyzedAt ??
                (p as { AnalyzedAt?: string }).AnalyzedAt ??
                null,
              primaryFocus:
                (p as { primaryFocus?: string; PrimaryFocus?: string }).primaryFocus ??
                (p as { PrimaryFocus?: string }).PrimaryFocus ??
                null,
            })).filter((p) => p.id),
          );
        } catch (e) {
          if (!cancelled) {
            setProfiles([]);
            setProfilesError(e instanceof Error ? e.message : "Could not list crawls.");
          }
        } finally {
          if (!cancelled) setLoadingProfiles(false);
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [domain]);

  async function applyFinishedCrawl(profileId: string) {
    const res = await fetch(`/api/site-analyzer/${encodeURIComponent(profileId)}`, {
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || "Could not load crawl");
    }

    const rawGaps = (body.gaps ?? body.Gaps ?? []) as Record<string, unknown>[];
    const pagesNow = (body.pages ?? body.Pages ?? []) as NonNullable<SiteAnalysis["pages"]>;
    setReportBefore(pagesNow);
    setReportAfter(pagesNow);
    setGaps(rawGaps.map(normalizeGap));
    setStepLabel(null);
    setSiteAnalysisProfileId(profileId);

    const domainTrimmed = domain.trim();
    let resolvedClientId: string | null = null;
    try {
      const existing = await getGccClientByName(domainTrimmed);
      if (existing) {
        resolvedClientId = existing.id;
      } else {
        const created = await createGccClient({ name: domainTrimmed });
        resolvedClientId = created.id;
      }
      if (resolvedClientId) {
        writeWorkflowClientHandoff({
          clientId: resolvedClientId,
          domain: domainTrimmed,
          siteAnalysisProfileId: profileId,
        });
      }
    } catch (e) {
      console.error("Failed to resolve Workflow client:", e);
    }
    unlockWorkflow();
  }

  function analyze() {
    setError(null);
    setGaps([]);
    setSelectedGapId(null);
    setSection(null);
    setCuratedSerp(null);
    setSiteAnalysisProfileId(null);
    setStepLabel(null);
    setReportBefore(null);
    setReportAfter([]);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setAnalyzing(true);

    const beforeDomain = domain.trim();
    if (beforeDomain) {
      const normalizedUrl = beforeDomain.startsWith("http") ? beforeDomain : `https://${beforeDomain}`;
      setReportBefore([
        {
          url: normalizedUrl,
          title: beforeDomain,
          headings: [],
        },
      ]);
    } else {
      setReportBefore([]);
    }

    startTransition(async () => {
      try {
        const hub = await connectThroughCoverageHub({
          signal: ac.signal,
          onProgress: (p) => {
            if (p.stepNumber || p.step) {
              setStepLabel(
                p.step
                  ? `Step ${p.stepNumber}${p.totalSteps ? `/${p.totalSteps}` : ""}: ${p.step}`
                  : `Step ${p.stepNumber}${p.totalSteps ? `/${p.totalSteps}` : ""}`,
              );
            }
          },
        });
        const res = await fetch("/api/site-analyzer/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain,
            force: true,
          }),
          signal: ac.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not start site analysis");
        const profileId = await hub.done;
        await applyFinishedCrawl(profileId);
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

  async function selectSiteAnalysisProfile(profileId: string) {
    const id = profileId.trim();
    if (!id) return;
    setError(null);
    setSiteAnalysisProfileId(id);
    setLoadingTrees(true);
    try {
      const res = await fetch(
        `/api/site-analyzer/profiles/${encodeURIComponent(id)}/trees`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Could not load trees for crawl",
        );
      }
      const rows = Array.isArray(body) ? body : [];
      const pages = treesToSitePages(rows);
      setReportBefore(pages);
      setReportAfter(pages);
      setGaps([]);

      const picked = profiles.find((p) => p.id === id);
      const domainTrimmed = (picked?.domain || domain).trim() || domain.trim();
      if (domainTrimmed && !domain.trim()) setDomain(domainTrimmed);

      let resolvedClientId: string | null = null;
      try {
        const name = domainTrimmed || picked?.domain || "site";
        const existing = await getGccClientByName(name);
        if (existing) resolvedClientId = existing.id;
        else {
          const created = await createGccClient({ name });
          resolvedClientId = created.id;
        }
      } catch (e) {
        console.error("Failed to resolve Workflow client for selected crawl:", e);
      }

      if (resolvedClientId) {
        writeWorkflowClientHandoff({
          clientId: resolvedClientId,
          domain: domainTrimmed,
          siteAnalysisProfileId: id,
        });
      }
      unlockWorkflow();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load crawl trees");
    } finally {
      setLoadingTrees(false);
    }
  }

  function openGapDetail(gap: ContentGap) {
    setError(null);
    setSelectedGapId(gap.id);
    setSection(null);
    setCuratedSerp(null);
    if (!siteAnalysisProfileId) return;
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/site-analyzer/section-context?siteAnalysisProfileId=${encodeURIComponent(siteAnalysisProfileId)}&gapTopic=${encodeURIComponent(gap.topic)}`,
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
    if (!siteAnalysisProfileId || !selectedGap || !section) return;
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
        siteAnalysisProfileId: section.siteAnalysisProfileId || siteAnalysisProfileId,
        gapTopic: section.gapTopic || selectedGap.topic,
        gapSectionPath: section.gapSectionPath ?? gapSectionPath,
      };
      const created = await createGccCreate({
        clientId,
        topic: selectedGap.topic,
        notes: gapReason,
        siteAnalysisProfileId: siteAnalysisProfileId,
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
    if (!siteAnalysisProfileId || !selectedGap || !section) return;
    if (!clientId) {
      setError("Select a client before starting a create.");
      return;
    }
    // Disabled until Site Analyzer run — now a run exists (siteAnalysisProfileId+gap+section), ask if new run needed.
    if (siteAnalysisProfileId && selectedGap && section && clients.length > 0) {
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
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--gcc-ink)]">
            Existing crawl (site_analysis_profiles.Id)
          </span>
          <select
            value={siteAnalysisProfileId ?? ""}
            disabled={loadingProfiles || analyzing || loadingTrees}
            onChange={(e) => {
              const v = e.target.value;
              if (v) void selectSiteAnalysisProfile(v);
              else setSiteAnalysisProfileId(null);
            }}
            className="rounded-md border border-[var(--gcc-line)] bg-white px-3 py-2 text-sm"
          >
            <option value="">
              {loadingProfiles
                ? "Loading crawls…"
                : profiles.length === 0
                  ? "No crawls found — Analyze or clear domain filter"
                  : "Select a crawl…"}
            </option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.domain}
                {p.analyzedAt ? ` · ${new Date(p.analyzedAt).toLocaleString()}` : ""}
                {` · ${p.id.slice(0, 8)}…`}
              </option>
            ))}
          </select>
          {profilesError ? <span className="text-xs text-red-700">{profilesError}</span> : null}
          {loadingTrees ? (
            <span className="text-xs text-[var(--gcc-muted)]">Loading trees for reports…</span>
          ) : null}
        </label>
        <p className="text-xs text-[var(--gcc-muted)]">
          Enter a site domain and click Analyze, or pick an existing site_analysis_profiles.Id.
          That GUID is handed to Workflow for hierarchy SQL match. Keyword and department stay on
          Create Project.
        </p>
        {siteAnalysisProfileId ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="break-all text-xs text-[var(--gcc-muted)]">
              site_analysis_profiles.Id: {siteAnalysisProfileId}
            </p>
            <button
              type="button"
              onClick={() => {
                router.push(
                  `/app/workflow?siteAnalysisProfileId=${encodeURIComponent(siteAnalysisProfileId)}`,
                );
              }}
              className="rounded-md border border-[var(--gcc-line)] px-3 py-1 text-xs font-semibold"
            >
              Open Workflow Create Project
            </button>
          </div>
        ) : null}
        {stepLabel ? (
          <p className="text-xs text-[var(--gcc-muted)]">{stepLabel}</p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {siteAnalysisProfileId ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-[var(--gcc-muted)]">Analysis {siteAnalysisProfileId}</p>
          <button
            type="button"
            onClick={() => {
              downloadSitemap(siteAnalysisProfileId).catch((err) => {
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

      {((reportBefore?.length ?? 0) > 0 || (reportAfter?.length ?? 0) > 0) ? (
        <div className="space-y-6">
          {reportBefore && reportBefore.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  REPORT 1 — BEFORE ANY PROCESSING WHATSOEVER
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  {reportBefore.length} pages — raw crawl before GeekAPI, before any processing/manipulation/filtering/dedup, before database. Exact order as returned by crawler (unfiltered, no dedup, including duplicates and 0-heading pages).
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-background text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">URL</th>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Headings (raw, in order)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportBefore.map((p, idx) => (
                        <tr key={`before-${p.url}::${idx}`} className="border-b border-border last:border-0 align-top">
                          <td className="px-3 py-2 text-xs text-muted">{idx + 1}</td>
                          <td className="px-3 py-2 text-xs">
                            <a href={p.url} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">
                              {p.url}
                            </a>
                          </td>
                          <td className="px-3 py-2 text-xs text-foreground">{p.title || "(no title)"}</td>
                          <td className="px-3 py-2 text-xs text-muted">
                            {p.headings.length === 0 ? (
                              <span>(no headings)</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {p.headings.map((h, hi) => (
                                  <li key={`b-${idx}-${hi}-${h.level}-${h.text}`} style={{ paddingLeft: `${Math.max(0, h.level - 1) * 0.5}rem` }}>
                                    H{h.level}: {h.text}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
          {(reportAfter?.length ?? 0) > 0 ? (
            <div className="space-y-3">
              <div className="rounded-md border border-[var(--gcc-teal)] bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gcc-ink)]">
                  REPORT 2 — AFTER DATA HAS BEEN INSERTED INTO THE DATABASE
                </p>
                <p className="mt-1 text-xs text-[var(--gcc-muted)]">
                  {(reportAfter?.length ?? 0)} pages — re-fetched from database after GeekAPI insert (same crawl, same order, unfiltered, no dedup). Compare with REPORT 1 to verify lossless.
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-background text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">URL</th>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Headings (raw, in order)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportAfter.map((p, idx) => (
                        <tr key={`after-${p.url}::${idx}`} className="border-b border-border last:border-0 align-top">
                          <td className="px-3 py-2 text-xs text-muted">{idx + 1}</td>
                          <td className="px-3 py-2 text-xs">
                            <a href={p.url} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">
                              {p.url}
                            </a>
                          </td>
                          <td className="px-3 py-2 text-xs text-foreground">{p.title || "(no title)"}</td>
                          <td className="px-3 py-2 text-xs text-muted">
                            {p.headings.length === 0 ? (
                              <span>(no headings)</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {p.headings.map((h, hi) => (
                                  <li key={`a-${idx}-${hi}-${h.level}-${h.text}`} style={{ paddingLeft: `${Math.max(0, h.level - 1) * 0.5}rem` }}>
                                    H{h.level}: {h.text}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
                            disabled={busy || !clientId || !siteAnalysisProfileId || !selectedGap || !section || creating}
                            onClick={() => void startCreate()}
                            className="mt-3 rounded-md bg-[var(--gcc-teal)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              !siteAnalysisProfileId || !selectedGap || !section
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
      ) : !siteAnalysisProfileId ? (
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
      {gaps.length === 0 && siteAnalysisProfileId && !busy && !error ? (
        <p className="text-xs text-amber-700">Site Analyzer ran but produced no gaps — try a different domain or seed topic.</p>
      ) : null}
    </div>
  );
}
