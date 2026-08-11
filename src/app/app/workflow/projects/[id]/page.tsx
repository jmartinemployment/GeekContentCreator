"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import HierarchyContextPanel, {
  type HierarchyGateState,
} from "@/components/content-writer/HierarchyContextPanel";
import FileUploadPanel from "@/components/content-writer/FileUploadPanel";
import ContentBriefPanel from "@/components/content-creator/ContentBriefPanel";
import ContentResults from "@/components/content-writer/ContentResults";
import ReviewPublishPanel from "@/components/content-writer/ReviewPublishPanel";
import { useWorkflowGate } from "@/components/WorkflowGate";
import { getProject } from "@/services/content-writer-api";
import { readWorkflowClientHandoff } from "@/lib/site-section-storage";
import type {
  GeneratedContentSet,
  KeywordSourceResponse,
  ProjectDetail,
} from "@/lib/types";

export default function WorkflowProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { workflowUnlocked } = useWorkflowGate();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [keywordSources, setKeywordSources] = useState<KeywordSourceResponse[]>([]);
  const [generated, setGenerated] = useState<GeneratedContentSet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hierarchyGate, setHierarchyGate] = useState<HierarchyGateState>({
    matched: false,
    allowOutsideSiteScope: false,
    loadError: null,
    loading: true,
  });
  const [briefComplete, setBriefComplete] = useState(false);
  const [briefSaved, setBriefSaved] = useState(false);

  const hierarchyOk =
    hierarchyGate.matched || hierarchyGate.allowOutsideSiteScope;
  const hasSerpIndex = Boolean(project?.serpTitles?.trim());
  const hasNonKeywordResearch = keywordSources.some(
    (k) => k.category !== "KeywordResult",
  );
  const researchOk = hasSerpIndex || hasNonKeywordResearch;
  // Brief + Content integrated: Brief is source of truth for lede + all content types — research is optional enrichment, not a gate.
  const canGenerate =
    hierarchyOk && briefComplete && !hierarchyGate.loading;

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoadError(null);
      const detail = await getProject(projectId);
      setProject(detail);
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

  const handleProjectUpdated = useCallback((next: ProjectDetail) => {
    setProject(next);
  }, []);

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

  const siteAnalysisId =
    project.siteAnalysisId ?? readWorkflowClientHandoff()?.siteAnalysisId ?? null;

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
        <HierarchyContextPanel
          projectId={project.id}
          targetKeyword={project.targetKeyword}
          siteAnalysisId={siteAnalysisId}
          initialPath={project.hierarchyPath ?? null}
          initialChildren={project.hierarchyChildHeadings ?? []}
          initialSourcePageUrl={project.hierarchySourcePageUrl ?? null}
          initialAllowOutside={project.allowOutsideSiteScope ?? false}
          onProjectUpdated={handleProjectUpdated}
          onGateChange={setHierarchyGate}
        />

        <ContentBriefPanel
          clientId={project.clientId}
          siteAnalysisId={siteAnalysisId ?? undefined}
          targetKeyword={project.targetKeyword}
          onBriefSaved={(_id, complete) => {
            setBriefSaved(complete);
            setBriefComplete(complete);
          }}
          onBriefValidityChange={setBriefComplete}
        />
        {briefComplete ? null : (
          <p className="text-sm text-amber-700">Content Brief incomplete — Generate will use the saved brief on the linked create; complete the brief to ensure lede + body honor audience/angle/intent.</p>
        )}

        <FileUploadPanel
          projectId={project.id}
          targetKeyword={project.targetKeyword}
          keywordSources={keywordSources}
          serpTitles={project.serpTitles}
          onChanged={setKeywordSources}
          onProjectUpdated={handleProjectUpdated}
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
