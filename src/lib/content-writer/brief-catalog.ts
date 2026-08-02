/**
 * Locked Content Brief catalogs for Geek Content Creator.
 * Human-selected controls — not inferred from SERP HTML.
 */

export const SEARCH_INTENTS = [
  { value: "informational", label: "Informational" },
  { value: "commercial_investigation", label: "Commercial investigation" },
  { value: "transactional", label: "Transactional" },
  { value: "navigational", label: "Navigational" },
  { value: "local", label: "Local" },
  { value: "comparison", label: "Comparison" },
] as const;

export type SearchIntent = (typeof SEARCH_INTENTS)[number]["value"];

/** Single-select buying stage: Funnel + Analytics groups (pick exactly one). */
export const BUYING_STAGE_GROUPS = [
  {
    label: "Funnel",
    options: [
      { value: "awareness", label: "Awareness" },
      { value: "consideration", label: "Consideration (Research / Evaluation)" },
      { value: "decision", label: "Decision (Conversion / Purchase)" },
      { value: "retention", label: "Retention" },
      { value: "advocacy", label: "Advocacy / Loyalty" },
    ],
  },
  {
    label: "Analytics / Tag Manager",
    options: [
      { value: "tof_interest", label: "Top of funnel (Interest)" },
      { value: "mof_consideration", label: "Middle of funnel (Consideration)" },
      { value: "bof_actions", label: "Bottom of funnel (Actions)" },
    ],
  },
] as const;

export type BuyingStage =
  (typeof BUYING_STAGE_GROUPS)[number]["options"][number]["value"];

export const BUYING_STAGE_HELPER =
  "Top / Middle / Bottom of funnel are Analytics naming for Awareness / Consideration / Decision. Pick one stage — do not treat Analytics labels as a second independent stage.";

export const AUDIENCE_PRIMARIES = [
  { value: "cold_prospect", label: "Cold prospect" },
  { value: "engaged_visitor", label: "Engaged visitor" },
  { value: "in_market", label: "In-market / high intent" },
  { value: "lead", label: "Lead" },
  { value: "customer", label: "Customer" },
  { value: "lapsed", label: "Lapsed" },
  { value: "lookalike", label: "Lookalike of customers" },
  { value: "account_based", label: "Account-based (named accounts)" },
  { value: "interest_affinity", label: "Interest / affinity" },
  { value: "local_geo", label: "Local / geo-radius" },
] as const;

export type AudiencePrimary = (typeof AUDIENCE_PRIMARIES)[number]["value"];

export const AUDIENCE_MODIFIERS = [
  { value: "demographic", label: "Demographic" },
  { value: "firmographic", label: "Firmographic" },
  { value: "buying_committee", label: "Buying-committee role" },
  { value: "life_event", label: "Life event" },
  { value: "list_match", label: "List match" },
] as const;

export type AudienceModifier = (typeof AUDIENCE_MODIFIERS)[number]["value"];

export const CONTENT_ANGLES = [
  { value: "howto_workflow", label: "How-to / workflow" },
  { value: "explainer", label: "Explainer / definition" },
  { value: "comparison", label: "Comparison" },
  { value: "listicle", label: "Listicle / roundup" },
  { value: "case_study", label: "Case study / proof" },
  { value: "problem_solution", label: "Problem → solution" },
  { value: "objection_faq", label: "Objection-handling / FAQ-led" },
] as const;

export type ContentAngle = (typeof CONTENT_ANGLES)[number]["value"];

export const CTA_TYPES = [
  { value: "book_demo", label: "Book a demo / call" },
  { value: "start_trial", label: "Start free trial / signup" },
  { value: "download", label: "Download resource" },
  { value: "contact_quote", label: "Contact / get a quote" },
  { value: "read_related", label: "Read related guide" },
  { value: "subscribe", label: "Subscribe / join list" },
  { value: "buy", label: "Buy / checkout" },
] as const;

export type CtaType = (typeof CTA_TYPES)[number]["value"];

/** Bipolar ToV scales: 1 = left, 3 = neutral, 5 = right. */
export const TOV_SCALES = [
  { key: "formalCasual", left: "Formal", right: "Casual" },
  { key: "seriousPlayful", left: "Serious", right: "Playful" },
  { key: "matterEnthusiastic", left: "Matter-of-fact", right: "Enthusiastic" },
  { key: "technicalPlain", left: "Technical", right: "Plain-language" },
  { key: "authoritativePeer", left: "Authoritative", right: "Peer / humble" },
  { key: "warmDetached", left: "Warm / empathetic", right: "Detached / clinical" },
] as const;

export type TovScaleKey = (typeof TOV_SCALES)[number]["key"];

export type ToneOfVoiceScales = Record<TovScaleKey, number>;

export const TOV_NEUTRAL: ToneOfVoiceScales = {
  formalCasual: 3,
  seriousPlayful: 3,
  matterEnthusiastic: 3,
  technicalPlain: 3,
  authoritativePeer: 3,
  warmDetached: 3,
};

export const TOV_PRESETS: { id: string; label: string; scales: ToneOfVoiceScales }[] = [
  {
    id: "professional",
    label: "Professional",
    scales: {
      formalCasual: 2,
      seriousPlayful: 2,
      matterEnthusiastic: 2,
      technicalPlain: 4,
      authoritativePeer: 2,
      warmDetached: 3,
    },
  },
  {
    id: "punchy",
    label: "Punchy",
    scales: {
      formalCasual: 4,
      seriousPlayful: 4,
      matterEnthusiastic: 5,
      technicalPlain: 4,
      authoritativePeer: 3,
      warmDetached: 3,
    },
  },
  {
    id: "technical",
    label: "Technical",
    scales: {
      formalCasual: 2,
      seriousPlayful: 2,
      matterEnthusiastic: 2,
      technicalPlain: 1,
      authoritativePeer: 2,
      warmDetached: 4,
    },
  },
  {
    id: "warm",
    label: "Warm",
    scales: {
      formalCasual: 3,
      seriousPlayful: 3,
      matterEnthusiastic: 3,
      technicalPlain: 4,
      authoritativePeer: 4,
      warmDetached: 1,
    },
  },
  {
    id: "formal",
    label: "Formal",
    scales: {
      formalCasual: 1,
      seriousPlayful: 1,
      matterEnthusiastic: 2,
      technicalPlain: 3,
      authoritativePeer: 2,
      warmDetached: 4,
    },
  },
];

/** Max quoteable wiki/.edu/.gov (or tool page) research docs per project. */
export const MAX_QUOTEABLE_RESEARCH_DOCS = 3;

export const CONTENT_BRIEF_FILE_NAME = "content-brief.html";
export const CONTENT_BRIEF_PAA_FILE_NAME = "content-brief-paa.txt";
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
  intent: SearchIntent | "";
  buyingStage: BuyingStage | "";
  audiencePrimary: AudiencePrimary | "";
  audienceModifiers: AudienceModifier[];
  audienceDetail: string;
  audienceExclude: string;
  angle: ContentAngle | "";
  ctaType: CtaType | "";
  ctaLabel: string;
  toneOfVoice: ToneOfVoiceScales;
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
    intent: "",
    buyingStage: "",
    audiencePrimary: "",
    audienceModifiers: [],
    audienceDetail: "",
    audienceExclude: "",
    angle: "",
    ctaType: "",
    ctaLabel: "",
    toneOfVoice: { ...TOV_NEUTRAL },
    lengthBand: "",
    writingNotes: "",
    serpTitles: "",
    serpUrls: "",
    paaQuestions: "",
    relatedSearches: "",
  };
}

/**
 * Auto ToV summary for UI + BRIEF block.
 * value === 3 → omit; &lt; 3 → left adjective; &gt; 3 → right adjective.
 * All neutral → "(brand default — no ToV lean)".
 */
export function buildToneOfVoiceSummary(scales: ToneOfVoiceScales): string {
  const parts: string[] = [];
  for (const scale of TOV_SCALES) {
    const v = scales[scale.key];
    if (v === 3 || v == null) continue;
    parts.push(v < 3 ? scale.left : scale.right);
  }
  if (parts.length === 0) return "(brand default — no ToV lean)";
  return parts.join(" · ");
}

function labelFor(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function buyingStageLabel(value: string): string {
  for (const g of BUYING_STAGE_GROUPS) {
    const hit = g.options.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  return value;
}

/** Required fields for fail-closed Generate (inline validation). */
export function contentBriefMissingFields(brief: ContentBrief): string[] {
  const missing: string[] = [];
  if (!brief.intent) missing.push("Intent");
  if (!brief.buyingStage) missing.push("Buying stage");
  if (!brief.audiencePrimary) missing.push("Audience");
  if (!brief.audienceDetail.trim()) missing.push("Audience detail");
  if (!brief.angle) missing.push("Angle");
  if (!brief.ctaType) missing.push("Call to action");
  if (!brief.lengthBand) missing.push("Length");
  return missing;
}

export function isContentBriefComplete(brief: ContentBrief): boolean {
  return contentBriefMissingFields(brief).length === 0;
}

/** Structured BRIEF block for prompts / research upload. */
export function buildBriefBlock(brief: ContentBrief, targetKeyword: string): string {
  const tov = buildToneOfVoiceSummary(brief.toneOfVoice);
  const audienceLabel = labelFor(AUDIENCE_PRIMARIES, brief.audiencePrimary);
  const modifiers =
    brief.audienceModifiers.length > 0
      ? brief.audienceModifiers
          .map((m) => labelFor(AUDIENCE_MODIFIERS, m))
          .join(", ")
      : "(none)";

  const lines = [
    "=== BRIEF ===",
    `Target keyword: ${targetKeyword.trim()}`,
    `Intent: ${labelFor(SEARCH_INTENTS, brief.intent)}`,
    `Buying stage: ${buyingStageLabel(brief.buyingStage)}`,
    `Audience primary: ${audienceLabel}`,
    `Audience modifiers: ${modifiers}`,
    `Audience detail: ${brief.audienceDetail.trim()}`,
    "If detail conflicts with primary, follow detail.",
  ];
  if (brief.audienceExclude.trim()) {
    lines.push(`Audience exclude: ${brief.audienceExclude.trim()}`);
  }
  lines.push(
    `Angle: ${labelFor(CONTENT_ANGLES, brief.angle)}`,
    `CTA type: ${labelFor(CTA_TYPES, brief.ctaType)}`,
  );
  if (brief.ctaLabel.trim()) {
    lines.push(`CTA label: ${brief.ctaLabel.trim()}`);
  }
  lines.push(`Tone of voice: ${tov}`, `Length band: ${brief.lengthBand}`);
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
    const parsed = JSON.parse(raw) as ContentBrief;
    return {
      ...emptyContentBrief(),
      ...parsed,
      toneOfVoice: { ...TOV_NEUTRAL, ...parsed.toneOfVoice },
      audienceModifiers: Array.isArray(parsed.audienceModifiers)
        ? parsed.audienceModifiers
        : [],
    };
  } catch {
    return null;
  }
}

export function saveBriefToStorage(projectId: string, brief: ContentBrief): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    CONTENT_BRIEF_STORAGE_PREFIX + projectId,
    JSON.stringify(brief),
  );
}
