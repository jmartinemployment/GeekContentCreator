/** SERP lens DTOs — mirror GeekAPI GccSerpLensModels (operator-saved SERP ingest). */

import type { ContentBrief } from "@/lib/content-creator/brief-catalog";

export type SavedSerpOrganic = {
  title: string;
  url: string;
  position: number;
};

export type PaaCandidate = {
  question: string;
  likelyRelevant: boolean;
  reason?: string | null;
};

export type SerpShapeSummary = {
  dominantFormats: string[];
  titlePatterns: string[];
  guidance: string;
  hasPeopleAlsoAsk: boolean;
  organicCount: number;
  pageHint?: string | null;
};

export type PaaPafCluster = {
  questions: PaaCandidate[];
  relatedSearches: string[];
};

export type InformationGainNote = {
  thisSiteCovers: string[];
  competitorOpens: string[];
  summary: string;
};

export type SavedSerpParseResult = {
  organics: SavedSerpOrganic[];
  peopleAlsoAsk: PaaCandidate[];
  relatedSearches: string[];
  shape: SerpShapeSummary;
  missingPaaLikelyPage2: boolean;
  parseWarning?: string | null;
};

/** Curated subset the operator confirms before seeding the brief. */
export type CuratedSerpSeed = {
  serpTitles: string;
  serpUrls: string;
  paaQuestions: string;
  relatedSearches: string;
  shapeGuidance?: string;
  informationGainSummary?: string;
};

/** Build a curated seed from a parse result and operator selection sets. */
export function buildCuratedSerpSeed(
  parsed: SavedSerpParseResult,
  organics: Set<number> | ReadonlySet<number>,
  paa: Set<number> | ReadonlySet<number>,
  related: Set<number> | ReadonlySet<number>,
  extras?: {
    shapeGuidance?: string;
    informationGainSummary?: string;
  },
): CuratedSerpSeed {
  const selectedO = parsed.organics.filter((_, i) => organics.has(i));
  return {
    serpTitles: selectedO.map((o) => o.title).join("\n"),
    serpUrls: selectedO.map((o) => o.url).join("\n"),
    paaQuestions: parsed.peopleAlsoAsk
      .filter((_, i) => paa.has(i))
      .map((q) => q.question)
      .join("\n"),
    relatedSearches: parsed.relatedSearches
      .filter((_, i) => related.has(i))
      .join("\n"),
    shapeGuidance: extras?.shapeGuidance ?? parsed.shape.guidance,
    informationGainSummary: extras?.informationGainSummary,
  };
}

/**
 * Apply a curated SERP seed onto a Content Brief.
 * `mode: "fill-empty"` keeps existing non-empty fields; `"replace"` overwrites SERP fields from the seed.
 */
export function applyCuratedSerpToBrief(
  brief: ContentBrief,
  seed: CuratedSerpSeed,
  mode: "fill-empty" | "replace" = "fill-empty",
): ContentBrief {
  const pick = (current: string, next: string) => {
    if (mode === "replace") return next;
    return current.trim() ? current : next;
  };

  const next: ContentBrief = {
    ...brief,
    serpTitles: pick(brief.serpTitles, seed.serpTitles),
    serpUrls: pick(brief.serpUrls, seed.serpUrls),
    paaQuestions: pick(brief.paaQuestions, seed.paaQuestions),
    relatedSearches: pick(brief.relatedSearches, seed.relatedSearches),
  };

  if (!brief.writingNotes.trim()) {
    const noteBits = [
      seed.shapeGuidance?.trim() ? `SERP shape: ${seed.shapeGuidance.trim()}` : "",
      seed.informationGainSummary?.trim()
        ? `Information Gain: ${seed.informationGainSummary.trim()}`
        : "",
    ].filter(Boolean);
    if (noteBits.length) {
      next.writingNotes = noteBits.join("\n");
    }
  }

  return next;
}

export function curatedSerpHasOrganics(seed: CuratedSerpSeed): boolean {
  return seed.serpTitles
    .split("\n")
    .map((s) => s.trim())
    .some(Boolean);
}
