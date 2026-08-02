import { SiteAnalyzerClient } from "./site-analyzer-client";

export default function SiteAnalyzerPage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="font-display text-3xl font-semibold">Site Analyzer</h1>
      <p className="mt-2 text-[var(--gcc-muted)]">
        Analyze a website: crawl its pages, map topic coverage, list content gaps,
        then start a create with site section context.
      </p>
      <SiteAnalyzerClient />
    </div>
  );
}
