# Handoff — Site Analyzer step 1: sitemap generate

**Date:** 2026-08-03 (implemented 2026-08-03)  
**Status:** Code complete across all three repos (Geek-SEO, GeekAPI, GeekContentCreator); unit-tested (191/191 in Geek-SEO); all three build/compile clean. **Not yet verified end-to-end against a live domain. Not committed or pushed** — all changes sit staged/unstaged for review.  
**Cursor transcript id:** `d6acda3d-499c-4cf5-aacc-ec517009899b`  
**Canonical plan:** [plans/sitemap-generator-step1.plan.md](./plans/sitemap-generator-step1.plan.md)  
**Cursor plan mirror:** [`.cursor/plans/sitemap-generator-step1-d6acda3d.plan.md`](../.cursor/plans/sitemap-generator-step1-d6acda3d.plan.md)  
**UI plan copy:** `/Users/jeffmartin/.cursor/plans/Sitemap generator step1-d6acda3d.plan.md`

---

## What you are picking up

Geek Content Creator **Site Analyzer** Analyze fails when there is no usable URL inventory (`Required artifact 'site_urls' for step 'site_urls' is not available`). The fix is **not** empty soft-success. Make **sitemap generation the first ThroughCoverage step** on every Analyze: crawl → persist inventory + auto-update `sitemap.xml` artifact → Download on Site Analyzer UI → unlimited inventory-complete `site_crawl`.

**Primary implementation repo:** `/Users/jeffmartin/development/Geek-SEO`  
**UI / BFF (Download):** `/Users/jeffmartin/development/GeekContentCreator` (+ GeekAPI proxy if needed)  
**Fail-closed rule:** never demo/fallback soft-success that masks failures.

---

## Do not invent (ghost symbols)

Reviews sometimes use `EnsureSiteMapAsync`, `SiteMapReady`, `sitemapEntities`, “doc 41/42”. **Those are not in Geek-SEO.** Map concerns to real names (Option 1 only):

| Ghost term | Real Geek-SEO |
|------------|---------------|
| Sitemap readiness / SiteMapReady | Step 1 complete + persisted discovered URLs |
| `sitemapEntities` | `geek_seo.site_analysis_profile_discovered_urls` |
| Doc 41 check-then-progress | `RunThroughCoverageAsync` + per-step status |
| Empty XML shell as “done” | Soft paths / content-string readiness — **vetoed** |

Reject Option 2 (keep ghost plan) and Option 3 (second pipeline).

---

## Locked product rules (must not regress)

1. **Step 1 always regenerates** on Analyze — no 7-day freshness reuse.  
2. **Unlimited discovery + unlimited site crawl** — remove `MaxSiteCrawlPages=20`, `DefaultAttemptBudget=30`, `SampleUrls Take(20)`, `MaxUrls=5000`, `MaxChildSitemaps=3`.  
3. **Crawl success = full inventory fetched** — not `PagesFetched >= 1`. Incomplete → **throw**.  
4. **Competitor crawl uncapped** (`MaxPagesPerCompetitor=50` removed) on analyze-competitors path only.  
5. **Strip truncates:** `MaxListItems=30`, persist 512k/32k, pillar/topic Takes, `MinPillars=3`, `DefaultMaxSeeds=7`.  
6. **HTTP timeout = Playwright (15s).**  
7. **Utility pages are excluded from topics** (`NoisePaths` on pillar selection). **Crawl still fetches** them (hard-junk skip only).  
8. **Sitemap delivery:** auto-update artifact **and** Download button. No FTP/root upload. No GSC. No dedicated Sitemap page.  
9. **Composition = Delegated** — ThroughCoverage advances after step success; this work owns step-1 / `site_crawl` completeness predicates.  
10. **Raise = throw** — empty inventory / incomplete crawl halts pipeline.  
11. **Idempotency:** inspect UNIQUE on `site_analysis_profile_discovered_urls` **first**; migrate only if missing. EF already has unique `(SiteAnalysisProfileId, Url, SourceType)` + `ReplaceDiscoveredUrlsAsync`. Generator uses `SourceType = generated`.  
12. **Ship atomically** — one PR / one deploy unit (GeekSeoBackend; GeekAPI/GCC in same train if Download needs them).

---

## Completeness predicates

**Step 1 complete only if:**
- `discoveredUrls.Count > 0`
- every row `SourceType` ∈ `{ sitemap, generated }` (no placeholders)
- every URL same-origin to analyzed domain
- XML artifact rewritten from that inventory (not empty shell)

**`site_crawl` complete only if:** every step-1 inventory URL successfully fetched.

Log/assert at mark-complete: `inventoryUrls: N` with N > 0.

---

## Caps checklist (delete in code)

| Cap | Where |
|-----|--------|
| `MaxSiteCrawlPages = 20` | `SiteAnalysisStepExecutionService` |
| `DefaultAttemptBudget = 30` | `SitePageCrawler` |
| `SampleUrls` `Take(20)` | `SitemapExtractor` |
| `MaxUrls = 5_000`, `MaxChildSitemaps = 3` | `SitemapExtractor` |
| `MaxPagesPerCompetitor = 50` | `CompetitorPageFetcher` / competitor analyze |
| Full `NoisePaths` as crawl skip | `SitePageCrawler.ShouldSkipUrl` → hard-junk only |
| `MaxListItems = 30` | `PageContentExtractor` (+ Playwright `>= 30`) |
| Persist `512_000` / `32_768` | `SiteAnalysisStepRelationalLoader` |
| Pillar/topic `Take`s, `MinPillars`, `DefaultMaxSeeds` | selector / merger / seed resolver / step execution |
| HTTP timeout 8s | `SitePageCrawler` → 15s |

Also **remove** any local `LoadSitemapAsync` soft-success `return new SitemapData([], 0, [])` (vetoed).

---

## Implementation order (suggested)

1. Inspect live/schema UNIQUE on discovered URLs → migrate only if absent.  
2. Revert empty soft-success; loader reads `sitemap` / `generated` inventory.  
3. `SitemapGenerator` (uncapped BFS, hard-junk filter) + XML builder; persist inventory + artifact.  
4. Wire as ThroughCoverage step 1 (always regenerate); throw if zero URLs.  
5. Unlimited + inventory-complete `site_crawl`; crawl URL filter ≠ `NoisePaths`.  
6. Strip truncates + HTTP 15s; competitor uncapped.  
7. Download API + Site Analyzer Download UI.  
8. Tests: empty cannot complete; advancement-moment assert; re-Analyze idempotency; stuck-profile recovery.  
9. Single deploy GeekSeoBackend (+ GeekAPI/GCC if needed); re-run Analyze on failing domain.

---

## Key files (Geek-SEO)

| Area | Path |
|------|------|
| Step runner | `GeekSeoBackend/Services/SiteAnalyzerStepRunners/SiteAnalysisStepExecutionService.cs` |
| Loader | `GeekSeoBackend/Services/SiteAnalyzerStepRunners/SiteAnalysisStepRelationalLoader.cs` |
| Crawler | `GeekSeoBackend/Services/SiteExtraction/SitePageCrawler.cs` |
| Sitemap extract | `GeekSeoBackend/Services/SiteExtraction/SitemapExtractor.cs` |
| Noise / topics | `GeekSeoBackend/Services/SiteExtraction/NoisePaths.cs` |
| ThroughCoverage | `GeekSeoBackend/Services/SiteAnalyzerService.cs` / `SiteAnalyzerStepCatalog.cs` |
| Discovered URLs entity | `GeekSeo.Persistence` → `site_analysis_profile_discovered_urls` |
| New | `GeekSeoBackend/Services/SiteExtraction/SitemapGenerator.cs` (to add) |

---

## Verification

- Empty inventory → step 1 does **not** complete; clear error (not opaque artifact message).  
- Success path logs/asserts `inventoryUrls: N` (N > 0, SourceType ok).  
- Crawl incomplete vs inventory → fail.  
- Re-Analyze: Replace, no unique violations.  
- Stuck profile recovers on next Analyze without manual DB cleanup.  
- Utility URLs in inventory; not pillars.  
- Download works; no root upload.

---

## Out of scope

- Dedicated Sitemap page in Content Creator  
- Google Search Console submit  
- FTP / write into customer hosting root  
- Inventing `EnsureSiteMapAsync` / `SiteMapReady` / parallel entity tables  

---

## Related docs (updated with this work)

| Doc | Role |
|-----|------|
| [plans/sitemap-generator-step1.plan.md](./plans/sitemap-generator-step1.plan.md) | Locked decisions + todos (project-canonical) |
| [CONTENT_CREATOR_PLAN.md](../CONTENT_CREATOR_PLAN.md) | Product Site Analyzer section + sitemap step-1 pointer |
| [architecture.md](../architecture.md) | Geek-SEO Site Analyzer capability notes |
| [README.md](../README.md) | Operator Site Analyzer / Analyze notes |
| Geek-SEO [README.md](file:///Users/jeffmartin/development/Geek-SEO/README.md) | ThroughCoverage / crawl inventory notes |
| Plan file (above) | Full locked decisions + todos |

---

## Next agent first message

> Implement `docs/plans/sitemap-generator-step1.plan.md` per this handoff. Fail closed. Option 1 naming only. Inspect UNIQUE before any migration. Ship GeekSeoBackend atomically; re-run Analyze on the failing domain.

---

## Implementation notes (2026-08-03)

**What was built, per repo:**

- **Geek-SEO** — New `SitemapGenerator.cs` (unlimited same-origin BFS crawl + public sitemap merge, throws on zero URLs, builds `urlset` XML) and `HardJunkPaths.cs` (crawl-skip filter, separate from topic-only `NoisePaths`). `SiteAnalysisStepExecutionService` wires it as step 1 with the completeness predicates from this doc (count>0, SourceType ∈ {sitemap, generated}, same-origin, XML rewritten), logs `inventoryUrls: N`, throws otherwise; `site_crawl` is unlimited and throws listing any unfetched inventory URL. `SiteAnalysisStepRelationalLoader` no longer returns the vetoed empty `SitemapData`. All caps in the checklist above were removed (`MaxSiteCrawlPages`, `DefaultAttemptBudget`, `SampleUrls Take(20)`, `MaxUrls`/`MaxChildSitemaps`, `MaxPagesPerCompetitor`, `MaxListItems`, 512k/32k persist truncation, `MinPillars`/`DefaultMaxSeeds`); HTTP timeout raised 8s→15s. New endpoint `GET /api/seo/site-analyzer/{profileId}/sitemap.xml` rebuilds the XML fresh from persisted inventory on every request (see deviation below). 191/191 tests pass (new + fixed).
- **GeekAPI** (`GeekBackend/GeekAPI`, confirmed as the actual proxy — not a separate repo) — `HttpGeekSeoSiteAnalyzerClient.GetSitemapXmlAsync` + `GET api/geek-content-creator/site-analyzer/{id}/sitemap` in `GccController.cs`, forwarding to Geek-SEO.
- **GeekContentCreator** — proxy route `src/app/api/site-analyzer/[id]/sitemap/route.ts`; "Download sitemap" button next to the existing Site Analyzer status line in `site-analyzer-client.tsx`. No dedicated Sitemap page. `tsc`/`eslint` clean.

**Migration decision:** none needed. `site_analysis_profile_discovered_urls` already had `UNIQUE (SiteAnalysisProfileId, Url, SourceType)` (migration `20260613210130_AddSiteAnalysisProfilePhase1RelationalStepTables.cs`), and `ReplaceDiscoveredUrlsAsync` already does delete-then-insert — re-Analyze is idempotent without a schema change.

**Deviations / open flags — not silent, need review before this is called "done":**

1. **Sitemap XML is not persisted as a blob** — it's rebuilt on demand from the `sitemap`/`generated` inventory rows on every GET (both at step-1 mark-complete time and on download), to avoid a migration in a third repo (`GeekRepository`, which hosts the actual EF/Postgres persistence) whose current build health couldn't be verified — it references a `NicheProfileDiscoveredUrlWrite` type that doesn't appear to exist anywhere in `GeekSeo.Persistence`. This looks like a pre-existing issue unrelated to this work, but was not fixed or root-caused.
2. **Download button has no "artifact ready" gate** — it shows whenever an analysis ID exists; clicking before step 1 completes will 404 inline rather than being hidden, since the current GCC poll payload has no such readiness flag.
3. **Dead code left in place, not rewired:** `SiteAnalyzerService.RunAnalysisAsync` (legacy path) and `SiteAnalysisStepRerunService`'s `RerunSiteUrlsAsync`/`RerunSchemaAsync`/etc. still call the old thin `SitemapExtractor.ExtractAsync` directly. Only `ExecuteStepAsync → stepExecution.RunAsync` — the actually-running path — uses the new generator.
4. **Crawl-completeness check** compares inventory URLs to fetched-page URLs by exact string match; trailing-slash/homepage-formatting edge cases are unverified against a live site.
5. **Not yet done at all:** an end-to-end Analyze run against a real domain (including the originally-failing one), the stuck-profile-recovery scenario, and a browser check of the Download button's full round trip. Unit tests pass; the actual bug this handoff exists to fix has not been reproduced-then-confirmed-fixed live.

Nothing in any of the three repos has been committed or pushed.
