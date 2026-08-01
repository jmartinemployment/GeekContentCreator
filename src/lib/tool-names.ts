import { flattenDocumentText, parseContentDocument } from "@/lib/content-document";

/** Heuristic: pull likely tool/product names from headings and capitalized phrases. */
export function extractCandidateToolNames(bodyDocumentJson: string): string[] {
  const doc = parseContentDocument(bodyDocumentJson);
  if (!doc) return [];

  const names = new Set<string>();
  const walkHeadings = (sections: { heading?: string; children?: unknown[] }[] | undefined) => {
    if (!sections) return;
    for (const s of sections) {
      const h = s.heading?.trim();
      if (h && h.length < 80 && !/^(introduction|conclusion|faq|overview|summary)/i.test(h)) {
        names.add(h.replace(/^#+\s*/, ""));
      }
      walkHeadings(s.children as typeof sections);
    }
  };
  walkHeadings(doc.sections);

  const plain = flattenDocumentText(doc);
  const toolSection = plain.match(/(?:tools?|software|platforms?)[:\s]+([^\n]+)/i);
  if (toolSection?.[1]) {
    for (const part of toolSection[1].split(/[,;|/]/)) {
      const t = part.trim();
      if (t.length > 1 && t.length < 60) names.add(t);
    }
  }

  return [...names].slice(0, 24);
}
