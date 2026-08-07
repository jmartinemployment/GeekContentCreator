import type { SiteSectionContext } from "@/lib/types";

export function SiteContextBanner({
  siteSection,
}: {
  siteSection: SiteSectionContext | null;
}) {
  if (!siteSection) return null;
  const pages = siteSection.relatedPages ?? [];
  const n = pages.length;
  return (
    <div className="rounded-md border border-[var(--gcc-teal)]/30 bg-[var(--gcc-teal)]/10 px-4 py-3 text-sm text-[var(--gcc-ink)]">
      <p className="font-semibold text-[var(--gcc-teal-deep)]">
        Site section context attached
      </p>
      <p className="mt-1 text-[var(--gcc-muted)]">
        Using {n} related page{n === 1 ? "" : "s"}
        {siteSection.gapSectionPath
          ? ` from “${siteSection.gapSectionPath}”`
          : " from this site section"}
        {siteSection.gapTopic ? ` · gap: ${siteSection.gapTopic}` : ""}.
      </p>
      {pages.some((p) => p.headings.length > 0) ? (
        <ul className="mt-2 space-y-1.5">
          {pages
            .filter((p) => p.headings.length > 0)
            .map((p) => (
              <li key={p.url}>
                <p className="text-xs font-medium text-[var(--gcc-ink)]">{p.title}</p>
                <ul className="mt-0.5">
                  {p.headings.map((h, i) => (
                    <li
                      key={i}
                      className="text-xs text-[var(--gcc-muted)]"
                      style={{ paddingLeft: `${Math.max(0, h.level - 1) * 0.75}rem` }}
                    >
                      H{h.level}: {h.text}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
