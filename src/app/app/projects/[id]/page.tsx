"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import CrawlPanel from "@/components/content-writer/CrawlPanel";
import FileUploadPanel from "@/components/content-writer/FileUploadPanel";
import NotesPanel from "@/components/content-writer/NotesPanel";
import ContentResults from "@/components/content-writer/ContentResults";
import HumanToolsHint from "@/components/content-writer/HumanToolsHint";
import DraftQualityPanel from "@/components/content-writer/DraftQualityPanel";
import ReviewPublishPanel from "@/components/content-writer/ReviewPublishPanel";
import { crawlProject, getProject } from "@/lib/content-writer/api";
import type {
  CrawlSummary,
  GeneratedContentSet,
  KeywordSourceResponse,
  ProjectDetail,
} from "@/lib/content-writer/types";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const autoCrawlTried = useRef(false);

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [crawl, setCrawl] = useState<CrawlSummary | null>(null);
  const [keywordSources, setKeywordSources] = useState<KeywordSourceResponse[]>([]);
  const [generated, setGenerated] = useState<GeneratedContentSet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoCrawlMsg, setAutoCrawlMsg] = useState<string | null>(null);

  const canGenerate = crawl !== null && keywordSources.length > 0;

  const load = useCallback(async () => {
    try {
      const detail = await getProject(projectId);
      setProject(detail);
      setCrawl(detail.crawl);
      setKeywordSources(detail.keywordSources);
      setGenerated(detail.contentSet);
      return detail;
    } catch {
      setLoadError("Could not load this project.");
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // CC addition: start crawl once when opening a project that has no crawl yet.
  useEffect(() => {
    if (!project || crawl || !project.projectUrl || autoCrawlTried.current) return;
    autoCrawlTried.current = true;
    let cancelled = false;
    setAutoCrawlMsg("Crawling site…");
    crawlProject(project.id, 40)
      .then((summary) => {
        if (!cancelled) {
          setCrawl(summary);
          setAutoCrawlMsg(null);
        }
      })
      .catch(() => {
        if (!cancelled) setAutoCrawlMsg("Auto-crawl failed — use Crawl below.");
      });
    return () => {
      cancelled = true;
    };
  }, [project, crawl]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-red-600">{loadError}</p>
        <Link href="/app" className="mt-4 inline-block text-sm text-brand hover:underline">
          &larr; Back to dashboard
        </Link>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/app" className="text-sm text-brand hover:underline">
        &larr; Back to dashboard
      </Link>

      <div className="mb-8 mt-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">{project.targetKeyword}</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">{project.name}</h1>
        <p className="mt-2 text-sm text-muted">{project.projectUrl}</p>
      </div>

      {keywordSources.some((k) =>
        (k.originalFileName || "").toLowerCase().includes("site-analyzer")
      ) ? (
        <p className="mb-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          Site Analyzer research is attached under Upload Research. Crawl the site (auto-runs once),
          then Generate plan below.
        </p>
      ) : null}

      {canGenerate ? (
        <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          Ready to generate — crawl and research are in place. Use{" "}
          <strong className="font-semibold">Generate plan</strong> in step 5.
        </p>
      ) : (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Generate unlocks after crawl finishes and at least one research file is present
          {keywordSources.length > 0 ? " (research attached — waiting on crawl)" : crawl ? " (crawl done — upload research or use Site Analyzer)" : ""}.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {autoCrawlMsg ? (
          <p className="text-sm text-muted">{autoCrawlMsg}</p>
        ) : null}

        <CrawlPanel projectId={project.id} projectUrl={project.projectUrl} crawl={crawl} onCrawled={setCrawl} />

        <FileUploadPanel projectId={project.id} keywordSources={keywordSources} onChanged={setKeywordSources} />

        <NotesPanel projectId={project.id} notes={project.notes} onSaved={setProject} />

        <ContentResults
          projectId={project.id}
          canGenerate={canGenerate}
          result={generated}
          onGenerated={setGenerated}
        />

        <HumanToolsHint
          projectId={project.id}
          canRunTools={(generated?.article?.wordCount ?? 0) >= 200}
          onGenerated={setGenerated}
        />

        <DraftQualityPanel
          result={generated}
          targetKeyword={project.targetKeyword}
        />

        <ReviewPublishPanel projectId={project.id} result={generated} onGenerated={setGenerated} />
      </div>
    </div>
  );
}
