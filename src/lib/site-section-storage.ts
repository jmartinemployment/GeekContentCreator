import type { SiteSectionContext } from "@/lib/types";

/** sessionStorage key for Site Analyzer → Content Creator create handoff. */
export const SITE_SECTION_STORAGE_KEY = "gcc.siteSectionContext";

export type SiteSectionHandoff = {
  siteAnalysisId: string;
  gapTopic: string;
  projectUrl?: string;
  section: SiteSectionContext;
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
    return {
      siteAnalysisId,
      gapTopic: parsed.gapTopic || section.gapTopic || "",
      projectUrl: parsed.projectUrl,
      section: {
        ...section,
        siteAnalysisId: section.siteAnalysisId || siteAnalysisId,
      },
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
  };
}
