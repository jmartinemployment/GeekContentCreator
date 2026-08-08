/**
 * Content Brief catalogs for Geek Content Creator — aligned to Google's
 * documented Search & Ads terminology.
 *
 * Google-grounded fields cite their source; Tone of Voice and Content Angle
 * are internal editorial controls (Google publishes no such taxonomy) and are
 * marked as such. Human-selected controls — not inferred from SERP HTML.
 */

/** Bump when the ContentBrief shape or catalog values change (drives migration). */
export const BRIEF_VERSION = 2;

/* ------------------------------------------------------------------ *
 * 1.A  Search intent (SEO-standard taxonomy; not a live Google enum)  *
 * ------------------------------------------------------------------ */

export const PRIMARY_INTENTS = [
  { value: "informational", label: "Informational" },
  { value: "navigational", label: "Navigational" },
  { value: "commercial_investigation", label: "Commercial investigation" },
  { value: "transactional", label: "Transactional" },
] as const;

export type PrimaryIntent = (typeof PRIMARY_INTENTS)[number]["value"];

export const SECONDARY_INTENTS = [
  { value: "local", label: "Local" },
  { value: "freebies", label: "Freebies" },
  { value: "comparison", label: "Comparison" },
] as const;

export type SecondaryIntent = (typeof SECONDARY_INTENTS)[number]["value"];

/* ------------------------------------------------------------------ *
 * 1.B  Buying stage → Google Ads Full-Funnel objectives              *
 * ------------------------------------------------------------------ */

export const BUYING_STAGES = [
  { value: "awareness", label: "Awareness (Top of Funnel)" },
  { value: "consideration", label: "Consideration (Middle of Funnel)" },
  { value: "action", label: "Action / Conversion (Bottom of Funnel)" },
] as const;

export type BuyingStage = (typeof BUYING_STAGES)[number]["value"];

/* ------------------------------------------------------------------ *
 * 1.C  Audience Segments (verbatim Google Ads audience segments)     *
 *      https://support.google.com/google-ads/answer/2497941          *
 * ------------------------------------------------------------------ */

export const AUDIENCE_SEGMENTS = [
  { value: "affinity", label: "Affinity Segments" },
  { value: "in_market", label: "In-Market Segments" },
  { value: "life_events", label: "Life Events" },
  { value: "detailed_demographics", label: "Detailed Demographics" },
  { value: "your_data", label: "Your Data Segments (formerly Remarketing)" },
  { value: "custom", label: "Custom Segments" },
] as const;

export type AudienceSegment = (typeof AUDIENCE_SEGMENTS)[number]["value"];

/** Optional multi-select chips describing how the segment is refined. */
export const AUDIENCE_DETAILS = [
  { value: "demographic_attributes", label: "Demographic Attributes" },
  { value: "behavioral_triggers", label: "Behavioral Data Triggers" },
  { value: "boolean_combination", label: "Boolean Combination Logic" },
] as const;

export type AudienceDetail = (typeof AUDIENCE_DETAILS)[number]["value"];

/* ------------------------------------------------------------------ *
 * 1.D  Angle for SEO (internal editorial control — NOT a Google      *
 *      attribute; choose to match the dominant SERP intent/format)   *
 * ------------------------------------------------------------------ */

export const CONTENT_ANGLES = [
  { value: "comparative", label: 'The Comparative Angle ("Versus")' },
  { value: "problem_solution", label: "The Problem-Solution Angle" },
  { value: "case_study_data", label: "The Case Study / Data-Driven Angle" },
  { value: "ultimate_guide", label: 'The Comprehensive "Ultimate Guide" Angle' },
] as const;

export type ContentAngle = (typeof CONTENT_ANGLES)[number]["value"];

/* ------------------------------------------------------------------ *
 * 1.E  Discovery CTA Types (Google Ads CallToActionTypeEnum)         *
 *      developers.google.com/google-ads/api/reference/rpc/v21/CallToActionTypeEnum
 * ------------------------------------------------------------------ */

export const CTA_TYPES = [
  { value: "sign_up", label: "Sign Up" },
  { value: "contact_us", label: "Contact Us" },
  { value: "book_now", label: "Book Now" },
  { value: "download", label: "Download" },
  { value: "learn_more", label: "Learn More" },
  { value: "apply_now", label: "Apply Now" },
  { value: "get_quote", label: "Get Quote" },
] as const;

export type CtaType = (typeof CTA_TYPES)[number]["value"];

/* ------------------------------------------------------------------ *
 * 1.F  Tone of Voice + E-E-A-T                                       *
 * ------------------------------------------------------------------ */

/** Method 1 — internal editorial control (Google publishes no tone taxonomy). */
export const TONES_OF_VOICE = [
  { value: "consultant_professional", label: "Consultant / Professional Tone" },
  { value: "informational_instructional", label: "Informational / Instructional Tone" },
  { value: "commercial_balanced", label: "Commercial / Balanced Tone" },
] as const;

export type ToneOfVoice = (typeof TONES_OF_VOICE)[number]["value"];

/**
 * Method 2 — E-E-A-T, Google Search Quality Rater framework (four signals).
 * https://developers.google.com/search/blog/2022/12/google-raters-guidelines-e-e-a-t
 */
export const EEAT_SIGNALS = [
  { value: "first_hand_experience", label: "First-Hand Experience" },
  { value: "expertise", label: "Expertise" },
  { value: "authoritativeness", label: "Authoritativeness" },
  { value: "trustworthiness", label: "Trustworthiness" },
] as const;

export type EeatSignal = (typeof EEAT_SIGNALS)[number]["value"];

/**
 * Tone availability gated by Primary Intent ∩ Angle for SEO.
 * Empty intersection → fall back to intent-allow only (see toneAllowed).
 * Secondary intent does not gate voice.
 */
export const TONE_COMPATIBILITY: Record<
  ToneOfVoice,
  { intents: PrimaryIntent[]; angles: ContentAngle[] }
> = {
  consultant_professional: {
    intents: ["informational", "commercial_investigation", "navigational"],
    angles: ["problem_solution", "case_study_data", "ultimate_guide"],
  },
  informational_instructional: {
    intents: ["informational", "navigational"],
    angles: ["problem_solution", "ultimate_guide"],
  },
  commercial_balanced: {
    intents: ["commercial_investigation", "transactional"],
    angles: ["comparative", "case_study_data"],
  },
};

/**
 * Is `tone` allowed given the chosen primary intent and angle?
 * With both set we require intent ∩ angle; if that intersection would be empty
 * for every tone we relax to intent-only so the operator is never fully blocked.
 */
export function toneAllowed(
  tone: ToneOfVoice,
  primaryIntent: PrimaryIntent | "",
  angle: ContentAngle | "",
): boolean {
  const rule = TONE_COMPATIBILITY[tone];
  const intentOk = !primaryIntent || rule.intents.includes(primaryIntent);
  const angleOk = !angle || rule.angles.includes(angle);
  if (intentOk && angleOk) return true;
  // Fallback: if no tone satisfies both for this intent, allow on intent alone.
  const anyToneSatisfiesBoth = (Object.keys(TONE_COMPATIBILITY) as ToneOfVoice[]).some((t) => {
    const r = TONE_COMPATIBILITY[t];
    return (
      (!primaryIntent || r.intents.includes(primaryIntent)) &&
      (!angle || r.angles.includes(angle))
    );
  });
  return anyToneSatisfiesBoth ? false : intentOk;
}

/* ------------------------------------------------------------------ */

/** Max quoteable wiki/.edu/.gov (or tool page) research docs per project. */
export const MAX_QUOTEABLE_RESEARCH_DOCS = 3;

export const CONTENT_BRIEF_STORAGE_PREFIX = "gcc-content-brief:";

export type LengthBandKey =
  | "pillar"
  | "blog"
  | "tools"
  | "emailColdOutreach"
  | "socialFacebook"
  | "socialLinkedIn"
  | "instagram"
  | "metaAds"
  | "googleAds"
  | "imagePrompt";

export interface ContentBrief {
  briefVersion: number;
  primaryIntent: PrimaryIntent | "";
  secondaryIntent: SecondaryIntent | "";
  buyingStage: BuyingStage | "";
  audienceSegment: AudienceSegment | "";
  audienceDetails: AudienceDetail[];
  audienceNotes: string;
  angle: ContentAngle | "";
  ctaType: CtaType | "";
  ctaLabel: string;
  toneOfVoice: ToneOfVoice | "";
  eeatSignals: EeatSignal[];
  lengthBand: LengthBandKey | "";
  writingNotes: string;
  /** One organic title per line (hand-entered SERP notes). */
  serpTitles: string;
  /** One absolute http(s) organic URL per line (followed for deep research, ≤3). */
  serpUrls: string;
  /** One PAA question per line. */
  paaQuestions: string;
  /** One related search per line. */
  relatedSearches: string;
}

export function emptyContentBrief(): ContentBrief {
  return {
    briefVersion: BRIEF_VERSION,
    primaryIntent: "",
    secondaryIntent: "",
    buyingStage: "",
    audienceSegment: "",
    audienceDetails: [],
    audienceNotes: "",
    angle: "",
    ctaType: "",
    ctaLabel: "",
    toneOfVoice: "",
    eeatSignals: [],
    lengthBand: "",
    writingNotes: "",
    serpTitles: "",
    serpUrls: "",
    paaQuestions: "",
    relatedSearches: "",
  };
}

/* --------------------------- legacy migration --------------------------- */

const PRIMARY_INTENT_VALUES = PRIMARY_INTENTS.map((o) => o.value) as string[];
const SECONDARY_INTENT_VALUES = SECONDARY_INTENTS.map((o) => o.value) as string[];

const LEGACY_BUYING_STAGE: Record<string, BuyingStage> = {
  awareness: "awareness",
  tof_interest: "awareness",
  consideration: "consideration",
  mof_consideration: "consideration",
  action: "action",
  decision: "action",
  bof_actions: "action",
  retention: "action",
  advocacy: "action",
};

const LEGACY_AUDIENCE_SEGMENT: Record<string, AudienceSegment> = {
  affinity: "affinity",
  interest_affinity: "affinity",
  cold_prospect: "affinity",
  in_market: "in_market",
  life_events: "life_events",
  detailed_demographics: "detailed_demographics",
  your_data: "your_data",
  engaged_visitor: "your_data",
  lead: "your_data",
  customer: "your_data",
  lapsed: "your_data",
  lookalike: "your_data",
  custom: "custom",
  account_based: "custom",
  local_geo: "custom",
};

const LEGACY_AUDIENCE_DETAIL: Record<string, AudienceDetail> = {
  demographic_attributes: "demographic_attributes",
  demographic: "demographic_attributes",
  firmographic: "demographic_attributes",
  behavioral_triggers: "behavioral_triggers",
  list_match: "behavioral_triggers",
  boolean_combination: "boolean_combination",
  life_event: "boolean_combination",
  buying_committee: "boolean_combination",
};

const LEGACY_ANGLE: Record<string, ContentAngle> = {
  comparative: "comparative",
  comparison: "comparative",
  problem_solution: "problem_solution",
  case_study_data: "case_study_data",
  case_study: "case_study_data",
  ultimate_guide: "ultimate_guide",
  howto_workflow: "ultimate_guide",
  explainer: "ultimate_guide",
  listicle: "ultimate_guide",
  objection_faq: "ultimate_guide",
};

const LEGACY_CTA: Record<string, CtaType> = {
  sign_up: "sign_up",
  start_trial: "sign_up",
  subscribe: "sign_up",
  contact_us: "contact_us",
  book_now: "book_now",
  book_demo: "book_now",
  download: "download",
  learn_more: "learn_more",
  read_related: "learn_more",
  apply_now: "apply_now",
  get_quote: "get_quote",
  contact_quote: "get_quote",
  buy: "get_quote",
};

const TONE_VALUES = TONES_OF_VOICE.map((o) => o.value) as string[];
const EEAT_VALUES = EEAT_SIGNALS.map((o) => o.value) as string[];

/**
 * Normalize any persisted brief (legacy or current) into the canonical shape.
 * Runs on every read (localStorage load and server-JSON parse) so stale values
 * never reach the prompt.
 */
export function migrateBrief(raw: unknown): ContentBrief {
  const base = emptyContentBrief();
  if (!raw || typeof raw !== "object") return base;
  const p = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

  // Intent: split legacy single `intent` into primary/secondary.
  const legacyIntent = str(p.intent);
  let primaryIntent = str(p.primaryIntent);
  let secondaryIntent = str(p.secondaryIntent);
  if (!primaryIntent && legacyIntent) {
    if (PRIMARY_INTENT_VALUES.includes(legacyIntent)) primaryIntent = legacyIntent;
    else if (SECONDARY_INTENT_VALUES.includes(legacyIntent) && !secondaryIntent)
      secondaryIntent = legacyIntent;
  }
  base.primaryIntent = PRIMARY_INTENT_VALUES.includes(primaryIntent)
    ? (primaryIntent as PrimaryIntent)
    : "";
  base.secondaryIntent = SECONDARY_INTENT_VALUES.includes(secondaryIntent)
    ? (secondaryIntent as SecondaryIntent)
    : "";

  base.buyingStage = LEGACY_BUYING_STAGE[str(p.buyingStage)] ?? "";

  const seg = str(p.audienceSegment) || str(p.audiencePrimary);
  base.audienceSegment = LEGACY_AUDIENCE_SEGMENT[seg] ?? "";

  const detailsSource = arr(p.audienceDetails).length ? arr(p.audienceDetails) : arr(p.audienceModifiers);
  base.audienceDetails = Array.from(
    new Set(detailsSource.map((d) => LEGACY_AUDIENCE_DETAIL[d]).filter(Boolean) as AudienceDetail[]),
  );

  // Notes: prefer new field; fold legacy detail + exclude in on load.
  const notes = str(p.audienceNotes) || str(p.audienceDetail);
  const exclude = str(p.audienceExclude).trim();
  base.audienceNotes = exclude
    ? `${notes}${notes ? "\n" : ""}Exclude: ${exclude}`.trim()
    : notes;

  base.angle = LEGACY_ANGLE[str(p.angle)] ?? "";
  base.ctaType = LEGACY_CTA[str(p.ctaType)] ?? "";
  base.ctaLabel = str(p.ctaLabel);

  // Tone: legacy was a numeric Record; unknown/object → commercial_balanced.
  const toneRaw = p.toneOfVoice;
  base.toneOfVoice = typeof toneRaw === "string" && TONE_VALUES.includes(toneRaw)
    ? (toneRaw as ToneOfVoice)
    : toneRaw && typeof toneRaw === "object"
      ? "commercial_balanced"
      : "";

  base.eeatSignals = Array.from(
    new Set(arr(p.eeatSignals).filter((s) => EEAT_VALUES.includes(s)) as EeatSignal[]),
  );

  base.lengthBand = (str(p.lengthBand) as LengthBandKey) || "";
  // Normalize writing notes: collapse consecutive duplicate lines (one-time migration for stale storage)
  const rawNotes = str(p.writingNotes);
  base.writingNotes = rawNotes
    .split("\n")
    .reduce((acc: string[], line) => {
      if (acc.length === 0 || acc[acc.length - 1] !== line) {
        acc.push(line);
      }
      return acc;
    }, [])
    .join("\n");
  base.serpTitles = str(p.serpTitles);
  base.serpUrls = str(p.serpUrls);
  base.paaQuestions = str(p.paaQuestions);
  base.relatedSearches = str(p.relatedSearches);
  base.briefVersion = BRIEF_VERSION;
  return base;
}

/* ------------------------- summaries / labels ------------------------- */

function labelFor(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** Required fields for fail-closed Generate (inline validation). */
export function contentBriefMissingFields(brief: ContentBrief): string[] {
  const missing: string[] = [];
  if (!brief.primaryIntent) missing.push("Primary intent");
  if (!brief.buyingStage) missing.push("Buying stage");
  if (!brief.audienceSegment) missing.push("Audience segment");
  if (!brief.audienceNotes.trim()) missing.push("Audience notes");
  if (!brief.angle) missing.push("Angle");
  if (!brief.ctaType) missing.push("Call to action");
  if (!brief.toneOfVoice) missing.push("Tone of voice");
  if (brief.eeatSignals.length === 0) missing.push("E-E-A-T signal");
  if (!brief.lengthBand) missing.push("Length");
  return missing;
}

export function isContentBriefComplete(brief: ContentBrief): boolean {
  return contentBriefMissingFields(brief).length === 0;
}

/** Structured BRIEF block for prompts / research upload. */
export function buildBriefBlock(brief: ContentBrief, targetKeyword: string): string {
  const details =
    brief.audienceDetails.length > 0
      ? brief.audienceDetails.map((m) => labelFor(AUDIENCE_DETAILS, m)).join(", ")
      : "(none)";
  const eeat =
    brief.eeatSignals.length > 0
      ? brief.eeatSignals.map((s) => labelFor(EEAT_SIGNALS, s)).join(", ")
      : "(none)";

  const lines = [
    "=== BRIEF ===",
    `Target keyword: ${targetKeyword.trim()}`,
    `Primary intent: ${labelFor(PRIMARY_INTENTS, brief.primaryIntent)}`,
  ];
  if (brief.secondaryIntent) {
    lines.push(`Secondary intent: ${labelFor(SECONDARY_INTENTS, brief.secondaryIntent)}`);
  }
  lines.push(
    `Buying stage (Full Funnel): ${labelFor(BUYING_STAGES, brief.buyingStage)}`,
    `Audience segment: ${labelFor(AUDIENCE_SEGMENTS, brief.audienceSegment)}`,
    `Audience details: ${details}`,
    `Audience notes: ${brief.audienceNotes.trim()}`,
    "If notes conflict with segment, follow notes.",
    `Angle: ${labelFor(CONTENT_ANGLES, brief.angle)}`,
    `CTA type: ${labelFor(CTA_TYPES, brief.ctaType)}`,
  );
  if (brief.ctaLabel.trim()) {
    lines.push(`CTA label: ${brief.ctaLabel.trim()}`);
  }
  lines.push(
    `Tone of voice: ${labelFor(TONES_OF_VOICE, brief.toneOfVoice)}`,
    `E-E-A-T signals: ${eeat}`,
    `Length band: ${brief.lengthBand}`,
  );
  if (brief.writingNotes.trim()) {
    lines.push(`Writing notes: ${brief.writingNotes.trim()}`);
  }

  const titles = splitLines(brief.serpTitles);
  if (titles.length) {
    lines.push("SERP organic titles (hand-entered):");
    for (const t of titles) lines.push(`- ${t}`);
  }
  const urls = splitLines(brief.serpUrls);
  if (urls.length) {
    lines.push("SERP organic URLs (hand-entered):");
    for (const t of urls) lines.push(`- ${t}`);
  }
  const related = splitLines(brief.relatedSearches);
  if (related.length) {
    lines.push("Related searches (hand-entered):");
    for (const t of related) lines.push(`- ${t}`);
  }
  const paa = splitLines(brief.paaQuestions);
  if (paa.length) {
    lines.push("People Also Ask (hand-entered):");
    for (const t of paa) lines.push(`- ${t}`);
  }

  return lines.join("\n");
}

export function formatBriefAsHtml(brief: ContentBrief, targetKeyword: string): string {
  const block = buildBriefBlock(brief, targetKeyword);
  const paragraphs = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Content Brief</title></head>
<body>
<h1>Content Brief</h1>
${paragraphs}
</body>
</html>`;
}

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function loadBriefFromStorage(projectId: string): ContentBrief | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONTENT_BRIEF_STORAGE_PREFIX + projectId);
    if (!raw) return null;
    return migrateBrief(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveBriefToStorage(projectId: string, brief: ContentBrief): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONTENT_BRIEF_STORAGE_PREFIX + projectId, JSON.stringify(brief));
  } catch {
    /* ignore quota / disabled storage */
  }
}

/* ------------------------------------------------------------------ *
 * Content Length Targets (merged from lib/content-writer/types.ts)   *
 * ------------------------------------------------------------------ */

export const CONTENT_LENGTH_TARGETS = {
  pillar: {
    min: 3000,
    max: 5000,
    label: "3,000–5,000+",
    definition:
      "Exhaustive macro-level entry points for massive topics — multiple subsections that link out to cluster articles.",
  },
  blog: {
    min: 1800,
    max: 2500,
    label: "1,800–2,500",
    definition:
      "Deep-dive articles aimed at outranking competitors — substantive depth in every section, not surface summaries.",
  },
  emailColdOutreach: {
    min: 50,
    max: 125,
    label: "50–125",
    definition: "High response rates; pitch a single, clear call-to-action.",
  },
  tools: {
    min: 1500,
    max: 2500,
    label: "1,500–2,500",
    definition:
      "Comprehensive single-platform guides — deep implementation context, capabilities, and when to use it.",
  },
  imagePrompt: {
    min: 20,
    max: 400,
    label: "20–400",
  },
  socialFacebook: {
    minWords: 30,
    maxWords: 50,
    maxChars: 250,
    label: "~40 words, under 250 chars",
  },
  socialLinkedIn: {
    minWords: 200,
    maxWords: 300,
    minChars: 1300,
    maxChars: 1900,
    label: "200–300 words, 1,300–1,900 chars",
  },
  instagram: {
    minWords: 50,
    maxWords: 150,
    maxChars: 2200,
    label: "50–150 words, under 2,200 chars",
    definition: "Instagram caption — scannable, one clear ask, hashtags optional and sparse.",
  },
  metaAds: {
    minWords: 15,
    maxWords: 40,
    primaryTextMaxChars: 125,
    headlineMaxChars: 40,
    label: "Primary ~125 chars · headline ~40 chars",
    definition: "Meta feed/story ad — short primary text, punchy headline, single CTA.",
  },
  googleAds: {
    minWords: 8,
    maxWords: 30,
    headlineMaxChars: 30,
    descriptionMaxChars: 90,
    label: "Headlines ≤30 chars · descriptions ≤90 chars",
    definition: "Google Search/RSA-style — tight headlines and descriptions, keyword-aligned.",
  },
} as const;

/** Length bands offered on the Content Brief (keyed for generate guidance). */
export const LENGTH_BAND_OPTIONS: {
  value: keyof typeof CONTENT_LENGTH_TARGETS;
  label: string;
}[] = [
  { value: "pillar", label: `Pillar — ${CONTENT_LENGTH_TARGETS.pillar.label}` },
  { value: "blog", label: `Blog — ${CONTENT_LENGTH_TARGETS.blog.label}` },
  { value: "tools", label: `AI Tools page — ${CONTENT_LENGTH_TARGETS.tools.label}` },
  {
    value: "emailColdOutreach",
    label: `Cold email — ${CONTENT_LENGTH_TARGETS.emailColdOutreach.label}`,
  },
  {
    value: "socialFacebook",
    label: `Facebook — ${CONTENT_LENGTH_TARGETS.socialFacebook.label}`,
  },
  {
    value: "socialLinkedIn",
    label: `LinkedIn — ${CONTENT_LENGTH_TARGETS.socialLinkedIn.label}`,
  },
  { value: "instagram", label: `Instagram — ${CONTENT_LENGTH_TARGETS.instagram.label}` },
  { value: "metaAds", label: `Meta ads — ${CONTENT_LENGTH_TARGETS.metaAds.label}` },
  { value: "googleAds", label: `Google ads — ${CONTENT_LENGTH_TARGETS.googleAds.label}` },
  {
    value: "imagePrompt",
    label: `Image prompt — ${CONTENT_LENGTH_TARGETS.imagePrompt.label}`,
  },
];
