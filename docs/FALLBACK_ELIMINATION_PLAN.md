# Plan: Eliminate fallbacks + real heading-based gap detection

## Context

Site Analyzer fabricates content gaps (5 hardcoded generic templates) instead of finding real ones, and the codebase carries a range of other fallbacks that mask failures or silently substitute data/providers without the operator's knowledge. Per the user's rule — never fabricate, never silently degrade, surface failures — this plan replaces the gap fabrication with real heading-based detection and eliminates the fallbacks the user selected. Scope and per-item failure behavior were verified by direct code exploration (file:line anchors below); three items differed from their surface read and were resolved with the user.

All backend work is in `/Users/jeffmartin/development/Geek-SEO` (GeekSeoBackend) unless noted. GeekAPI = `/Users/jeffmartin/development/GeekBackend/GeekAPI`.

---

## 1 & 2 — Replace gap fabrication with real heading-based detection *(category A)*

**Delete both fabrication sites:**
- LIVE: `Services/SiteAnalyzerStepRunners/SiteAnalysisStepExecutionService.cs:1125-1159` (the `if (childSlugs.Count < 3)` generic-template block).
- DEAD dup: `Services/SiteAnalyzerService.cs:501-524` `BuildSubtopics` (remove the whole unreferenced method).

**Replace with real detection:**
- Extract headings (text + level) from **every crawled page**, inline inside `RunSiteCrawlAsync` — raw HTML is only available there, between `sitePageCrawler.CrawlAsync` (`SiteAnalysisStepExecutionService.cs:305`) and `PersistSiteStructureAsync`/`ToSiteStructureWrite` (`SiteAnalysisStepRelationalLoader.cs:350-363`, which strips to VisibleText). Reuse `PageContentExtractor`'s heading parse but keep `(Level, Text)` intact (extract to a shared helper rather than a third copy).
- Persist real `PageUrl` per row into the existing `SiteAnalysisProfileHeading` entity (`GeekSeo.Persistence/Entities/SiteAnalysisEntities.cs:142` — already has PageUrl/HeadingLevel/HeadingText/DisplayOrder; no schema change). Today `RunHeadingsAsync` only writes homepage headings — feed it per-crawled-page input.
- Gap = a heading whose slug matches no crawled/sitemap URL. Add this to `SiteAnalysisContentCoverageMatcher`, reusing its `UrlPathContainsSlug`/`FindSubtopicUrl` helpers. A pillar with zero unmatched headings shows **zero** gaps — never invented filler.
- **Prerequisite dependency:** item #12 below (Playwright degrade) must be fixed too — the H1-blind HTTP/regex fallback would poison heading data this depends on.

## 3 & 4 — ContentPlanService dead-code delete *(category A, GeekAPI)*

`GeekAPI/Services/ContentWriterV3/ContentPlanService.cs` — zero callers, no DI registration, frontend never references it. **Delete the file** (covers `:38` "basic structure", `:104` "Placeholder insight from evidence", plus the two sibling stubs in it: `ContentIntelligenceValidator.ValidateContent` always-valid `:133`, `PerformanceAnalysisService.GenerateWeeklyReport` empty `:182`). Confirm no `using`/reference breaks after removal.

## 7, 10 — SERP provider auto-switch *(category C)*

- Delete `Providers/Seo/FallbackSerpProvider.cs`.
- In `Extensions/SeoProviderRegistration.cs`: remove the `FallbackSerpProvider` registration (`:77-81`), the `:109` switch arm, and the `SERP_PROVIDER_FALLBACK` env handling (`:20,67,82-86,190,201-207`). Unset-env path already resolves a single provider cleanly (`:110`). `ISerpProvider` consumers then receive the primary's failure `Result` directly instead of a masked swap.
- Remove `serpProviderFallback` from `Controllers/HealthController.cs:72`.

## 8 — FallbackAIProvider dead-code delete *(category C)*

`Providers/Seo/FallbackAIProvider.cs` — not registered anywhere (`IAIProvider` → `OpenAIProvider` at `SeoBackendExtensions.cs:68`). **Delete the file.** No DI/consumer change.

## 9 — Geocode auto-fallthrough *(category C)*

`Services/LocalServiceArea/CompositeGeocodeService.cs:12-25` silently calls Nominatim when Google fails/absent. Rebind `IGeocodeService` → `GoogleGeocodeService` directly in `SeoBackendExtensions.cs:156-158` (drop Composite + Nominatim from the geocode path). Google failure then surfaces to `IGeocodeService` consumers (`LocalSerpContextResolver.cs:12`, `PillarDemandEnricher.cs:17`) instead of silently switching. Delete `NominatimGeocodeService.cs` and `CompositeGeocodeService.cs` if now unreferenced.

## 11 — SERP strict→relaxed auto-retry *(category C)*

`Services/SiteExtraction/PillarDemandEnricher.cs:386-395` — delete the block that re-queries with `PlacesOnly=false` and replaces a genuinely-empty strict result. The empty "no local matches" result then stands and flows into the existing `localEmpty` path (`:402-409`). Leave the transient rate-limit retry `FetchSerpWithRetryAsync:541` (same provider/query — not a switch).

## 12 — Playwright→HTTP silent degrade *(category D)*

`PageContentExtractor.cs:16-33`, `HomepageHeadingsExtractor.cs:16-33`, `SchemaOrgExtractor.cs:19-35` each silently fall to an H1-blind HTTP/regex path when the browser handle is null or throws. Playwright is the real production primary (installed in `Dockerfile:36`/`Dockerfile.geekseo:41`). Make the null-browser / launch-failure path **fail loud** rather than silently degrade: if the Playwright browser is unavailable at extraction time, surface an error (the analysis fails closed) instead of running the degraded regex path. Confirm `PlaywrightBrowserHolder` startup launch failure also surfaces rather than leaving `Browser` null. (This protects the #1/#2 heading data.)

## 13 — Monolithic-save fallback: delete now, defer the real fix *(category E)*

`Services/SiteAnalysisPersistenceService.cs:133,153` `FallbackMonolithicSaveAsync` — **delete the fallback now.** It's not a transaction bug: persistence is 3 independent HTTP PATCHes via `HttpSiteAnalysisProfileRepository`; the fallback only fires on 404/route-unavailable. Removing it surfaces the failure. **Deferred separate task (log it, don't build here):** a real all-or-nothing persist requires a new server-side transactional/batch endpoint on the persistence gateway — track as its own scoped follow-up (raise its priority if mid-sequence partial-save on a real network failure between PATCH 2 and 3 becomes a concern).

## 14 — Artifact-blob fallback: eliminate *(category E)*

`Services/SiteAnalyzerStepRunners/SiteAnalysisStepRelationalLoader.cs` sites `:65` (schema), `:97` (sitemap — already throws on empty, leave as the model), `:154` (headings Title/MetaDescription), `:395` (schema builder). Remove the `TryGetArtifact(...) ... ?? []`/`?? fallback?.X` reads so the loader relies on relational rows only; if relational rows are genuinely absent that's a real persist failure to surface (mirror the `:109` throw pattern already present at `:97`).
- **Known accepted consequence:** `Title`/`MetaDescription` live **only** in the artifact (no relational column — verified), so after this they become null on every re-loaded profile. All consumers are null-tolerant (verified: `SiteAnalysisRootEntityBuilder.cs:18`, `SiteBusinessProfileBuilder.cs:20`, `SiteAnalysisStepLogBuilder.cs:87` all `?`-guarded; MetaDescription has no real reader) — no NRE, brand/root extraction degrades to H1/schema. User accepts this loss. **Optional deferred follow-up:** add relational `Title`/`MetaDescription` columns if they're wanted preserved.

## 15 — Dead catch→null delete *(category F)*

`Services/SiteAnalyzerService.cs:619` `LoadPriorSitemapUrlsWithFallbackAsync` + inner `LoadPriorSitemapUrlsAsync:635` — zero callers, result never consumed. **Delete both.**

## 16 — Genuine swallowed exceptions only *(category F)*

Make these **throw/surface** (they currently swallow real exceptions):
- `Services/SiteExtraction/SitemapExtractor.cs:32` (top-level `catch` → `SitemapData([],0,[])`), `:67` (robots.txt `catch {}`), `:103` (`TryFetchSitemapAsync catch { return []; }`).
- `Services/SiteExtraction/SchemaOrgExtractor.cs:101-104` (top-level `catch (Exception)` → `Empty()`).

**Leave as-is (legitimate "nothing found", not swallows):** `GscQueryExtractor.cs:151`, `SchemaOrgExtractor.cs:170` (parse guard), `NavMenuExtractor.cs:108`, `SiteTopicalMapSeedResolver.cs:17`.
- **Separate verification note (not part of #16):** `NavMenuExtractor.cs:108`'s empty is only trustworthy if Step 1 (sitemap) + crawl have completed first — a pipeline-stage-gating question to verify separately, does not change this classification.

## 17 — Keep *(naming only)*

`NavMenuExtractor.cs:51` labels the source `"fallback"` when links<2 but the pillars are really extracted. No behavior change; optionally rename the label for clarity.

## 18 — Export content data via git (copy Content Writer v2's existing implementation)

Operators need generated content exported as files (`.html` for articles/blog/tool/social/email; `.txt` for image-prompt content and inline per-section image prompts), zipped and/or committed to the geekatyourspot git repo so they can `git pull` the output. **This already exists, fully implemented, in Content Writer v2 — copy it, don't rewrite.**

**Source to copy (`/Users/jeffmartin/development/content-writer-v2`):**
- `backend/src/ContentWriter.Api/Controllers/ExportController.cs` — `GET /api/projects/{projectId}/export/html` (zip) and `POST .../export/html/commit` (commit to geekatyourspot via `IGeekatyourspotCommitService`).
- `backend/src/ContentWriter.Application/Services/Export/HtmlExportService.cs` — the generator: `.html` per document via `SectionHtmlRenderer` (~`:127`), `.txt` for image-prompt content (~`:85`) and `CollectImagePrompts` per-section `image-prompts/sections/{slug}-{sectionIndex}.txt`.
- `ExportedHtmlDocument.cs` — the `(FileName, Content)` record shared by both formats.
- The `IGeekatyourspotCommitService` implementation (the git-commit side — this is the "export via git pull" mechanism).

**Where it goes:** GeekAPI (`/Users/jeffmartin/development/GeekBackend/GeekAPI`) — CWV2's backend was merged here per the `ContentWriterV2.commit` pin ("Phase 1 of retiring the standalone service").

**First step = verify, then copy only what's missing:** the GeekContentCreator frontend already calls this — `src/lib/content-writer/api.ts:423` `downloadHtmlExport()` (zip) and `:459` `commitHtmlExportToGitHub()`, wired to `ReviewPublishPanel.tsx`'s "Export .html files" button. So the frontend + endpoint path already exist. **Confirm the GeekAPI backend behind `/export/html` actually implements the full `HtmlExportService` — specifically the `.txt` branch for image-prompt content and the git-commit service — and copy over whatever was dropped/simplified during the CWV2→GeekAPI merge.** Do not assume it's intact (flagged unverified in earlier research); if the `.txt` branch or the commit service is missing, port them verbatim from CWV2.

## Out of scope (product decisions, not fallback bugs)
- #5 `AnalyticsController.cs:36` empty analytics, #6 `NotificationService.cs` SendGrid/Slack/GA4/WordPress stubs — honest not-implemented stubs; left for a separate product decision.

---

## Verification

- Site Analyzer: a pillar with real unmatched headings yields gaps carrying real `HeadingText`/`HeadingLevel`; a pillar with none yields zero gaps; the 5 template strings never appear. Add/adjust `GeekSeoBackend.Tests` accordingly and keep the 191 existing tests green.
- Providers (7/8/9/10/11): with primary/only provider configured, a forced primary failure returns a surfaced error `Result`, no silent swap; unset fallback env still boots and resolves a single provider.
- #12: with the browser handle forced null, extraction fails loud (no H1-blind regex output).
- #13/#15/#3/#4/#8: deleted code compiles clean, no dangling references.
- #14: relational-only load works on a normally-persisted profile; a profile with genuinely-absent rows surfaces an error rather than serving artifact data.
- #16: the four swallow sites now propagate a thrown error on real failure; the four legitimate-empty sites still return empty on genuine no-data.
- #18: from a project with generated content, the `/export/html` endpoint returns a zip containing real `.html` documents, and image-prompt content produces `.txt` files (not `.html`); the commit path writes files to the geekatyourspot repo so an operator `git pull` retrieves them. Verify against CWV2's output shape.
- `dotnet build` + test run in Geek-SEO; GeekAPI builds after ContentPlanService removal.
- Not live-verified against a real domain unless an OAuth session is supplied (same standing caveat as prior work).

## Deferred follow-up tasks (logged, not built here)
1. Server-side transactional/batch persist endpoint (real fix behind #13).
2. Optional relational `Title`/`MetaDescription` columns (preserve fields dropped by #14).
3. Pipeline-stage gating verification for `NavMenuExtractor` empty (#16 note).
