/**
 * On-page SEO + polish heuristics for Content Creator drafts.
 * New implementation for CWV2 article/blog text — not a GCW file port.
 */

export type QualityCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  fixHint: string | null;
};

export type SeoReport = {
  targetKeyword: string;
  score: number;
  wordCount: number;
  keywordDensityPercent: number;
  checks: QualityCheck[];
  applyFeedback: string;
};

export type PolishReport = {
  score: number;
  shipReady: boolean;
  checks: QualityCheck[];
  applyFeedback: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase.trim()) return false;
  return haystack.toLowerCase().includes(phrase.toLowerCase());
}

function countPhrase(text: string, phrase: string): number {
  const p = phrase.trim().toLowerCase();
  if (!p) return 0;
  const hay = text.toLowerCase();
  let count = 0;
  let idx = 0;
  while (true) {
    const found = hay.indexOf(p, idx);
    if (found < 0) break;
    count += 1;
    idx = found + p.length;
  }
  return count;
}

function extractHeadingsFromHtml(html: string): string[] {
  const headings: string[] = [];
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const t = stripHtml(m[1]);
    if (t) headings.push(t);
  }
  return headings;
}

export function analyzeOnPageSeo(input: {
  title: string;
  metaDescription: string;
  bodyHtml: string;
  targetKeyword: string;
}): SeoReport {
  const keyword = input.targetKeyword.trim();
  const plain = stripHtml(input.bodyHtml);
  const words = tokenize(plain);
  const wordCount = words.length;
  const headings = extractHeadingsFromHtml(input.bodyHtml);
  const lede = plain.slice(0, Math.min(plain.length, 400));
  const density =
    wordCount === 0 || !keyword
      ? 0
      : (100 * countPhrase(plain, keyword)) / wordCount;

  const checks: QualityCheck[] = [];

  if (!keyword) {
    checks.push({
      id: "keyword-missing",
      label: "Target keyword",
      passed: false,
      detail: "No target keyword on this project.",
      fixHint: "Set the project target keyword.",
    });
  } else {
    const inTitle = containsPhrase(input.title, keyword);
    checks.push({
      id: "keyword-in-title",
      label: "Keyword in title",
      passed: inTitle,
      detail: inTitle
        ? "Title includes the target keyword."
        : "Title does not include the target keyword.",
      fixHint: inTitle ? null : `Include “${keyword}” in the title.`,
    });

    const inMeta = containsPhrase(input.metaDescription, keyword);
    checks.push({
      id: "keyword-in-meta",
      label: "Keyword in meta description",
      passed: inMeta,
      detail: inMeta
        ? "Meta description includes the keyword."
        : "Meta description misses the keyword.",
      fixHint: inMeta ? null : `Mention “${keyword}” in the meta description.`,
    });

    const inLede = containsPhrase(lede, keyword);
    checks.push({
      id: "keyword-in-lede",
      label: "Keyword near the open",
      passed: inLede,
      detail: inLede
        ? "Opening copy includes the keyword."
        : "Opening copy does not include the keyword.",
      fixHint: inLede ? null : `Use “${keyword}” early in the draft.`,
    });

    const inHeading = headings.some((h) => containsPhrase(h, keyword));
    checks.push({
      id: "keyword-in-heading",
      label: "Keyword in a heading",
      passed: inHeading,
      detail: inHeading
        ? "At least one heading includes the keyword."
        : "No heading includes the keyword.",
      fixHint: inHeading
        ? null
        : `Use “${keyword}” in at least one H2.`,
    });

    const densityOk = density >= 0.4 && density <= 2.5;
    checks.push({
      id: "keyword-density",
      label: "Keyword density",
      passed: densityOk,
      detail: `Density ≈ ${density.toFixed(2)}% (aim ~0.4–2.5%).`,
      fixHint: densityOk
        ? null
        : density < 0.4
          ? `Add natural mentions of “${keyword}”.`
          : `Reduce repetition of “${keyword}”.`,
    });
  }

  const lengthOk = wordCount >= 800;
  checks.push({
    id: "length",
    label: "Draft length",
    passed: lengthOk,
    detail: `${wordCount.toLocaleString()} words (aim ≥ 800 for long-form).`,
    fixHint: lengthOk ? null : "Expand thin sections with concrete detail.",
  });

  const metaLen = input.metaDescription.trim().length;
  const metaOk = metaLen >= 50 && metaLen <= 160;
  checks.push({
    id: "meta-length",
    label: "Meta description length",
    passed: metaOk,
    detail: `${metaLen} characters (aim 50–160).`,
    fixHint: metaOk ? null : "Tighten or expand the meta description.",
  });

  const passed = checks.filter((c) => c.passed).length;
  const score = Math.round((passed / checks.length) * 100);
  const applyFeedback = checks
    .filter((c) => !c.passed && c.fixHint)
    .map((c) => c.fixHint)
    .join(" ");

  return {
    targetKeyword: keyword,
    score,
    wordCount,
    keywordDensityPercent: density,
    checks,
    applyFeedback,
  };
}

export function analyzePolish(input: {
  title: string;
  bodyHtml: string;
}): PolishReport {
  const plain = stripHtml(input.bodyHtml);
  const words = tokenize(plain);
  const sentences = plain.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const checks: QualityCheck[] = [];

  const titleOk = input.title.trim().length >= 20 && input.title.trim().length <= 70;
  checks.push({
    id: "title-length",
    label: "Title length",
    passed: titleOk,
    detail: `Title is ${input.title.trim().length} characters.`,
    fixHint: titleOk ? null : "Aim for a clear title around 20–70 characters.",
  });

  const avg =
    sentences.length === 0
      ? 0
      : sentences.reduce((n, s) => n + tokenize(s).length, 0) / sentences.length;
  const sentenceOk = avg > 0 && avg <= 28;
  checks.push({
    id: "sentence-length",
    label: "Average sentence length",
    passed: sentenceOk,
    detail: `Average ≈ ${avg.toFixed(1)} words/sentence.`,
    fixHint: sentenceOk ? null : "Break up long sentences.",
  });

  const hedge =
    /\b(very|really|just|simply|actually|basically|clearly|obviously)\b/gi;
  const hedgeCount = (plain.match(hedge) || []).length;
  const hedgeOk = hedgeCount <= 8;
  checks.push({
    id: "hedge-words",
    label: "Filler / hedge words",
    passed: hedgeOk,
    detail: `Found ${hedgeCount} common filler/hedge tokens.`,
    fixHint: hedgeOk ? null : "Cut filler words (very, really, just, basically…).",
  });

  const passive = /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi;
  const passiveCount = (plain.match(passive) || []).length;
  const passiveOk = words.length === 0 || passiveCount / words.length < 0.04;
  checks.push({
    id: "passive-voice",
    label: "Passive-ish constructions",
    passed: passiveOk,
    detail: `Heuristic passive hits: ${passiveCount}.`,
    fixHint: passiveOk ? null : "Prefer active voice where it reads cleaner.",
  });

  const passed = checks.filter((c) => c.passed).length;
  const score = Math.round((passed / checks.length) * 100);
  const shipReady = score >= 75;
  const applyFeedback = checks
    .filter((c) => !c.passed && c.fixHint)
    .map((c) => c.fixHint)
    .join(" ");

  return { score, shipReady, checks, applyFeedback };
}
