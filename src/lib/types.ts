/** A real crawled heading with its HTML level (1 = h1 ... 6 = h6). */
export type Heading = {
  level: number;
  text: string;
};

export type RelatedPage = {
  url: string;
  title: string;
  headings: Heading[];
  excerpt: string;
};

export type SiteSectionContext = {
  siteAnalysisId: string;
  gapTopic: string;
  gapSectionPath: string | null;
  relatedPages: RelatedPage[];
  topicalNeighbors: string[];
  informationGain?: InformationGainNote | null;
};

export type InformationGainNote = {
  thisSiteCovers: string[];
  competitorOpens: string[];
  summary: string;
};

export type GccCreate = {
  id: string;
  clientId: string;
  ownerUserId: string;
  startingContentType: string | null;
  topic: string;
  notes: string | null;
  siteAnalysisId: string | null;
  siteSectionJson: string | null;
  briefJson: string | null;
  researchJson: string | null;
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
  hierarchy?: string[] | null;
  sourcePageUrl?: string | null;
};

export type SiteAnalysis = {
  id: string;
  domain: string;
  status: "processing" | "ready" | "failed" | string;
  gaps?: ContentGap[];
  error?: string;
  seoProjectId?: string;
  seoProfileId?: string;
  step?: string;
  stepNumber?: number;
  totalSteps?: number;
  pages?: Array<{ url: string; title: string; headings: Array<{ level: number; text: string }> }>;
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

// ContentWriterV3 types (merged from lib/content-writer/types.ts)

export type LlmProviderType = "LmStudio" | "OpenAi" | "Anthropic" | "Groq";

export type ProjectStatus =
  | "Draft"
  | "Crawling"
  | "ReadyForGeneration"
  | "Generating"
  | "Completed"
  | "Failed";

export type KeywordSourceCategory =
  | "KeywordResult"
  | "EduDomain"
  | "GovDomain"
  | "Wikipedia"
  | "Local"
  | "PeopleAlsoAsk"
  | "CompetitorCrawl";

export type GeneratedContentType =
  | "TechnicalArticle"
  | "BlogPost"
  | "SocialFacebook"
  | "SocialLinkedIn"
  | "EmailColdOutreach"
  | "EmailNewsletter"
  | "EmailStoryNurture"
  | "EmailTransactional"
  | "ImagePromptPillarFigure"
  | "ImagePromptSocialFacebook"
  | "ImagePromptSocialLinkedIn"
  | "ImagePromptSection"
  | "ToolPost";

export type CategoryStrategy = "DepartmentBased" | "FreeForm";

export type ReviewVerdictStatus = "Approved" | "Revise" | "Exhausted";

export interface PublishTarget {
  id: string;
  geekBackendApiBaseUrl: string;
  apiKeyEnvVar: string;
  defaultAuthorId: number | null;
  categoryStrategy: CategoryStrategy;
}

export interface Client {
  id: string;
  name: string;
  notes: string | null;
  createdAtUtc: string;
  publishTarget: PublishTarget | null;
}

export interface ProjectSummary {
  id: string;
  clientId: string;
  name: string;
  projectUrl: string;
  targetKeyword: string;
  department: string;
  status: ProjectStatus;
  preferredProvider: LlmProviderType;
  useExactKeywordAsTitle: boolean;
  createdAtUtc: string;
  siteAnalysisId?: string | null;
}

export interface CrawlSummary {
  siteName: string;
  pagesCrawled: number;
  detectedTone: string;
  detectedFocus: string;
  headingCount: number;
  paragraphCount: number;
  jsonLdBlockCount: number;
}

export interface KeywordSourceResponse {
  id: string;
  category: KeywordSourceCategory;
  originalFileName: string;
  extractedTitle: string | null;
  headingCount: number;
  paragraphCount: number;
  questionCount: number;
}

export interface GeneratedContentResponse {
  id: string;
  contentType: GeneratedContentType;
  title: string;
  slug: string;
  metaDescription: string | null;
  keywords: string[];
  wordCount: number;
  bodyHtml: string;
  jsonLdSchema: string | null;
  relatedArticleUrl: string | null;
  createdAtUtc: string;
  noResearchWarning: string | null;
  gaps: string[];
}

export interface ProjectDetail extends ProjectSummary {
  crawl: CrawlSummary | null;
  keywordSources: KeywordSourceResponse[];
  generatedContent: GeneratedContentResponse[];
  contentSet: GeneratedContentSet | null;
  notes: string | null;
  contentApprovedAtUtc?: string | null;
  hierarchyPath?: string | null;
  hierarchyChildHeadings?: string[];
  hierarchySourcePageUrl?: string | null;
  allowOutsideSiteScope?: boolean;
  serpTitles?: string | null;
  serpUrls?: string | null;
  serpPaaQuestions?: string | null;
  serpRelatedSearches?: string | null;
}

export interface ArticleDraft {
  title: string;
  metaDescription: string;
  bodyHtml: string;
  keywords: string[];
  wordCount: number;
  sectionOutline: string[];
}

export interface ColdOutreachEmailDraft {
  subject: string;
  bodyText: string;
  ctaLabel: string;
  ctaUrl: string;
}

export interface SocialPostDraft {
  platform: string;
  text: string;
}

export interface ImagePromptSection {
  sourceType: "pillar-hero" | "blog-hero" | "pillar" | "blog" | "tool";
  heading: string;
  order: number;
  prompt: string;
  width: number;
  height: number;
  imageModel: string;
  imageModelId: string;
  stylePreset: string;
  alchemy: boolean;
  photoReal: boolean;
  notes: string | null;
}

export interface ImagePromptsSet {
  sections: ImagePromptSection[];
}

export interface CategoryOption {
  id: number;
  slug: string;
  name: string | null;
}

export interface ToolPostDraft {
  title: string;
  slug: string;
  toolUrl: string;
  bodyHtml: string;
  metaDescription: string;
  jsonLdSchema: string | null;
  sourceAppOrder: number | null;
  wordCount: number;
}

export interface CommitHtmlExportResult {
  commitSha: string;
  commitUrl: string;
  filePaths: string[];
}

export interface GeneratedContentSet {
  article: ArticleDraft | null;
  articleSlug: string | null;
  articleUrl: string | null;
  articleJsonLd: string | null;
  blog: ArticleDraft | null;
  blogSlug: string | null;
  blogUrl: string | null;
  blogJsonLd: string | null;
  facebookPost: SocialPostDraft | null;
  linkedInPost: SocialPostDraft | null;
  coldOutreachEmail: ColdOutreachEmailDraft | null;
  imagePrompts: ImagePromptsSet | null;
  toolPosts: ToolPostDraft[] | null;
  articleNoResearchWarning: string | null;
  articleGaps: string[] | null;
}

export interface ReviewVerdict {
  id: string;
  generatedContentId: string;
  contentType: GeneratedContentType;
  title: string;
  slug: string;
  status: ReviewVerdictStatus;
  attemptCount: number;
  reviewerProvider: LlmProviderType;
  reviewerModel: string;
  notesJson: string;
  retryCount: number;
  retryReason: string | null;
  createdAtUtc: string;
}

export interface LmStudioHealthStatus {
  isReachable: boolean;
  modelId: string | null;
  message: string | null;
}

export const KEYWORD_SOURCE_CATEGORIES: { value: KeywordSourceCategory; label: string }[] = [
  { value: "KeywordResult", label: "Keyword SERP Result" },
  { value: "EduDomain", label: ".edu Domain" },
  { value: "GovDomain", label: ".gov Domain" },
  { value: "Wikipedia", label: "Wikipedia" },
  { value: "Local", label: "Local Pack" },
  { value: "CompetitorCrawl", label: "Competitor Crawl" },
  { value: "PeopleAlsoAsk", label: "People Also Ask (text)" },
];

export const PROVIDER_OPTIONS: { value: LlmProviderType; label: string }[] = [
  { value: "LmStudio", label: "LM Studio (local dev only)" },
  { value: "OpenAi", label: "OpenAI" },
  { value: "Anthropic", label: "Anthropic (Claude)" },
  { value: "Groq", label: "Groq (Llama)" },
];
