/**
 * GeekAPI Content Creator surface (/api/geek-content-creator).
 * Proxied via /api/cw same-origin helper (Bearer forward).
 */

import type { ContentBrief } from "@/lib/content-writer/brief-catalog";
import { ApiError } from "@/lib/content-writer/api";
import type { SiteSectionContext } from "@/lib/types";
import { siteSectionForApi } from "@/lib/site-section-storage";
import type { SavedSerpParseResult } from "@/lib/content-writer/serp-lens";

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
  siteSection?: SiteSectionContext | null;
}): Promise<GccCreate> {
  const siteAnalysisId = input.siteAnalysisId ?? null;
  const siteSection = input.siteSection ?? null;
  if (siteAnalysisId && (!siteSection || !siteSection.relatedPages?.length)) {
    throw new ApiError(
      "Site Analyzer create requires non-empty relatedPages in site section context.",
      400,
    );
  }
  return gccRequest<GccCreate>("/api/geek-content-creator/creates", {
    method: "POST",
    body: JSON.stringify({
      clientId: input.clientId,
      startingContentType: input.startingContentType,
      topic: input.topic,
      notes: input.notes ?? null,
      siteAnalysisId,
      siteSection: siteSection ? siteSectionForApi(siteSection) : null,
    }),
  });
}

export function listGccCreates(clientId?: string | null): Promise<GccCreate[]> {
  const q = clientId
    ? `?clientId=${encodeURIComponent(clientId)}`
    : "";
  return gccRequest<GccCreate[]>(`/api/geek-content-creator/creates${q}`);
}

export function getGccCreate(id: string): Promise<GccCreate> {
  return gccRequest<GccCreate>(`/api/geek-content-creator/creates/${id}`);
}

export function parseSiteSectionJson(
  json: string | null | undefined,
): SiteSectionContext | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as SiteSectionContext;
    if (!parsed.relatedPages?.length) return null;
    return parsed;
  } catch {
    return null;
  }
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

export interface GccArtifact {
  id: string;
  createId: string;
  parentArtifactId?: string | null;
  type: string;
  name: string;
  status: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface GccArtifactVersion {
  id: string;
  artifactId: string;
  versionNumber: number;
  bodyDocumentJson: string;
  metadataJson?: string | null;
  createdAtUtc: string;
}

export interface GccCreateDetail extends GccCreate {
  artifacts: GccArtifact[];
}

export interface GccGenerateResult {
  artifact?: GccArtifact;
  version?: GccArtifactVersion;
  created?: Array<{ artifact: GccArtifact; version: GccArtifactVersion }>;
}

export interface GccSeoReport {
  targetKeyword: string;
  score: number;
  wordCount: number;
  sectionCount: number;
  keywordDensityPercent: number;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    detail: string;
    fixHint?: string | null;
  }>;
  applyFeedback: string;
}

export interface GccPolishReport {
  score: number;
  shipReady: boolean;
  wordCount: number;
  sentenceCount: number;
  avgSentenceWords: number;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    detail: string;
    fixHint?: string | null;
  }>;
  applyFeedback: string;
}

export function getGccCreateDetail(id: string): Promise<GccCreateDetail> {
  return gccRequest<GccCreateDetail>(`/api/geek-content-creator/creates/${id}`);
}

export function listGccArtifacts(createId: string): Promise<GccArtifact[]> {
  return gccRequest<GccArtifact[]>(
    `/api/geek-content-creator/artifacts?createId=${encodeURIComponent(createId)}`,
  );
}

export function listGccVersions(artifactId: string): Promise<GccArtifactVersion[]> {
  return gccRequest<GccArtifactVersion[]>(
    `/api/geek-content-creator/versions?artifactId=${encodeURIComponent(artifactId)}`,
  );
}

export function generateGccCreate(
  createId: string,
  opts?: { provider?: string; outputTypes?: string[] },
): Promise<GccGenerateResult> {
  return gccRequest<GccGenerateResult>(
    `/api/geek-content-creator/creates/${createId}/generate`,
    {
      method: "POST",
      body: JSON.stringify({
        provider: opts?.provider ?? "OpenAi",
        outputTypes:
          opts?.outputTypes && opts.outputTypes.length > 0
            ? opts.outputTypes
            : null,
      }),
    },
  );
}

/** All content items the multi-output generate can produce. */
export const GCC_OUTPUT_TYPES: { value: string; label: string }[] = [
  { value: "pillar", label: "Pillar" },
  { value: "blog", label: "Blog post" },
  { value: "techArticle", label: "TechArticle" },
  { value: "imagePrompt", label: "Image prompts" },
  { value: "email", label: "Email" },
  { value: "linkedIn", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "instagram", label: "Instagram" },
  { value: "metaAds", label: "Meta ads" },
  { value: "googleAds", label: "Google ads" },
  { value: "aiTool", label: "AI Tool" },
];

export function reviseGccVersion(
  versionId: string,
  input: {
    feedback: string;
    scope?: "full" | "section";
    sectionPath?: string | null;
    provider?: string;
  },
): Promise<GccArtifactVersion> {
  return gccRequest<GccArtifactVersion>(
    `/api/geek-content-creator/versions/${versionId}/revise`,
    {
      method: "POST",
      body: JSON.stringify({
        feedback: input.feedback,
        scope: input.scope ?? "full",
        sectionPath: input.sectionPath ?? null,
        provider: input.provider ?? "OpenAi",
      }),
    },
  );
}

export function seoGccVersion(
  versionId: string,
  keyword: string,
): Promise<GccSeoReport> {
  const q = encodeURIComponent(keyword);
  return gccRequest<GccSeoReport>(
    `/api/geek-content-creator/versions/${versionId}/seo?keyword=${q}`,
  );
}

export function polishGccVersion(versionId: string): Promise<GccPolishReport> {
  return gccRequest<GccPolishReport>(
    `/api/geek-content-creator/versions/${versionId}/polish`,
  );
}

export function approveGccVersion(
  versionId: string,
  notes?: string | null,
): Promise<{ artifact: GccArtifact }> {
  return gccRequest(`/api/geek-content-creator/versions/${versionId}/approve`, {
    method: "POST",
    body: JSON.stringify({ notes: notes ?? null }),
  });
}

export function generateGccTools(input: {
  createId: string;
  toolNames: string[];
  brief?: string | null;
  sourceArtifactId?: string | null;
  provider?: string;
}): Promise<{ created?: Array<{ artifact: GccArtifact; version: GccArtifactVersion }> }> {
  const names = input.toolNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    throw new ApiError("toolNames required (non-empty after trim)", 400);
  }
  if (!input.sourceArtifactId && !input.brief?.trim()) {
    throw new ApiError("brief required when no sourceArtifactId", 400);
  }
  return gccRequest("/api/geek-content-creator/tools/generate", {
    method: "POST",
    body: JSON.stringify({
      createId: input.createId,
      toolNames: names,
      selectedNames: names,
      brief: input.brief?.trim() || null,
      sourceArtifactId: input.sourceArtifactId || null,
      provider: input.provider ?? "OpenAi",
    }),
  });
}

export interface GccMixRequest {
  blog?: boolean;
  techArticle?: boolean;
  emailCount?: number;
  linkedInCount?: number;
  xCount?: number;
  instagramCount?: number;
  metaAdsCount?: number;
  googleAdsCount?: number;
  aiToolNames?: string[] | null;
  aiToolBrief?: string | null;
  imagePrompts?: boolean;
  provider?: string;
}

export function repurposeGccVersion(
  versionId: string,
  mix: GccMixRequest,
): Promise<{ created?: unknown[] }> {
  return gccRequest(`/api/geek-content-creator/versions/${versionId}/repurpose`, {
    method: "POST",
    body: JSON.stringify({
      blog: mix.blog ?? false,
      techArticle: mix.techArticle ?? false,
      emailCount: mix.emailCount ?? 0,
      linkedInCount: mix.linkedInCount ?? 0,
      xCount: mix.xCount ?? 0,
      instagramCount: mix.instagramCount ?? 0,
      metaAdsCount: mix.metaAdsCount ?? 0,
      googleAdsCount: mix.googleAdsCount ?? 0,
      aiToolNames: mix.aiToolNames ?? null,
      aiToolBrief: mix.aiToolBrief ?? null,
      imagePrompts: mix.imagePrompts ?? false,
      provider: mix.provider ?? "OpenAi",
    }),
  });
}

/* --------------------- readable artifact rendering --------------------- */

type SerpRun = { text?: string; bold?: boolean; italic?: boolean; href?: string };
type SerpParagraph = { type?: string; runs?: SerpRun[]; ordered?: boolean; items?: SerpRun[][] };
type DocSection = {
  tag?: string;
  heading?: string;
  paragraphs?: SerpParagraph[];
  href?: string;
  children?: DocSection[];
  imagePrompt?: string;
};
type WireDocument = { lede?: DocSection; sections?: DocSection[] };

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRuns(runs: SerpRun[] | undefined): string {
  return (runs ?? [])
    .map((r) => {
      let t = escHtml(r.text ?? "");
      if (!t) return "";
      if (r.bold) t = `<strong>${t}</strong>`;
      if (r.italic) t = `<em>${t}</em>`;
      if (r.href) {
        t = `<a href="${escHtml(r.href)}" target="_blank" rel="noopener noreferrer">${t}</a>`;
      }
      return t;
    })
    .join("");
}

function renderParagraph(p: SerpParagraph): string {
  if (p.type === "list" || Array.isArray(p.items)) {
    const tag = p.ordered ? "ol" : "ul";
    const items = (p.items ?? []).map((it) => `<li>${renderRuns(it)}</li>`).join("");
    return `<${tag}>${items}</${tag}>`;
  }
  const inner = renderRuns(p.runs);
  return inner ? `<p>${inner}</p>` : "";
}

function renderSection(s: DocSection, depth: number): string {
  const level = s.tag && /^h[1-6]$/i.test(s.tag)
    ? s.tag.toLowerCase()
    : depth <= 0
      ? "h2"
      : "h3";
  const parts: string[] = [];
  if (s.heading?.trim()) parts.push(`<${level}>${escHtml(s.heading)}</${level}>`);
  for (const p of s.paragraphs ?? []) {
    const r = renderParagraph(p);
    if (r) parts.push(r);
  }
  if (s.imagePrompt?.trim()) {
    parts.push(`<p><em>Image prompt:</em> ${escHtml(s.imagePrompt)}</p>`);
  }
  for (const c of s.children ?? []) parts.push(renderSection(c, depth + 1));
  return parts.join("\n");
}

function docToHtml(doc: WireDocument): string {
  const blocks: string[] = [];
  if (doc.lede) blocks.push(renderSection(doc.lede, 0));
  for (const s of doc.sections ?? []) blocks.push(renderSection(s, 0));
  return blocks.filter(Boolean).join("\n");
}

function isWireDocument(v: unknown): v is WireDocument {
  return !!v && typeof v === "object" && ("lede" in v || "sections" in v);
}

/**
 * Render a stored artifact body (CWV2 ContentDocument, image-prompt, or tool JSON) into
 * readable HTML for `dangerouslySetInnerHTML`. Returns null when it can't produce a
 * meaningful render (caller can fall back to a collapsed JSON view).
 */
export function renderArtifactBody(bodyDocumentJson: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyDocumentJson);
  } catch {
    return null;
  }

  // Long-form ContentDocument (top-level or nested under .body for tool pages).
  if (isWireDocument(parsed)) return docToHtml(parsed);
  if (parsed && typeof parsed === "object" && isWireDocument((parsed as Record<string, unknown>).body)) {
    const p = parsed as Record<string, unknown>;
    const rows: string[] = [];
    if (typeof p.title === "string" && p.title.trim()) rows.push(`<h2>${escHtml(p.title)}</h2>`);
    rows.push(docToHtml(p.body as WireDocument));
    return rows.filter(Boolean).join("\n");
  }

  // Field-based artifacts (image prompt, metadata packs): labeled fields, never raw JSON.
  if (parsed && typeof parsed === "object") {
    const p = parsed as Record<string, unknown>;
    const rows: string[] = [];
    const field = (label: string, key: string) => {
      const v = p[key];
      if (typeof v === "string" && v.trim()) {
        rows.push(`<p><strong>${escHtml(label)}:</strong> ${escHtml(v)}</p>`);
      }
    };
    if (typeof p.title === "string" && p.title.trim()) rows.push(`<h2>${escHtml(p.title)}</h2>`);
    field("Prompt", "prompt");
    field("Image prompt", "imagePrompt");
    field("Negative prompt", "negativePrompt");
    field("Meta description", "metaDescription");
    field("Summary", "summary");
    if (typeof p.body === "string" && p.body.trim()) rows.push(p.body); // may already be HTML
    if (rows.length) return rows.join("\n");
  }

  return null;
}

/** Best-effort plain preview from stored body JSON — fail closed to raw/pretty JSON. */
export function previewBodyDocument(bodyDocumentJson: string, max = 1200): string {
  try {
    const parsed = JSON.parse(bodyDocumentJson) as Record<string, unknown>;
    const body =
      (typeof parsed.body === "string" && parsed.body) ||
      (typeof parsed.content === "string" && parsed.content) ||
      (typeof parsed.markdown === "string" && parsed.markdown) ||
      "";
    const title = typeof parsed.title === "string" ? parsed.title : "";
    const prompt =
      (typeof parsed.prompt === "string" && parsed.prompt) ||
      (typeof parsed.imagePrompt === "string" && parsed.imagePrompt) ||
      "";
    if (title || body || prompt) {
      const text = [title, prompt, body].filter(Boolean).join("\n\n");
      return text.length > max ? `${text.slice(0, max)}…` : text;
    }
    // Image-prompt / structured artifacts: show pretty JSON (not opaque one-liner).
    const pretty = JSON.stringify(parsed, null, 2);
    return pretty.length > max ? `${pretty.slice(0, max)}…` : pretty;
  } catch {
    return bodyDocumentJson.length > max
      ? `${bodyDocumentJson.slice(0, max)}…`
      : bodyDocumentJson;
  }
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

export function parseSavedSerp(
  content: string,
  targetKeyword?: string | null,
): Promise<SavedSerpParseResult> {
  return gccRequest<SavedSerpParseResult>("/api/geek-content-creator/serp/parse", {
    method: "POST",
    body: JSON.stringify({
      content,
      targetKeyword: targetKeyword?.trim() || null,
    }),
  });
}

export function organicUrlsFromBrief(brief: ContentBrief): string[] {
  return brief.serpUrls
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export const GCC_CREATE_STORAGE_PREFIX = "gcc-create-id:";
