import type { SiteSectionContext } from "@/lib/types";

export function SiteContextBanner({
  siteSection,
}: {
  siteSection: SiteSectionContext | null;
}) {
  if (!siteSection) return null;
  const n = siteSection.relatedPages?.length ?? 0;
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
        {siteSection.isDemo
          ? " Demo stand-ins (set a Niche profile id for live Geek-SEO gaps)."
          : ""}
      </p>
    </div>
  );
}
