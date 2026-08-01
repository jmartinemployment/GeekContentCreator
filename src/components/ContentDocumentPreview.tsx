import type { ReactNode } from "react";
import {
  flattenDocumentText,
  parseContentDocument,
  type ContentParagraph,
  type ContentSection,
} from "@/lib/content-document";

function Runs({
  runs,
}: {
  runs?: { text?: string; bold?: boolean; italic?: boolean; linkUrl?: string }[];
}) {
  return (
    <>
      {(runs ?? []).map((run, i) => {
        const text = run.text ?? "";
        if (!text) return null;
        let node: ReactNode = text;
        if (run.bold) node = <strong>{node}</strong>;
        if (run.italic) node = <em>{node}</em>;
        if (run.linkUrl) {
          node = (
            <a href={run.linkUrl} className="underline" target="_blank" rel="noreferrer">
              {node}
            </a>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function Paragraph({ p }: { p: ContentParagraph }) {
  if (p.$type === "image") {
    const src =
      p.src ||
      (p.bytesBase64
        ? `data:${p.contentType || "image/webp"};base64,${p.bytesBase64}`
        : "");
    if (!src) return null;
    return (
      <figure className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={p.alt || "Visual"}
          className="max-h-[480px] w-full border border-[var(--gcc-line)] object-contain bg-white"
        />
      </figure>
    );
  }
  if (p.$type === "text") {
    return (
      <p className="text-[15px] leading-relaxed text-[var(--gcc-ink)]">
        <Runs runs={p.runs} />
      </p>
    );
  }
  if (p.$type === "list") {
    const Tag = p.ordered ? "ol" : "ul";
    return (
      <Tag
        className={`space-y-1.5 text-[15px] leading-relaxed text-[var(--gcc-ink)] ${
          p.ordered ? "list-decimal pl-5" : "list-disc pl-5"
        }`}
      >
        {(p.items ?? []).map((item, i) => (
          <li key={i}>
            {typeof item === "string" ? (
              item
            ) : (
              <Runs runs={item} />
            )}
          </li>
        ))}
      </Tag>
    );
  }
  return null;
}

function Section({ section, depth = 0 }: { section: ContentSection; depth?: number }) {
  const HeadingTag = depth === 0 ? "h2" : depth === 1 ? "h3" : "h4";
  return (
    <section className="space-y-3">
      {section.heading ? (
        <HeadingTag className="font-display text-xl font-semibold text-[var(--gcc-ink)]">
          {section.heading}
        </HeadingTag>
      ) : null}
      <div className="space-y-3">
        {(section.paragraphs ?? []).map((p, i) => (
          <Paragraph key={i} p={p} />
        ))}
      </div>
      {(section.children ?? []).map((child, i) => (
        <Section key={i} section={child} depth={depth + 1} />
      ))}
    </section>
  );
}

export function ContentDocumentPreview({
  bodyDocumentJson,
}: {
  bodyDocumentJson: string;
}) {
  const doc = parseContentDocument(bodyDocumentJson);
  if (!doc) {
    return (
      <pre className="overflow-auto whitespace-pre-wrap rounded-md border border-[var(--gcc-line)] bg-white p-4 text-xs text-[var(--gcc-muted)]">
        {bodyDocumentJson || "(empty)"}
      </pre>
    );
  }

  const plain = flattenDocumentText(doc);
  if (!plain.trim() && !doc.lede && !(doc.sections?.length)) {
    return (
      <p className="text-sm text-[var(--gcc-muted)]">Empty document.</p>
    );
  }

  return (
    <article className="space-y-6 rounded-md border border-[var(--gcc-line)] bg-white p-6">
      {doc.lede ? (
        <p className="text-base leading-relaxed text-[var(--gcc-ink)]">{doc.lede}</p>
      ) : null}
      {(doc.sections ?? []).map((section, i) => (
        <Section key={i} section={section} />
      ))}
    </article>
  );
}
