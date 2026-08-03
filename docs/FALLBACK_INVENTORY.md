# Fallback Inventory — Geek-SEO / GeekAPI / GeekContentCreator

**Generated:** 2026-08-03. Read-only research; keep/eliminate decisions are the user's.
**Scope:** every fallback found across the three repos, grouped by what it actually does, with file:line evidence.
**GeekContentCreator (frontend):** zero data fallbacks — every `placeholder=` is an input hint, every `fallback={` is a React loading spinner. Not listed below.

---

## A. Data-fabrication — invents fake findings from nothing

1. **`Geek-SEO GeekSeoBackend/Services/SiteAnalyzerStepRunners/SiteAnalysisStepExecutionService.cs:1125`** *(LIVE)* — when a pillar has <3 real child pages, injects 5 hardcoded generic subtopics (`what-is`, `how-much-does-cost`, `near-me`, `how-to`, `benefits`) as fake gaps. **← the "lame heading gaps" bug.**
2. **`Geek-SEO GeekSeoBackend/Services/SiteAnalyzerService.cs:501` `BuildSubtopics`** *(DEAD duplicate of #1)* — same 5 templates; unreferenced by the live pipeline.
3. **`GeekAPI Services/ContentWriterV3/ContentPlanService.cs:104`** — always returns `"Placeholder insight from evidence"` (Importance 8, Difficulty 3) regardless of real input; TODO admits evidence is never analyzed.
4. **`GeekAPI Services/ContentWriterV3/ContentPlanService.cs:38`** — "For now, return a basic structure" content-plan stub.

## B. Stubs — return empty / not-implemented (honest, but unfinished)

5. **`GeekAPI Controllers/ContentWriterV3/AnalyticsController.cs:36`** — "For now, return empty analytics."
6. **`GeekAPI Services/ContentWriterV3/NotificationService.cs:6,44,83`** — stub SendGrid / Slack / GA4 / WordPress adapters (return not-implemented).

## C. Provider redundancy — real data from a backup provider

7. **`Geek-SEO GeekSeoBackend/Providers/Seo/FallbackSerpProvider.cs`** — SerpApi → DataForSEO.
8. **`Geek-SEO GeekSeoBackend/Providers/Seo/FallbackAIProvider.cs`** — OpenAI → Claude.
9. **`Geek-SEO GeekSeoBackend/Services/LocalServiceArea/NominatimGeocodeService.cs`** — Google Maps → OpenStreetMap geocoding.
10. **`Geek-SEO GeekSeoBackend/Extensions/SeoProviderRegistration.cs:20,67…`** — `SERP_PROVIDER_FALLBACK` env wiring for #7.
11. **`Geek-SEO GeekSeoBackend/Services/SiteExtraction/PillarDemandEnricher.cs:391`** — SERP retry with `PlacesOnly=false` when the strict query returns nothing.

## D. Extraction-method — same real data, different fetch method

12. **`Geek-SEO GeekSeoBackend/Services/SiteExtraction/PageContentExtractor.cs:10`** — Playwright when available, else HTTP + regex. (Same pattern in `SchemaOrgExtractor` / `HomepageHeadingsExtractor`.)

## E. Persistence resilience — real data, alternate save/load path

13. **`Geek-SEO GeekSeoBackend/Services/SiteAnalysisPersistenceService.cs:133,153` `FallbackMonolithicSaveAsync`** — if the granular save fails, retry as one monolithic save.
14. **`Geek-SEO GeekSeoBackend/Services/SiteAnalyzerStepRunners/SiteAnalysisStepRelationalLoader.cs:65,97,154,395`** — reads the step artifact-store as a fallback source when relational rows are absent (`fallback?.X ?? []`).

## F. Silent catch → return null/empty (swallows the failure)

15. **`Geek-SEO GeekSeoBackend/Services/SiteAnalyzerService.cs:619` `LoadPriorSitemapUrlsWithFallbackAsync`** — `catch { return null; }`; likely also legacy now that sitemap step 1 always regenerates.
16. **Various `SiteExtraction` catch→empty**: `GscQueryExtractor.cs:151`, `SchemaOrgExtractor.cs:170`, `SitemapExtractor.cs:67,103`, `NavMenuExtractor.cs:108`, `SiteAnalysisTopicalMapSeedResolver.cs:17` — return `[]` on failure instead of surfacing it.

## G. Labeled "fallback" but data is still real

17. **`Geek-SEO GeekSeoBackend/Services/SiteExtraction/NavMenuExtractor.cs:51`** — tags the nav result's source as `"fallback"` when it found <2 links, but the pillars returned are still really extracted — a source label, not fabricated data.

---

## Excluded (not fallbacks, for clarity)

- **`GeekAPI Services/Gcw/GcwPolishAnalyzer.cs` `PlaceholderSnippets`** — a QA check that *detects* placeholder copy in drafts (the opposite of fabricating it).
- Frontend `placeholder=` (input hints) and `fallback={` (React Suspense loading spinners).

---

## Next step

User marks which numbers to eliminate vs. keep. A plan is then built around exactly that set — nothing more. (#1 is the confirmed Site Analyzer heading-gaps fix regardless.)
