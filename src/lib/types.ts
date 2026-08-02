export type RelatedPage = {
  url: string;
  title: string;
  headings: string[];
  excerpt: string;
};

export type SiteSectionContext = {
  siteAnalysisId: string;
  gapTopic: string;
  gapSectionPath: string | null;
  relatedPages: RelatedPage[];
  topicalNeighbors: string[];
};

export type GccCreate = {
  id: string;
  clientId: string;
  ownerUserId: string;
  startingContentType: string;
  topic: string;
  notes: string | null;
  siteAnalysisId: string | null;
  siteSectionJson: string | null;
  status: string;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type GccArtifact = {
  id: string;
  createId: string;
  type: string;
  name: string;
  status: string;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type GccArtifactVersion = {
  id: string;
  artifactId: string;
  versionNumber: number;
  bodyDocumentJson: string;
  metadataJson?: string | null;
  rowVersion?: number;
  createdAtUtc: string;
};

export type GccApprovalEvent = {
  id: string;
  artifactVersionId: string;
  action: string;
  notes: string | null;
  userId: string;
  createdAtUtc: string;
};

export type GccCreateDetail = GccCreate & {
  artifacts: GccArtifact[];
};

export type SeoCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  fixHint?: string | null;
};

export type SeoReport = {
  targetKeyword: string;
  score: number;
  wordCount: number;
  sectionCount: number;
  keywordDensityPercent: number;
  checks: SeoCheck[];
  applyFeedback: string;
};

export type PolishCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  fixHint?: string | null;
};

export type PolishReport = {
  score: number;
  shipReady: boolean;
  wordCount: number;
  sentenceCount: number;
  avgSentenceWords: number;
  checks: PolishCheck[];
  applyFeedback: string;
};

export type ContentGap = {
  id: string;
  topic: string;
  sectionPath: string | null;
  reason: string;
  suggestPillar: boolean;
};

export type SiteAnalysis = {
  id: string;
  domain: string;
  status: string;
};

export type RepurposeMixRequest = {
  blog?: boolean;
  techArticle?: boolean;
  emailCount?: number;
  linkedInCount?: number;
  xCount?: number;
  instagramCount?: number;
  metaAdsCount?: number;
  googleAdsCount?: number;
  aiToolNames?: string[];
  aiToolBrief?: string | null;
  imagePrompts?: boolean;
  provider?: string;
};

export type ToolGenerateRequest = {
  toolNames: string[];
  brief?: string | null;
  sourceArtifactId?: string | null;
  selectedNames?: string[] | null;
  createId: string;
  provider?: string;
};

export type BrandClient = {
  id: string;
  name: string;
  notes?: string | null;
  createdAtUtc: string;
};

/** @deprecated Use BrandClient — not a Content Writer / GCW type. */
export type CwClient = BrandClient;
