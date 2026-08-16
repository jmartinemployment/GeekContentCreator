import type { SiteSectionContext } from "@/lib/types";
import type { CuratedSerpSeed } from "@/lib/content-creator/serp-lens";

/** sessionStorage key for Site Analyzer → Content Creator create handoff. */
export const SITE_SECTION_STORAGE_KEY = "gcc.siteSectionContext";

export type SiteSectionHandoff = {
  siteAnalysisId: string;
  gapTopic: string;
  /** Gap reason from Site Analyzer (seeds brief notes). */
  gapReason?: string | null;
  /** Gap section path (also on section.gapSectionPath). */
  gapSectionPath?: string | null;
  projectUrl?: string;
  section: SiteSectionContext;
  /** Operator-curated SERP seed for Content Brief fields. */
  curatedSerp?: CuratedSerpSeed | null;
};

export function readSiteSectionHandoff(): SiteSectionHandoff | null {
  try {
    const raw = sessionStorage.getItem(SITE_SECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SiteSectionHandoff> & {
      section?: SiteSectionContext;
    };
    const section = parsed.section;
    const siteAnalysisId =
      parsed.siteAnalysisId || section?.siteAnalysisId || "";
    if (!section || !siteAnalysisId) return null;
    if (!section.relatedPages?.length) return null;
    const gapSectionPath =
      parsed.gapSectionPath ?? section.gapSectionPath ?? null;
    return {
      siteAnalysisId,
      gapTopic: parsed.gapTopic || section.gapTopic || "",
      gapReason: parsed.gapReason ?? null,
      gapSectionPath,
      projectUrl: parsed.projectUrl,
      section: {
        ...section,
        siteAnalysisId: section.siteAnalysisId || siteAnalysisId,
        gapSectionPath: section.gapSectionPath ?? gapSectionPath,
      },
      curatedSerp: parsed.curatedSerp ?? null,
    };
  } catch {
    return null;
  }
}

export function writeSiteSectionHandoff(handoff: SiteSectionHandoff): void {
  sessionStorage.setItem(SITE_SECTION_STORAGE_KEY, JSON.stringify(handoff));
}

export function clearSiteSectionHandoff(): void {
  try {
    sessionStorage.removeItem(SITE_SECTION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Body shape GeekAPI CreateCreate expects for siteSection. */
export function siteSectionForApi(section: SiteSectionContext) {
  return {
    siteAnalysisId: section.siteAnalysisId,
    gapTopic: section.gapTopic,
    gapSectionPath: section.gapSectionPath,
    relatedPages: section.relatedPages.map((p) => ({
      url: p.url,
      title: p.title,
      headings: p.headings ?? [],
      excerpt: p.excerpt ?? "",
    })),
    topicalNeighbors: section.topicalNeighbors ?? [],
    informationGain: section.informationGain ?? null,
  };
}

/** sessionStorage key for Site Analyzer → Workflow (plain workflow, not gap-detail) handoff. */
export const WORKFLOW_CLIENT_HANDOFF_KEY = "gcc.workflowClientHandoff";

export type WorkflowClientHandoff = {
  clientId: string;
  domain: string;
  /** Optional GCC poll/report handle (content_creator.gcc_site_analyses.Id). */
  siteAnalysisId?: string;
  /** Required for hierarchy grounding: geek_seo.site_analysis_profiles.Id */
  siteAnalysisProfileId: string;
};

export function readWorkflowClientHandoff(): WorkflowClientHandoff | null {
  try {
    const raw = sessionStorage.getItem(WORKFLOW_CLIENT_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkflowClientHandoff>;
    if (!parsed.clientId || !parsed.siteAnalysisProfileId) return null;
    return {
      clientId: parsed.clientId,
      domain: parsed.domain || "",
      siteAnalysisId: parsed.siteAnalysisId || undefined,
      siteAnalysisProfileId: parsed.siteAnalysisProfileId,
    };
  } catch {
    return null;
  }
}

export function writeWorkflowClientHandoff(handoff: WorkflowClientHandoff): void {
  sessionStorage.setItem(WORKFLOW_CLIENT_HANDOFF_KEY, JSON.stringify(handoff));
}

export function clearWorkflowClientHandoff(): void {
  try {
    sessionStorage.removeItem(WORKFLOW_CLIENT_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}
