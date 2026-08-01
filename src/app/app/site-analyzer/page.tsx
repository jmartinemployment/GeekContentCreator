import { SiteAnalyzerClient } from "./site-analyzer-client";

export default function SiteAnalyzerPage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="font-display text-3xl font-semibold">Site Analyzer</h1>
      <p className="mt-2 text-[var(--gcc-muted)]">
        Understand the site, list content gaps, pick one to start a create with site section
        context. Capability of Content Creator — not a separate product.
      </p>
      <SiteAnalyzerClient />
    </div>
  );
}
