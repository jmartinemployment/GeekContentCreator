import type { SiteSectionContext } from "@/lib/types";
import type { CuratedSerpSeed } from "@/lib/content-creator/serp-lens";

/** sessionStorage key for Site Analyzer → Content Creator create handoff. */
export const SITE_SECTION_STORAGE_KEY = "gcc.siteSectionContext";

export type SiteSectionHandoff = {
  siteAnalysisProfileId: string;
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

function crawlIdFromUnknown(parsed: {
  siteAnalysisProfileId?: string;
  siteAnalysisId?: string;
  section?: { siteAnalysisProfileId?: string; siteAnalysisId?: string };
}): string {
  return (
    parsed.siteAnalysisProfileId ||
    parsed.section?.siteAnalysisProfileId ||
    parsed.siteAnalysisId ||
    parsed.section?.siteAnalysisId ||
    ""
  );
}

export function readSiteSectionHandoff(): SiteSectionHandoff | null {
  try {
    const raw = sessionStorage.getItem(SITE_SECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SiteSectionHandoff> & {
      siteAnalysisId?: string;
      section?: SiteSectionContext & { siteAnalysisId?: string };
    };
    const section = parsed.section;
    const siteAnalysisProfileId = crawlIdFromUnknown(parsed);
    if (!section || !siteAnalysisProfileId) return null;
    if (!section.relatedPages?.length) return null;
    const gapSectionPath =
      parsed.gapSectionPath ?? section.gapSectionPath ?? null;
    return {
      siteAnalysisProfileId,
      gapTopic: parsed.gapTopic || section.gapTopic || "",
      gapReason: parsed.gapReason ?? null,
      gapSectionPath,
      projectUrl: parsed.projectUrl,
      section: {
        ...section,
        siteAnalysisProfileId: section.siteAnalysisProfileId || siteAnalysisProfileId,
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
    siteAnalysisProfileId: section.siteAnalysisProfileId,
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
