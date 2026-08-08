export function SiteHeadingHierarchy({
  pages,
  gaps,
}: {
  pages?: Array<{ url: string; title: string; headings: Array<{ level: number; text: string }> }>;
  gaps?: Array<{ topic: string }>;
}) {
  if (!pages || pages.length === 0) return null;
  const pagesWithHeadings = pages.filter((p) => p.headings.length > 0);
  if (pagesWithHeadings.length === 0) return null;

  const gapTopics = new Set((gaps ?? []).map((g) => g.topic.toLowerCase()));
  const isGap = (headingText: string) => gapTopics.has(headingText.toLowerCase());

  return (
    <div className="rounded-md border border-[var(--gcc-teal)]/30 bg-[var(--gcc-teal)]/10 px-4 py-3 text-sm text-[var(--gcc-ink)]">
      <p className="font-semibold text-[var(--gcc-teal-deep)]">Site structure</p>
      <p className="mt-1 text-xs text-[var(--gcc-muted)]">
        {pages.length} page{pages.length === 1 ? "" : "s"} with heading hierarchy
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-[var(--gcc-teal-deep)]">
          Expand to view headings
        </summary>
        <ul className="mt-2 space-y-2 pl-2">
          {pagesWithHeadings.map((p) => (
            <li key={p.url} className="text-xs">
              <p className="font-medium text-[var(--gcc-ink)]">{p.title}</p>
              <ul className="mt-0.5">
                {p.headings.map((h, i) => {
                  const isMissingPage = isGap(h.text);
                  return (
                    <li
                      key={i}
                      className={isMissingPage ? "text-red-600" : "text-[var(--gcc-muted)]"}
                      style={{ paddingLeft: `${Math.max(0, h.level - 1) * 0.75}rem` }}
                    >
                      H{h.level}: {h.text}
                      {isMissingPage ? " — missing page" : ""}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
