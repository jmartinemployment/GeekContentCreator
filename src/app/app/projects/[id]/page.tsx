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
import { crawlProject, getProject, ApiError } from "@/lib/content-writer/api";
import { generateGccCreate, previewBodyDocument } from "@/lib/gcc-api";
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
  const [reviseSeed, setReviseSeed] = useState<{
    feedback: string;
    contentType: "TechnicalArticle" | "BlogPost";
  } | null>(null);
  const [briefFormComplete, setBriefFormComplete] = useState(false);
  const [briefSavedOnServer, setBriefSavedOnServer] = useState(false);
  const [gccCreateId, setGccCreateId] = useState<string | null>(null);
  const [gccGenerateMsg, setGccGenerateMsg] = useState<string | null>(null);
  const [gccGenerating, setGccGenerating] = useState(false);

  /** Content Creator generate: brief must be saved on create (server). Crawl optional for CC path. */
  const canGenerateGcc = briefFormComplete && briefSavedOnServer && !!gccCreateId;

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

  async function runGccGenerate() {
    if (!gccCreateId || !canGenerateGcc) return;
    setGccGenerateMsg(null);
    setGccGenerating(true);
    try {
      const result = await generateGccCreate(gccCreateId);
      if (result.created?.length) {
        const titles = result.created
          .map((c) => c.artifact?.name || c.artifact?.id)
          .filter(Boolean);
        setGccGenerateMsg(
          `Generated ${result.created.length} AI Tool artifact${result.created.length === 1 ? "" : "s"}: ${titles.join(", ")}. Open the create workspace to revise / approve.`,
        );
      } else if (result.artifact && result.version) {
        const preview = previewBodyDocument(result.version.bodyDocumentJson, 280);
        setGccGenerateMsg(
          [
            `Created ${result.artifact.type} “${result.artifact.name}”`,
            `v${result.version.versionNumber}.`,
            preview ? `\n\n${preview}` : "",
          ].join(" "),
        );
      } else {
        setGccGenerateMsg("Generate finished — open the create workspace.");
      }
    } catch (err) {
      setGccGenerateMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Generate failed",
      );
    } finally {
      setGccGenerating(false);
    }
  }

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
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          {project.targetKeyword}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">{project.name}</h1>
        <p className="mt-2 text-sm text-muted">{project.projectUrl}</p>
      </div>

      {canGenerateGcc ? (
        <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          Content Brief saved on Content Creator create — use{" "}
          <strong className="font-semibold">Generate (Content Creator)</strong> below.
        </p>
      ) : (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Generate stays disabled until Content Brief required fields are filled and{" "}
          <strong className="font-semibold">Save brief for generate</strong> succeeds
          {!briefFormComplete ? " (fields incomplete)" : ""}
          {briefFormComplete && !briefSavedOnServer ? " (not saved to server yet)" : ""}
          .
        </p>
      )}

      <div className="flex flex-col gap-6">
        {autoCrawlMsg ? <p className="text-sm text-muted">{autoCrawlMsg}</p> : null}

        <CrawlPanel
          projectId={project.id}
          projectUrl={project.projectUrl}
          crawl={crawl}
          onCrawled={setCrawl}
        />

        <ContentBriefPanel
          clientId={project.clientId}
          targetKeyword={project.targetKeyword}
          onBriefValidityChange={setBriefFormComplete}
          onBriefSaved={(id, ok) => {
            setGccCreateId(id || null);
            setBriefSavedOnServer(ok && !!id);
          }}
        />

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Generate (Content Creator)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Calls <code className="text-xs">/api/geek-content-creator/creates/…/generate</code>.
            Uses persisted BriefJson / ResearchJson from the database only.
          </p>
          <button
            type="button"
            disabled={!canGenerateGcc || gccGenerating}
            onClick={runGccGenerate}
            className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {gccGenerating ? "Generating…" : "Generate starting content"}
          </button>
          {!canGenerateGcc ? (
            <p className="mt-2 text-xs text-muted">
              Disabled until brief is saved — inline required markers above (no redirect).
            </p>
          ) : null}
          {gccGenerateMsg ? (
            <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">{gccGenerateMsg}</p>
          ) : null}
          {gccCreateId ? (
            <Link
              href={`/app/creates/${gccCreateId}`}
              className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
            >
              Open create workspace (draft / revise / SEO / approve) →
            </Link>
          ) : null}
        </div>

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
    </div>
  );
}
