/**
 * GeekAPI Content Creator surface (/api/geek-content-creator).
 * Proxied via /api/cw same-origin helper (Bearer forward).
 */

import type { ContentBrief } from "@/lib/content-writer/brief-catalog";
import { ApiError } from "@/lib/content-writer/api";

const API_BASE = "/api/cw";

export interface GccCreate {
  id: string;
  clientId: string;
  ownerUserId: string;
  startingContentType: string;
  topic: string;
  notes: string | null;
  siteAnalysisId: string | null;
  siteSectionJson: string | null;
  briefJson: string | null;
  researchJson: string | null;
  status: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface GccSerpIndex {
  organicTitles: string[];
  organicUrls: string[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
}

async function gccRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Could not reach GeekAPI Content Creator.", 0);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new ApiError(detail || response.statusText, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function createGccCreate(input: {
  clientId: string;
  startingContentType: string;
  topic: string;
  notes?: string | null;
  siteAnalysisId?: string | null;
}): Promise<GccCreate> {
  return gccRequest<GccCreate>("/api/geek-content-creator/creates", {
    method: "POST",
    body: JSON.stringify({
      clientId: input.clientId,
      startingContentType: input.startingContentType,
      topic: input.topic,
      notes: input.notes ?? null,
      siteAnalysisId: input.siteAnalysisId ?? null,
      siteSection: null,
    }),
  });
}

export function getGccCreate(id: string): Promise<GccCreate> {
  return gccRequest<GccCreate>(`/api/geek-content-creator/creates/${id}`);
}

export function patchBriefResearch(
  createId: string,
  body: { briefJson?: string | null; researchJson?: string | null },
): Promise<GccCreate> {
  return gccRequest<GccCreate>(
    `/api/geek-content-creator/creates/${createId}/brief-research`,
    {
      method: "PATCH",
      body: JSON.stringify({
        briefJson: body.briefJson ?? null,
        researchJson: body.researchJson ?? null,
      }),
    },
  );
}

export function followResearchUrls(
  createId: string,
  urls: string[],
  serpIndex?: GccSerpIndex | null,
): Promise<GccCreate> {
  return gccRequest<GccCreate>(
    `/api/geek-content-creator/creates/${createId}/research/follow`,
    {
      method: "POST",
      body: JSON.stringify({ urls, serpIndex: serpIndex ?? null }),
    },
  );
}

export interface GccArtifactRef {
  id: string;
  createId?: string;
  contentType?: string;
  title?: string;
  status?: string;
}

export interface GccVersionRef {
  id: string;
  artifactId?: string;
  bodyJson?: string;
  versionNumber?: number;
}

export interface GccGenerateResult {
  artifact?: GccArtifactRef;
  version?: GccVersionRef;
  created?: Array<{ artifact: GccArtifactRef; version: GccVersionRef }>;
}

export function generateGccCreate(
  createId: string,
  provider?: string,
): Promise<GccGenerateResult> {
  return gccRequest<GccGenerateResult>(
    `/api/geek-content-creator/creates/${createId}/generate`,
    {
      method: "POST",
      body: JSON.stringify({ provider: provider ?? "OpenAi" }),
    },
  );
}

export function briefToJson(brief: ContentBrief): string {
  return JSON.stringify(brief);
}

export function serpIndexFromBrief(brief: ContentBrief): GccSerpIndex {
  const lines = (text: string) =>
    text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    organicTitles: lines(brief.serpTitles),
    organicUrls: lines(brief.serpUrls),
    peopleAlsoAsk: lines(brief.paaQuestions),
    relatedSearches: lines(brief.relatedSearches),
  };
}

export function organicUrlsFromBrief(brief: ContentBrief): string[] {
  return brief.serpUrls
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export const GCC_CREATE_STORAGE_PREFIX = "gcc-create-id:";
