## Goal
Produce **two reports** on the **Site Analyzer page (which is the home page)** from the **same crawl**:
1. **Report A — BEFORE ANY PROCESSING WHATSOEVER** — raw crawl exactly as returned by the crawler (Geek-SEO), before GeekAPI, before any filtering/dedup/normalization/manipulation, before database write. Proves the source.
2. **Report B — AFTER DATA HAS BEEN INSERTED INTO THE DATABASE** — same crawl re-fetched from the database after GeekAPI has persisted it (GeekRepository via GeekAPI), proving the DB write is lossless.

Both reports are **unfiltered, no de-duplication, no truncation**, same columns, same order, displayed together for direct comparison.

## Success Criteria
- Site Analyzer page shows two distinct reports when a crawl has run, labeled exactly:
  - `REPORT 1 — BEFORE ANY PROCESSING WHATSOEVER (raw crawl, before GeekAPI, before database)`
  - `REPORT 2 — AFTER DATA HAS BEEN INSERTED INTO THE DATABASE (re-fetched from database)`
- Both reports use identical schema: `# | URL | Title | Headings (raw, in original crawl order, H1–H6 with text)`, including rows with ` (no headings)` and duplicate URLs with distinct `#`.
- No `filter` on `headings.length`, no `Set`/`Map` dedup on URL, no `slice` truncation, no heading text normalization beyond exact crawler text.
- If crawl has not yet run, both reports are empty (no stale data). On new Analyze, both reset.
- `npm run build --webpack` passes, TypeScript passes, `src/lib/` stays pure (no fetch).

## Context And Current Facts
- **Current HEAD state** (after revert `b21ce78`, `git --no-optional-locks status` clean, `npm run build` 15/15):
  - `src/app/app/site-analyzer/site-analyzer-client.tsx:154 pollUntilDone` → `GET /api/site-analyzer/{id}` (`src/app/api/site-analyzer/[id]/route.ts:19` → `GeekAPI GccController.GetSiteAnalysis [1136]`). `processing` returns `{Id,Domain,Status,seoStatus,step}` with **no `pages`** (`GccController.cs:1245`); `ready` returns `{gaps, findings, pages}` where `pages = snapshot.SitePages.Select(url,title,headings)` after `UpdateSiteAnalysisAsync` + `SerializeAnalysisPayload` + `ReplaceSiteFindings` (`[1273-1292]`), with `Gaps.Count==0` fail-closed gate. So current UI only has AFTER data; BEFORE is unavailable from `GetSiteAnalysis` processing payload.
  - `src/app/api/site-analyzer/analyze/route.ts:5` proxies `POST /api/geek-content-creator/site-analyzer/analyze` → `GeekAPI AnalyzeSite [1038]` → `_seo analyze-and-run` (`GccJobsAndSeo.cs:102`), returns only `{id}`. No pages in analyze response.
  - `src/components/SiteHeadingHierarchy.tsx:1` currently does `pages.filter(p=>headings.length>0)` (hide 0-heading pages) and `key={p.url}` (URL dedup risk) — must be fixed to unfiltered for reports.
  - `architecture.md:2` + `AGENTS.md:2`: `src/lib/` pure, fetch in `src/services/`; GeekAPI owns persistence; Geek-SEO is raw crawl source (`GccJobsAndSeo.cs:265 GetPageContextsAsync → GET api/seo/site-analyzer/{profileId}/page-contexts → PageContextDto[]`).
- **Requirement per user (verbatim):** `Site Analyzer page is home page`; `BEFORE IS BEFORE ANY AND ALL PROCESSING`; `Before GEEKAPI`; `I COULD NOT BE CLEARER, PRODUCE TWO REPORTS, ONE BEFORE ANY PROCESSING WHAT SO EVER AND ONE AFTER DATA HAS BEEN INSERTED INTO THE DATABASE`.

## Constraints And Non-goals
- **Backend boundary:** `GeekAPI` persists to `GeekRepository`; raw crawl lives in `Geek-SEO`. Frontend must not call `Geek-SEO` directly — must go via `GeekAPI`.
- **`src/lib/` purity, no regex for HTML** (`docs/plans/remove-regex-*.md`).
- **Site Analyzer is home** — no separate `/` vs `/app/site-analyzer` split; reports live on Site Analyzer only.
- **Non-goals:** Not changing gap fail-closed gates for AFTER; not optimizing crawl budget; not adding `src/lib/` fetch.

## Key Decisions
| Decision | Recommended Choice | Why | Alternative Rejected |
|----------|-------------------|-----|---------------------|
| What is BEFORE | **Raw `PageContextDto[]` from Geek-SEO `GetPageContextsAsync(profileId)` before any `GccController` processing** — proxied verbatim via new `GeekAPI GET .../raw-crawl` (no `SerializeAnalysisPayload`, no `ReplaceSiteFindings`, no `Gaps.Count==0` gate, no `UpdateSiteAnalysisAsync`). | Satisfies “BEFORE ANY PROCESSING WHATSOEVER” and “Before GEEKAPI” — zero GeekAPI manipulation. | `processing` poll `body.pages` — rejected because `processing` carries no `pages` (falsified at `GccController:1245`), so BEFORE would always be empty. |
| What is AFTER | **Re-fetched from database after insert** — `GET /api/site-analyzer/{id}` `ready` → `pages` after `UpdateSiteAnalysisAsync` (as today) — after GeekAPI has inserted. | Satisfies “AFTER DATA HAS BEEN INSERTED INTO THE DATABASE”. | Separate `findings` table — rejected (findings are gap-derived, not raw crawl rows). |
| How to obtain BEFORE | **New GeekAPI `GET /api/geek-content-creator/site-analyzer/{id}/raw-crawl`** (authorize, `GetSiteAnalysisAsync(id)` → require `SeoProfileId` else `202 pending`, `GetBearerToken()` → `_seo.GetPageContextsAsync(profileId)` → `200 {id,domain,rawPages: PageContextDto[]}`), plus Next proxy `GET /api/site-analyzer/[id]/raw-crawl` forwarding `202/404` for poll retry. Frontend `pollRawCrawl()` in parallel with `pollUntilDone()`, on `200` with `rawPages.length>0` sets `reportBefore`. | Minimal backend change, no frontend direct-to-Geek-SEO, preserves auth, handles partial availability via polling. | Frontend direct to `Geek-SEO` — violates `architecture.md` boundary, breaks OAuth/CORS. |
| How to obtain AFTER | **Keep existing `GET /api/site-analyzer/{id}` ready `pages`** — no new code except fixing report rendering to unfiltered. | Already exists, already after DB. | Add new DB endpoint — unnecessary. |
| Where to render | **Site Analyzer only (home)** — two stacked reports: `REPORT 1 — BEFORE ANY PROCESSING WHATSOEVER` (amber) and `REPORT 2 — AFTER DATA HAS BEEN INSERTED INTO THE DATABASE` (teal), identical tables (`#|URL|Title|Headings`), `before-`/`after-` key prefixes with `::${idx}` to avoid URL dedup. | Per user, single location. | Home (`/`) separate — rejected (`Site Analyzer page is home`). |
| Dedup/filter | **Zero** — no `filter`, no `Set` on URL, exact crawl order, full `headings` array, ` (no headings)` rows, `H{h.level}: {h.text}` with `paddingLeft` by level. | Satisfies “unfiltered, without de-duplication of any kind, the raw crawl results”. | Any gate reintroduces hiding. |
| Component | **Duplicate table markup twice (no new shared component initially)** — keep `SiteHeadingHierarchy` fixed to unfiltered as supplement if desired, or remove filter; reports are self-contained. | Minimal abstraction, prior duplication is acceptable. | New `RawReportTable` component — deferred until duplication is a burden. |
| Persistence of BEFORE | **Session state `sitePagesBefore` (`useState` null → set on first `rawPages` non-empty), reset on new `analyze()`** — transient proof, not persisted to DB. | BEFORE is not canonical; DB is source of truth. | Persist BEFORE to DB — violates single-writer, creates parallel store. |

## Recommended Approach
Site Analyzer owns both reports. `analyze()` resets both; after `setAnalysisId(id)` fire `pollRawCrawl(id)` (BEFORE via `GET .../raw-crawl`) in parallel with `pollUntilDone(id)` (AFTER via `GET .../{id}` ready). Each poll sets its respective state (`reportBefore` from raw `PageContextDto[]` → `SiteAnalysis['pages']` shape, `reportAfter` from ready `pages`). UI renders two identical unfiltered tables (`REPORT 1 — BEFORE ANY PROCESSING WHATSOEVER` amber, `REPORT 2 — AFTER DATA HAS BEEN INSERTED INTO THE DATABASE` teal) stacked, with counts and `same crawl, same order` captions for direct comparison. No Home work; no `src/lib/` fetch.

## Work Plan
1. **GeekAPI raw endpoint — `GeekBackend/GeekAPI/Controllers/ContentCreator/GccController.cs` (~22 lines, insert before `SitemapXml` ~1294)**
   Add `RawCrawl` as specified in Key Decisions (authorize, `202 pending` if no `SeoProfileId`, `401` if no bearer, `502` if Geek-SEO fails, `200 {id,domain,rawPages}` verbatim). Owner: GeekBackend. Artifact prepared at `/tmp/GccController.cs.patched` + `/tmp/rawcrawl.patch` (2bb1cc4..602a759).

2. **Next proxy — `src/app/api/site-analyzer/[id]/raw-crawl/route.ts` (new, ~35 lines, copy of `[id]/route.ts`)**
   `GET` → `fetch(${apiConfig.baseUrl}/api/geek-content-creator/site-analyzer/{id}/raw-crawl, {Authorization: Bearer, cache:"no-store"})` → `NextResponse.json(body)` forwarding `202/404`. Owner: `src/app/api/`.

3. **Frontend BEFORE capture — `src/app/app/site-analyzer/site-analyzer-client.tsx:129,154,267`**
   Add `const [reportBefore, setReportBefore] = useState<SiteAnalysis['pages']|null>(null);` (alias `sitePagesBefore`), `const [reportAfter] = useState...` (existing `sitePages` becomes `reportAfter`). Add `pollRawCrawl(id, signal)` loop (`POLL_MS`, `MAX_WAIT_MS` same as `pollUntilDone`) handling `rawPages` or `pageContexts` shape mapping (`url/Url, title/Title, headings→{level,text}`). In `analyze()` reset both, after `setAnalysisId` do `pollRawCrawl(id).catch(()=>{})` parallel to `await pollUntilDone(id)`. `pollUntilDone` ready branch does `setReportAfter(pagesNow)`, no longer sets BEFORE. Owner: this file.

4. **Reports UI — `site-analyzer-client.tsx:417` + `SiteHeadingHierarchy.tsx:1`**
   Replace single raw block with two reports: each `REPORT 1 — BEFORE ANY PROCESSING WHATSOEVER` (amber) and `REPORT 2 — AFTER DATA HAS BEEN INSERTED INTO THE DATABASE` (teal) using identical table schema (`#|URL|Title|Headings (raw, in order)`), keys `before-{url}::{idx}` / `after-{url}::{idx}`, full `headings.map`, `(no headings)` rows. Show each when non-empty; if only AFTER available (backend not yet deployed), show AFTER with `BEFORE pending` empty state. Fix `SiteHeadingHierarchy` to remove `filter(p=>headings.length>0)` and use `key={`${url}::${pi}`` if kept as supplement (or hide it). Owner: same files.

5. **No Home work** — `src/app/page.tsx` unchanged (Site Analyzer is home).

6. **Build — `npm run build --webpack` (expects 16/16 pages, new `raw-crawl` route).**

## Validation Plan
- **Build:** `npm run build --webpack` (GeekContentCreator) + `dotnet build` (GeekBackend after patch).
- **Manual (OAuth session):** Site Analyzer → Analyze domain → Network: `GET .../raw-crawl` → `200 {rawPages}` populates `REPORT 1 — BEFORE ANY PROCESSING WHATSOEVER` first (amber, `rawPages.length` rows, duplicates + 0-heading visible); `GET .../{id}` → `ready` → `pages` populates `REPORT 2 — AFTER` (teal). Compare `JSON.stringify(rawPages.map(p=>p.url)) === JSON.stringify(pages.map(p=>p.url))` and `JSON.stringify(rawPages.map(p=>p.headings.map(h=>h.text)))` — expect equal (proves no loss). Counts in captions should match.
- **Edge:** No headings → both reports show `(no headings)`; duplicate URLs → both reports show duplicate rows with distinct `#`. Cancel → both states reset.
- **Until backend deployed:** `GET .../raw-crawl` returns `404/502`, `pollRawCrawl` retries until timeout, `REPORT 1` stays `pending/empty` with `202/404` not surfaced as error; `REPORT 2` populates on `ready` as today.

## Risks / Rollback
- **Geek-SEO `page-contexts` may only be available after `IsComplete`** — BEFORE will then be “right before GeekAPI gates/DB write” (still `BEFORE ANY AND ALL PROCESSING` as no `UpdateSiteAnalysisAsync` has run, but not mid-crawl). Mitigation: poll until available; label BEFORE as `raw as of <timestamp>`; follow-up to clarify `page-contexts` availability vs `IsComplete`. Rollback: remove `RawCrawl` + proxy, revert to single AFTER report.
- **Large crawls (500+ pages)** → two full tables double DOM. Mitigation: `overflow-x-auto` pageless. Rollback: virtualize.
- **Sandbox provenance** (`com.apple.provenance` on `GeekBackend/`) blocks auto-write from `GeekContentCreator` (`Operation not permitted`). Mitigation: patch pre-built at `/tmp/GccController.cs.patched` + `/tmp/rawcrawl.patch`; apply via `cp`/`git apply` from within `GeekBackend` repo with its own approval, or manual insert of 22 lines before `SitemapXml`. No DB migration.

## Open Questions
- Verified: `processing` carries no `pages` (`GccController:1245`), so separate `raw-crawl` is required — does `GetPageContextsAsync` return partial pages during crawl or only final list? Determines whether `REPORT 1` is mid-crawl vs final pre-DB snapshot (both satisfy `BEFORE ANY AND ALL PROCESSING` as no `UpdateSiteAnalysisAsync` has run).
