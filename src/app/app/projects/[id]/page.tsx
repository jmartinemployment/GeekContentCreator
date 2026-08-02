"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import CrawlPanel from "@/components/content-writer/CrawlPanel";
import FileUploadPanel from "@/components/content-writer/FileUploadPanel";
import ContentBriefPanel from "@/components/content-writer/ContentBriefPanel";
import NotesPanel from "@/components/content-writer/NotesPanel";
import ContentResults from "@/components/content-writer/ContentResults";
import HumanToolsHint from "@/components/content-writer/HumanToolsHint";
import ContentApprovalPanel from "@/components/content-writer/ContentApprovalPanel";
import DraftQualityPanel from "@/components/content-writer/DraftQualityPanel";
import DraftRevisePanel from "@/components/content-writer/DraftRevisePanel";
import ReviewPublishPanel from "@/components/content-writer/ReviewPublishPanel";
import { crawlProject, getProject } from "@/lib/content-writer/api";
import type {
  CrawlSummary,
  GeneratedContentSet,
  KeywordSourceResponse,
  ProjectDetail,
} from "@/lib/content-writer/types";

/**
 * Legacy Content Writer v2 project page.
 * Happy path writing is /app/creates — generate/revise/approve live there.
 */
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
  const [reviseSeed, setReviseSeed] = useState<{
    feedback: string;
    contentType: "TechnicalArticle" | "BlogPost";
  } | null>(null);
  const [gccCreateId, setGccCreateId] = useState<string | null>(null);
  const [briefSavedOnServer, setBriefSavedOnServer] = useState(false);

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
        <Link href="/app/creates" className="mt-4 inline-block text-sm text-brand hover:underline">
          &larr; Back to creates
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
        &larr; Projects
      </Link>

      <div className="mb-6 mt-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          {project.targetKeyword}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">{project.name}</h1>
        <p className="mt-2 text-sm text-muted">{project.projectUrl}</p>
      </div>

      <p className="mb-6 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
        Legacy Content Writer v2 project. For brief → generate → revise → approve, use{" "}
        <Link href="/app/creates" className="font-semibold text-brand hover:underline">
          Creates
        </Link>
        {gccCreateId ? (
          <>
            {" "}
            or open{" "}
            <Link
              href={`/app/creates/${gccCreateId}`}
              className="font-semibold text-brand hover:underline"
            >
              this create workspace
            </Link>
            {briefSavedOnServer ? " (brief saved)" : ""}.
          </>
        ) : (
          "."
        )}
      </p>

      <div className="flex flex-col gap-6">
        {autoCrawlMsg ? <p className="text-sm text-muted">{autoCrawlMsg}</p> : null}

        <ContentBriefPanel
          clientId={project.clientId}
          targetKeyword={project.targetKeyword}
          onBriefValidityChange={() => {}}
          onBriefSaved={(id, ok) => {
            setGccCreateId(id || null);
            setBriefSavedOnServer(ok && !!id);
          }}
        />

        {gccCreateId ? (
          <Link
            href={`/app/creates/${gccCreateId}`}
            className="inline-flex w-fit rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
          >
            Continue on create workspace →
          </Link>
        ) : null}

        <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Legacy project tools (crawl, CWV2 generate steps, Mix on project)
          </summary>
          <div className="mt-4 flex flex-col gap-6">
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

            <NotesPanel projectId={project.id} notes={project.notes} onSaved={setProject} />

            <ContentResults
              projectId={project.id}
              canGenerate={false}
              result={generated}
              onGenerated={setGenerated}
            />

            <HumanToolsHint
              projectId={project.id}
              canRunPillarTools={(generated?.article?.wordCount ?? 0) >= 200}
              result={generated}
              onGenerated={setGenerated}
            />

            <DraftQualityPanel
              result={generated}
              targetKeyword={project.targetKeyword}
              onApplyFeedback={(feedback, contentType) =>
                setReviseSeed({ feedback, contentType })
              }
            />

            <DraftRevisePanel
              projectId={project.id}
              result={generated}
              seedFeedback={reviseSeed?.feedback}
              seedContentType={reviseSeed?.contentType}
              onSeedConsumed={() => setReviseSeed(null)}
              onGenerated={setGenerated}
            />

            <ContentApprovalPanel projectId={project.id} result={generated} />

            <ReviewPublishPanel
              projectId={project.id}
              result={generated}
              onGenerated={setGenerated}
            />
          </div>
        </details>
      </div>
    </div>
  );
}
