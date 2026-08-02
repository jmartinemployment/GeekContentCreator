"use client";

import { useEffect, useState } from "react";
import { PROVIDER_OPTIONS, type CategoryOption, type LlmProviderType, type ProjectSummary } from "@/lib/content-writer/types";
import {
  createProject,
  getGeekBackendCategories,
  uploadKeywordSource,
  ApiError,
  defaultLlmProvider,
  isProductionContentWriterApi,
} from "@/lib/content-writer/api";
import { SITE_SECTION_STORAGE_KEY } from "@/lib/site-section-storage";
import { SiteContextBanner } from "@/components/SiteContextBanner";
import type { SiteSectionContext } from "@/lib/types";

function formatSiteSectionResearchFile(payload: {
  gapTopic?: string;
  section?: {
    gapTopic?: string;
    gapSectionPath?: string | null;
    relatedPages?: {
      url: string;
      title: string;
      headings?: string[];
      excerpt?: string;
    }[];
    topicalNeighbors?: string[];
  };
}): string {
  const section = payload.section;
  if (!section?.relatedPages?.length) return "";
  const n = section.relatedPages.length;
  const lines: string[] = [
    "Site Analyzer — existing site section context for content generation.",
    `Using ${n} related page${n === 1 ? "" : "s"}.`,
    `Gap topic: ${payload.gapTopic || section.gapTopic || ""}`,
  ];
  if (section.gapSectionPath) lines.push(`Section path: ${section.gapSectionPath}`);
  for (const page of section.relatedPages.slice(0, 8)) {
    lines.push("");
    lines.push(`Page: ${page.title || "(untitled)"}`);
    lines.push(`URL: ${page.url}`);
    if (page.headings?.length) lines.push(`Headings: ${page.headings.slice(0, 8).join(" | ")}`);
    if (page.excerpt) lines.push(`Excerpt: ${page.excerpt.slice(0, 800)}`);
  }
  if (section.topicalNeighbors?.length) {
    lines.push("");
    lines.push(`Topical neighbors: ${section.topicalNeighbors.join(" | ")}`);
  }
  return lines.join("\n");
}

export default function ProjectForm({
  clientId,
  onCreated,
  initialKeyword = "",
  initialUrl = "",
  initialName = "",
}: {
  clientId: string;
  onCreated: (project: ProjectSummary) => void;
  /** Prefill from Site Analyzer gap (CC addition). */
  initialKeyword?: string;
  initialUrl?: string;
  initialName?: string;
}) {
  const [name, setName] = useState(initialName);
  const [projectUrl, setProjectUrl] = useState(initialUrl);
  const [targetKeyword, setTargetKeyword] = useState(initialKeyword);
  const [department, setDepartment] = useState("");
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [preferredProvider, setPreferredProvider] = useState<LlmProviderType>(defaultLlmProvider);
  const [useExactKeywordAsTitle, setUseExactKeywordAsTitle] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteSectionPreview, setSiteSectionPreview] =
    useState<SiteSectionContext | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SITE_SECTION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        siteAnalysisId?: string;
        gapTopic?: string;
        section?: SiteSectionContext;
      };
      if (parsed.section?.relatedPages?.length) {
        setSiteSectionPreview({
          siteAnalysisId: parsed.siteAnalysisId || parsed.section.siteAnalysisId || "",
          gapTopic: parsed.gapTopic || parsed.section.gapTopic || "",
          gapSectionPath: parsed.section.gapSectionPath ?? null,
          relatedPages: parsed.section.relatedPages,
          topicalNeighbors: parsed.section.topicalNeighbors ?? [],
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getGeekBackendCategories(clientId)
      .then((options) => {
        if (!cancelled) setCategories(options);
      })
      .catch(() => {
        if (!cancelled) setCategoriesError("Could not load departments.");
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const project = await createProject({
        clientId,
        name,
        projectUrl,
        targetKeyword,
        department,
        preferredProvider,
        useExactKeywordAsTitle,
      });

      // CC addition: Site Analyzer section → research upload (NOT project.Notes —
      // CWV2 parses Notes as comma-separated DesiredHeadings).
      // When SA context is claimed, related pages are required — never create
      // a keyword-only project from an Analyzer-started flow.
      const raw = sessionStorage.getItem(SITE_SECTION_STORAGE_KEY);
      if (raw) {
        let parsed: {
          siteAnalysisId?: string;
          gapTopic?: string;
          section?: Parameters<typeof formatSiteSectionResearchFile>[0]["section"];
        };
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error(
            "Site Analyzer context is corrupted. Re-pick the gap from Site Analyzer.",
          );
        }
        const pageCount = parsed.section?.relatedPages?.length ?? 0;
        if (!pageCount) {
          throw new Error(
            "Site Analyzer create requires related pages from the site section. Re-pick the gap.",
          );
        }
        const text = formatSiteSectionResearchFile(parsed);
        if (!text) {
          throw new Error(
            "Could not build site section research for Generate. Re-pick the gap.",
          );
        }
        try {
          const file = new File(
            [text],
            `site-analyzer-section-${pageCount}pages.txt`,
            { type: "text/plain" },
          );
          await uploadKeywordSource(project.id, "CompetitorCrawl", file);
        } catch (uploadErr) {
          const msg =
            uploadErr instanceof ApiError
              ? uploadErr.message
              : "Failed to attach site section research";
          throw new Error(
            `${msg}. Project was created but Generate must not run keyword-only — upload research or re-start from Site Analyzer.`,
          );
        }
        sessionStorage.removeItem(SITE_SECTION_STORAGE_KEY);
        setSiteSectionPreview(null);
      }

      onCreated(project);
      setName("");
      setProjectUrl("");
      setTargetKeyword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not create project.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">New Project</h2>
      <p className="mt-1 text-sm text-muted">
        Enter the client site to crawl and the primary keyword this content set should target.
      </p>

      {siteSectionPreview ? (
        <div className="mt-4">
          <SiteContextBanner siteSection={siteSectionPreview} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Project Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme HVAC - AI Chatbot Launch"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Target Keyword
          <input
            required
            value={targetKeyword}
            onChange={(e) => setTargetKeyword(e.target.value)}
            placeholder="ai chatbot implementation cost"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Department
          {categoriesError ? (
            <span className="text-xs text-red-600">{categoriesError}</span>
          ) : (
            <select
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={categories === null}
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              <option value="">{categories === null ? "Loading departments..." : "Select a department"}</option>
              {categories?.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name ?? c.slug}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
          Project URL
          <input
            required
            type="url"
            value={projectUrl}
            onChange={(e) => setProjectUrl(e.target.value)}
            placeholder="https://client-site.com"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
          LLM Provider
          <select
            value={preferredProvider}
            onChange={(e) => setPreferredProvider(e.target.value as LlmProviderType)}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {isProductionContentWriterApi() && preferredProvider === "LmStudio" && (
            <span className="text-xs text-amber-700">
              LM Studio only works when the API runs on your machine. Use OpenAI or Anthropic on production.
            </span>
          )}
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-foreground sm:col-span-2">
          <input
            type="checkbox"
            checked={useExactKeywordAsTitle}
            onChange={(e) => setUseExactKeywordAsTitle(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand focus:ring-2 focus:ring-brand/20"
          />
          Use exact keyword as title
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
      >
        {isSubmitting ? "Creating..." : "Create Project"}
      </button>
    </form>
  );
}
