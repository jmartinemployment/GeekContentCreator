import type {
  CategoryOption,
  Client,
  CommitHtmlExportResult,
  CrawlSummary,
  GeneratedContentSet,
  KeywordSourceCategory,
  KeywordSourceResponse,
  LlmProviderType,
  LmStudioHealthStatus,
  ProjectDetail,
  ProjectSummary,
  ReviewVerdict,
} from "@/lib/types";
import { ApiError } from "./gcc-api";

/**
 * Same-origin proxy → GeekAPI Content Writer v2 routes (/api/clients, /api/projects/.../generate).
 * Auth: server forwards the user's OAuth Bearer. Never call GCW.
 */
const API_BASE_URL = "/api/cw";

/** Hosted GeekAPI has no LM Studio. */
export function isProductionContentWriterApi(): boolean {
  return true;
}

export function defaultLlmProvider(): LlmProviderType {
  return "OpenAi";
}

export { ApiError };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      `Could not reach hosted GeekAPI via ${API_BASE_URL}. Check NEXT_PUBLIC_GEEK_API_URL and auth.`,
      0,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    const problemDetail = tryParseProblemDetail(detail);
    throw new ApiError(
      problemDetail || detail || response.statusText,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getClients(): Promise<Client[]> {
  return request<Client[]>("/api/clients");
}

export function createClient(input: {
  name: string;
  notes?: string;
}): Promise<Client> {
  return request<Client>("/api/clients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function setPublishTarget(
  clientId: string,
  input: {
    geekBackendApiBaseUrl: string;
    apiKeyEnvVar: string;
    defaultAuthorId: number | null;
    categoryStrategy: string;
  },
): Promise<Client> {
  return request<Client>(`/api/clients/${clientId}/publish-target`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function createProject(input: {
  clientId: string;
  name: string;
  projectUrl: string;
  targetKeyword: string;
  department: string;
  preferredProvider: LlmProviderType;
  useExactKeywordAsTitle?: boolean;
  siteAnalysisId?: string | null;
}): Promise<ProjectSummary> {
  return request<ProjectSummary>("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      clientId: input.clientId,
      name: input.name,
      projectUrl: input.projectUrl,
      targetKeyword: input.targetKeyword,
      department: input.department,
      preferredProvider: input.preferredProvider,
      useExactKeywordAsTitle: input.useExactKeywordAsTitle ?? false,
      siteAnalysisId: input.siteAnalysisId ?? null,
    }),
  });
}

export function getRecentProjects(): Promise<ProjectSummary[]> {
  return request<ProjectSummary[]>("/api/projects");
}

export function getProject(projectId: string): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/projects/${projectId}`);
}

export function updateProjectNotes(
  projectId: string,
  notes: string,
): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/projects/${projectId}/notes`, {
    method: "PUT",
    body: JSON.stringify({ notes }),
  });
}

export function updateProjectHierarchyContext(
  projectId: string,
  input: {
    hierarchyPath: string | null;
    hierarchyChildHeadings: string[];
    hierarchySourcePageUrl: string | null;
    allowOutsideSiteScope: boolean;
    siteAnalysisId?: string | null;
    hierarchyToolsByHeading?: Array<{ heading: string; tools: Array<{ name: string; href?: string }> }>;
    hierarchyAssignmentMarkdown?: string | null;
  },
): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/projects/${projectId}/hierarchy-context`, {
    method: "PUT",
    body: JSON.stringify({
      hierarchyPath: input.hierarchyPath,
      hierarchyChildHeadings: input.hierarchyChildHeadings,
      hierarchySourcePageUrl: input.hierarchySourcePageUrl,
      allowOutsideSiteScope: input.allowOutsideSiteScope,
      siteAnalysisId: input.siteAnalysisId ?? null,
      hierarchyToolsByHeading: input.hierarchyToolsByHeading ?? [],
      hierarchyAssignmentMarkdown: input.hierarchyAssignmentMarkdown ?? null,
    }),
  });
}

export function updateProjectSerpContext(
  projectId: string,
  input: {
    serpTitles: string | null;
    serpUrls: string | null;
    serpPaaQuestions: string | null;
    serpRelatedSearches: string | null;
  },
): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/projects/${projectId}/serp-context`, {
    method: "PUT",
    body: JSON.stringify({
      serpTitles: input.serpTitles,
      serpUrls: input.serpUrls,
      serpPaaQuestions: input.serpPaaQuestions,
      serpRelatedSearches: input.serpRelatedSearches,
    }),
  });
}

export function updateProjectBrief(
  projectId: string,
  input: { createId: string; briefJson: string | null },
): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/projects/${projectId}/brief`, {
    method: "PUT",
    body: JSON.stringify({ createId: input.createId, briefJson: input.briefJson }),
  });
}

export function crawlProject(
  projectId: string,
  maxPages = 50,
): Promise<CrawlSummary> {
  return request<CrawlSummary>(
    `/api/projects/${projectId}/crawl?maxPages=${maxPages}`,
    { method: "POST" },
  );
}

export function uploadKeywordSource(
  projectId: string,
  category: KeywordSourceCategory,
  file: File,
): Promise<KeywordSourceResponse> {
  const formData = new FormData();
  formData.append("category", category);
  formData.append("file", file);

  return request<KeywordSourceResponse>(
    `/api/projects/${projectId}/keyword-sources`,
    { method: "POST", body: formData },
  );
}

export function deleteKeywordSource(
  projectId: string,
  keywordSourceId: string,
): Promise<void> {
  return request<void>(
    `/api/projects/${projectId}/keyword-sources/${keywordSourceId}`,
    { method: "DELETE" },
  );
}

export function generatePillarPlanContent(
  projectId: string,
): Promise<GeneratedContentSet> {
  return request<GeneratedContentSet>(
    `/api/projects/${projectId}/generate/pillar/plan`,
    { method: "POST" },
  );
}

export function generatePillarBodyContent(
  projectId: string,
): Promise<GeneratedContentSet> {
  return request<GeneratedContentSet>(
    `/api/projects/${projectId}/generate/pillar/body`,
    { method: "POST" },
  );
}

export function generateToolsContent(
  projectId: string,
): Promise<GeneratedContentSet> {
  return request<GeneratedContentSet>(
    `/api/projects/${projectId}/generate/tools`,
    { method: "POST" },
  );
}

/**
 * Content Creator addition: human tool names + brief → CWV2 tool prompts.
 * Does not require a pillar Tools section (POST …/generate/tools).
 */
export function generateToolsFromNames(
  projectId: string,
  input: { toolNames: string[]; brief: string; provider?: string },
): Promise<GeneratedContentSet> {
  return request<GeneratedContentSet>(
    `/api/geek-content-creator/projects/${projectId}/tools-from-names`,
    {
      method: "POST",
      body: JSON.stringify({
        toolNames: input.toolNames,
        brief: input.brief,
        provider: input.provider ?? "OpenAi",
      }),
    },
  );
}

/** Candidate tool names from pillar Tools section, existing tool drafts, and Desired Headings. */
export async function listToolNameCandidates(projectId: string): Promise<string[]> {
  const res = await request<{ names: string[] }>(
    `/api/geek-content-creator/projects/${projectId}/tool-name-candidates`,
  );
  return res.names ?? [];
}

/**
 * Content Creator addition: operator Revise (Full/Section) on a CWV2 project draft.
 */
export function reviseProjectContent(
  projectId: string,
  input: {
    contentType?: string;
    feedback: string;
    scope?: "full" | "section";
    sectionPath?: string;
    toolSlug?: string;
    slug?: string;
    provider?: string;
  },
): Promise<GeneratedContentSet> {
  return request<GeneratedContentSet>(
    `/api/geek-content-creator/projects/${projectId}/revise`,
    {
      method: "POST",
      body: JSON.stringify({
        contentType: input.contentType ?? null,
        feedback: input.feedback,
        scope: input.scope ?? "full",
        sectionPath: input.sectionPath ?? null,
        toolSlug: input.toolSlug ?? null,
        slug: input.slug ?? null,
        provider: input.provider ?? "OpenAi",
      }),
    },
  );
}

export async function listImagePromptRows(
  projectId: string,
): Promise<{ slug: string; title: string; contentType: string; promptPreview: string }[]> {
  const res = await request<{
    rows: { slug: string; title: string; contentType: string; promptPreview: string }[];
  }>(`/api/geek-content-creator/projects/${projectId}/image-prompt-rows`);
  return res.rows ?? [];
}

export function setProjectContentApproval(
  projectId: string,
  approved: boolean,
): Promise<{ projectId: string; contentApprovedAtUtc: string | null }> {
  return request(`/api/geek-content-creator/projects/${projectId}/content-approval`, {
    method: "POST",
    body: JSON.stringify({ approved }),
  });
}

export function getProjectContentApproval(
  projectId: string,
): Promise<{ projectId: string; approved: boolean; contentApprovedAtUtc: string | null }> {
  return request(`/api/geek-content-creator/projects/${projectId}/content-approval`);
}

export function generateBlogContent(
  projectId: string,
): Promise<GeneratedContentSet> {
  return request<GeneratedContentSet>(
    `/api/projects/${projectId}/generate/blog`,
    { method: "POST" },
  );
}

export function generateSocialContent(
  projectId: string,
  counts?: {
    facebookCount?: number;
    linkedInCount?: number;
    xCount?: number;
    instagramCount?: number;
    metaAdsCount?: number;
    googleAdsCount?: number;
    provider?: string;
  },
): Promise<GeneratedContentSet> {
  // Plan §7: one social/ads pack call (not one call per channel).
  return request<{ set: GeneratedContentSet }>(
    `/api/geek-content-creator/projects/${projectId}/social-pack`,
    {
      method: "POST",
      body: JSON.stringify({
        facebookCount: counts?.facebookCount ?? 1,
        linkedInCount: counts?.linkedInCount ?? 1,
        xCount: counts?.xCount ?? 0,
        instagramCount: counts?.instagramCount ?? 0,
        metaAdsCount: counts?.metaAdsCount ?? 0,
        googleAdsCount: counts?.googleAdsCount ?? 0,
        provider: counts?.provider ?? defaultLlmProvider(),
      }),
    },
  ).then((res) => res.set);
}

export function generateSocialPack(
  projectId: string,
  counts: {
    facebookCount?: number;
    linkedInCount?: number;
    xCount?: number;
    instagramCount?: number;
    metaAdsCount?: number;
    googleAdsCount?: number;
    provider?: string;
  },
): Promise<{
  set: GeneratedContentSet;
  packJson: string;
  channels: string[];
  variantCount: number;
  llmCalls: number;
}> {
  return request(`/api/geek-content-creator/projects/${projectId}/social-pack`, {
    method: "POST",
    body: JSON.stringify({
      facebookCount: counts.facebookCount ?? 0,
      linkedInCount: counts.linkedInCount ?? 0,
      xCount: counts.xCount ?? 0,
      instagramCount: counts.instagramCount ?? 0,
      metaAdsCount: counts.metaAdsCount ?? 0,
      googleAdsCount: counts.googleAdsCount ?? 0,
      provider: counts.provider ?? defaultLlmProvider(),
    }),
  });
}

export function generateColdOutreachContent(
  projectId: string,
): Promise<GeneratedContentSet> {
  return request<GeneratedContentSet>(
    `/api/projects/${projectId}/generate/email-cold-outreach`,
    { method: "POST" },
  );
}

export function generateImagePromptsContent(
  projectId: string,
): Promise<GeneratedContentSet> {
  return request<GeneratedContentSet>(
    `/api/projects/${projectId}/generate/image-prompts`,
    { method: "POST" },
  );
}

export function generateAllContent(
  projectId: string,
): Promise<GeneratedContentSet> {
  return request<GeneratedContentSet>(`/api/projects/${projectId}/generate`, {
    method: "POST",
  });
}

export function runReview(
  projectId: string,
  contentTypes?: string[],
  toolSlugToTest?: string | null,
): Promise<ReviewVerdict[]> {
  const body: { contentTypes?: string[]; toolSlugToTest?: string } = {};
  if (contentTypes?.length) body.contentTypes = contentTypes;
  if (toolSlugToTest) body.toolSlugToTest = toolSlugToTest;
  return request<ReviewVerdict[]>(`/api/projects/${projectId}/review`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function rewriteFromLatestVerdict(
  projectId: string,
  generatedContentId: string,
): Promise<GeneratedContentSet> {
  return request<GeneratedContentSet>(
    `/api/projects/${projectId}/review/rewrite`,
    {
      method: "POST",
      body: JSON.stringify({ generatedContentId }),
    },
  );
}

export async function getGeekBackendCategories(
  clientId: string,
  lang = "en",
): Promise<CategoryOption[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/categories?clientId=${clientId}&lang=${lang}`,
  );
  if (!response.ok) {
    throw new ApiError(
      `Could not load categories from GeekBackend (${response.status}).`,
      response.status,
    );
  }
  return (await response.json()) as CategoryOption[];
}

export async function downloadHtmlExport(
  projectId: string,
  includeRevise: boolean = true,
): Promise<void> {
  let response: Response;
  try {
    const params = new URLSearchParams();
    if (!includeRevise) params.append("includeRevise", "false");
    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/projects/${projectId}/export/html${queryString ? `?${queryString}` : ""}`;
    response = await fetch(url);
  } catch {
    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}.`,
      0,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    const problemDetail = tryParseProblemDetail(detail);
    throw new ApiError(
      problemDetail || detail || response.statusText,
      response.status,
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${projectId}-html-export.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

export function commitHtmlExportToGitHub(
  projectId: string,
  includeRevise: boolean = true,
): Promise<CommitHtmlExportResult> {
  const params = new URLSearchParams();
  if (!includeRevise) params.append("includeRevise", "false");
  const queryString = params.toString();
  const url = `/api/projects/${projectId}/export/html/commit${queryString ? `?${queryString}` : ""}`;
  return request<CommitHtmlExportResult>(url, { method: "POST" });
}

export function getLmStudioStatus(): Promise<LmStudioHealthStatus> {
  return request<LmStudioHealthStatus>("/api/llm/lm-studio/status");
}

function tryParseProblemDetail(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { detail?: string; title?: string };
    return parsed.detail ?? parsed.title ?? null;
  } catch {
    return null;
  }
}
