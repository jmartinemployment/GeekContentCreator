"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import CrawlPanel from "@/components/content-writer/CrawlPanel";
import FileUploadPanel from "@/components/content-writer/FileUploadPanel";
import NotesPanel from "@/components/content-writer/NotesPanel";
import ContentResults from "@/components/content-writer/ContentResults";
import ReviewPublishPanel from "@/components/content-writer/ReviewPublishPanel";
import { useWorkflowGate } from "@/components/WorkflowGate";
import { getProject } from "@/services/content-writer-api";
import type {
  CrawlSummary,
  GeneratedContentSet,
  KeywordSourceResponse,
  ProjectDetail,
} from "@/lib/types";

export default function WorkflowProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { workflowUnlocked } = useWorkflowGate();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [crawl, setCrawl] = useState<CrawlSummary | null>(null);
  const [keywordSources, setKeywordSources] = useState<KeywordSourceResponse[]>([]);
  const [generated, setGenerated] = useState<GeneratedContentSet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canGenerate = crawl !== null && keywordSources.length > 0;

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoadError(null);
      const detail = await getProject(projectId);
      setProject(detail);
      setCrawl(detail.crawl);
      setKeywordSources(detail.keywordSources);
      setGenerated(detail.contentSet);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load this project.",
      );
    }
  }, [projectId]);

  useEffect(() => {
    if (!workflowUnlocked) return;
    void load();
  }, [load, workflowUnlocked]);

  if (!workflowUnlocked) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-muted">
          Workflow is disabled. Run Site Analyzer first to unlock it.{" "}
          <Link href="/app/site-analyzer" className="text-brand hover:underline">
            Go to Site Analyzer
          </Link>
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-red-600">{loadError}</p>
        <Link
          href="/app/workflow"
          className="mt-4 inline-block text-sm text-brand hover:underline"
        >
          &larr; Back to Workflow
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
      <Link href="/app/workflow" className="text-sm text-brand hover:underline">
        &larr; Back to Workflow
      </Link>

      <div className="mb-8 mt-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          {project.targetKeyword}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">{project.name}</h1>
        <p className="mt-2 text-sm text-muted">{project.projectUrl}</p>
      </div>

      <div className="flex flex-col gap-6">
        <CrawlPanel
          projectId={project.id}
          projectUrl={project.projectUrl}
          crawl={crawl}
          onCrawled={setCrawl}
        />

        <FileUploadPanel
          projectId={project.id}
          keywordSources={keywordSources}
          onChanged={setKeywordSources}
        />

        <NotesPanel
          projectId={project.id}
          notes={project.notes}
          onSaved={setProject}
        />

        <ContentResults
          projectId={project.id}
          canGenerate={canGenerate}
          result={generated}
          onGenerated={setGenerated}
        />

        <ReviewPublishPanel
          projectId={project.id}
          result={generated}
          onGenerated={setGenerated}
        />
      </div>
    </div>
  );
}
