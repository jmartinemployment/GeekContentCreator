import { SiteAnalyzerClient } from "./site-analyzer-client";

export default function SiteAnalyzerPage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="font-display text-3xl font-semibold">Site Analyzer</h1>
      <p className="mt-2 text-[var(--gcc-muted)]">
        Load content gaps from a site you already analyzed in Geek-SEO, then start a
        create with that site section context. Niche analysis runs in Geek-SEO — this
        screen only reads the result.
      </p>
      <SiteAnalyzerClient />
    </div>
  );
}
