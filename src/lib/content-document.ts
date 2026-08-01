export type ContentRun = {
  text?: string;
  bold?: boolean;
  italic?: boolean;
  linkUrl?: string;
};

export type ContentParagraph =
  | { $type: "text"; runs?: ContentRun[] }
  | {
      $type: "list";
      ordered?: boolean;
      items?: ContentRun[][] | string[];
    }
  | {
      $type: "image";
      alt?: string;
      contentType?: string;
      src?: string;
      bytesBase64?: string;
    };

export type ContentSection = {
  heading?: string;
  paragraphs?: ContentParagraph[];
  children?: ContentSection[];
};

export type ContentDocument = {
  lede?: string;
  sections?: ContentSection[];
};

export function parseContentDocument(json: string): ContentDocument | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as ContentDocument;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function flattenDocumentText(doc: ContentDocument): string {
  const parts: string[] = [];
  if (doc.lede?.trim()) parts.push(doc.lede.trim());
  const walk = (sections: ContentSection[] | undefined) => {
    if (!sections) return;
    for (const section of sections) {
      if (section.heading?.trim()) parts.push(section.heading.trim());
      for (const p of section.paragraphs ?? []) {
        if (p.$type === "text") {
          const t = (p.runs ?? []).map((r) => r.text ?? "").join("");
          if (t.trim()) parts.push(t.trim());
        } else if (p.$type === "list") {
          for (const item of p.items ?? []) {
            if (typeof item === "string") {
              if (item.trim()) parts.push(`• ${item.trim()}`);
            } else {
              const t = item.map((r) => r.text ?? "").join("");
              if (t.trim()) parts.push(`• ${t.trim()}`);
            }
          }
        }
      }
      walk(section.children);
    }
  };
  walk(doc.sections);
  return parts.join("\n\n");
}

export function parseSiteSection(
  json: string | null | undefined,
): import("@/lib/types").SiteSectionContext | null {
  if (!json?.trim()) return null;
  try {
    return JSON.parse(json) as import("@/lib/types").SiteSectionContext;
  } catch {
    return null;
  }
}
