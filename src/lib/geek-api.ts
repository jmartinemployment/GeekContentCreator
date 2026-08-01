import { requireAccessToken } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";
import type {
  ContentGap,
  CwClient,
  GccApprovalEvent,
  GccArtifact,
  GccArtifactVersion,
  GccCreate,
  GccCreateDetail,
  PolishReport,
  RepurposeMixRequest,
  SeoReport,
  SiteAnalysis,
  SiteSectionContext,
  ToolGenerateRequest,
} from "@/lib/types";

export class GeekApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "GeekApiError";
  }
}

const GCC = "/api/geek-content-creator";

export async function geekApiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await requireAccessToken();
  const url = path.startsWith("http")
    ? path
    : `${apiConfig.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const raw = await res.text();
  if (!res.ok) {
    let body: unknown = raw;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const message =
      typeof body === "object" && body && "title" in body
        ? String((body as { title: unknown }).title)
        : typeof body === "object" && body && "error" in body
          ? String((body as { error: unknown }).error)
          : typeof body === "object" && body && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : typeof body === "string" && body
              ? body
              : `GeekAPI ${res.status}`;
    throw new GeekApiError(message, res.status, body);
  }
  if (res.status === 204 || !raw) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return JSON.parse(raw) as T;
  }
  return undefined as T;
}

export function listClients() {
  return geekApiFetch<CwClient[]>("/api/clients");
}

export function createClient(body: { name: string; notes?: string | null }) {
  return geekApiFetch<CwClient>("/api/clients", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listCreates(clientId?: string) {
  const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return geekApiFetch<GccCreate[]>(`${GCC}/creates${q}`);
}

export function getCreate(id: string) {
  return geekApiFetch<GccCreateDetail>(`${GCC}/creates/${id}`);
}

export function createCreate(body: {
  clientId: string;
  startingContentType: string;
  topic: string;
  notes?: string | null;
  siteAnalysisId?: string | null;
  siteSection?: SiteSectionContext | null;
}) {
  return geekApiFetch<GccCreate>(`${GCC}/creates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function generateCreate(
  id: string,
  body?: { provider?: string; async?: boolean },
) {
  return geekApiFetch<
    | { artifact: GccArtifact; version: GccArtifactVersion }
    | { created: { artifact: GccArtifact; version: GccArtifactVersion }[] }
    | { jobId: string; status: string }
  >(`${GCC}/creates/${id}/generate`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function getJob(id: string) {
  return geekApiFetch<{
    id: string;
    kind: string;
    createId: string;
    status: string;
    result?: unknown;
    error?: string | null;
  }>(`${GCC}/jobs/${id}`);
}

export function listArtifacts(createId: string) {
  return geekApiFetch<GccArtifact[]>(
    `${GCC}/artifacts?createId=${encodeURIComponent(createId)}`,
  );
}

export function listVersions(artifactId: string) {
  return geekApiFetch<GccArtifactVersion[]>(
    `${GCC}/versions?artifactId=${encodeURIComponent(artifactId)}`,
  );
}

export function getVersion(id: string) {
  return geekApiFetch<GccArtifactVersion>(`${GCC}/versions/${id}`);
}

export function reviseVersion(
  id: string,
  body: {
    feedback: string;
    scope: "full" | "section";
    sectionPath?: string | null;
    provider?: string;
  },
) {
  return geekApiFetch<GccArtifactVersion>(`${GCC}/versions/${id}/revise`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getVersionSeo(id: string, keyword: string) {
  return geekApiFetch<SeoReport>(
    `${GCC}/versions/${id}/seo?keyword=${encodeURIComponent(keyword)}`,
  );
}

export function getVersionPolish(id: string) {
  return geekApiFetch<PolishReport>(`${GCC}/versions/${id}/polish`);
}

export function approveVersion(id: string, notes?: string | null) {
  return geekApiFetch<{
    artifact: GccArtifact;
    event: GccApprovalEvent;
  }>(`${GCC}/versions/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ notes: notes ?? null }),
  });
}

export function repurposeVersion(id: string, mix: RepurposeMixRequest) {
  return geekApiFetch<{
    created: { artifact: GccArtifact; version: GccArtifactVersion }[];
  }>(`${GCC}/versions/${id}/repurpose`, {
    method: "POST",
    body: JSON.stringify(mix),
  });
}

export function generateTools(body: ToolGenerateRequest) {
  return geekApiFetch<{
    created: { artifact: GccArtifact; version: GccArtifactVersion }[];
  }>(`${GCC}/tools/generate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function generateImagePrompt(body: {
  createId?: string | null;
  topic?: string | null;
  notes?: string | null;
  sourceArtifactId?: string | null;
  provider?: string;
}) {
  return geekApiFetch<{ artifact: GccArtifact; version: GccArtifactVersion }>(
    `${GCC}/image-prompts/generate`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function analyzeSite(body: { domain: string; seedTopic?: string | null }) {
  return geekApiFetch<SiteAnalysis>(`${GCC}/site-analyzer/analyze`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listContentGaps(analysisId: string) {
  return geekApiFetch<ContentGap[]>(
    `${GCC}/site-analyzer/${analysisId}/gaps`,
  );
}

export function getSectionContext(analysisId: string, gapTopic: string) {
  return geekApiFetch<SiteSectionContext>(
    `${GCC}/site-analyzer/${analysisId}/section-context?gapTopic=${encodeURIComponent(gapTopic)}`,
  );
}
