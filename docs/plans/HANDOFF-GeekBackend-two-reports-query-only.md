# Handoff to GeekBackend Agent — Two Reports: BEFORE ANY PROCESSING WHATSOEVER (Query) vs AFTER DB

**Date:** 2026-08-16
**Source:** `GeekContentCreator` (`/Users/jeffmartin/development/GeekContentCreator`)
**Target:** `GeekBackend` (`/Users/jeffmartin/development/GeekBackend` → `GeekAPI/Controllers/ContentCreator/GccController.cs`)
**Request:** Produce **two reports on Site Analyzer (home)** from the same crawl — `REPORT 1 — BEFORE ANY PROCESSING WHATSOEVER` (raw, before GeekAPI, before DB) and `REPORT 2 — AFTER DATA HAS BEEN INSERTED INTO THE DATABASE` (re-fetched after insert) — unfiltered, no dedup. This handoff is **query-only** (no DB write, no migration).

---

## 1. Frontend Already Done (GeekContentCreator — builds ✓ 16/16)

All frontend work is in `HEAD`+ working tree (reverted then re-implemented per `docs/plans/2026-08-16-two-reports-before-after-db.md` approved):

- `src/app/app/site-analyzer/site-analyzer-client.tsx`
  - `reportBefore` (`useState<NonNullable<SiteAnalysis['pages']>|null>`) = **BEFORE**; `reportAfter` (`useState<NonNullable<SiteAnalysis['pages']>>`) = **AFTER** (`:129`)
  - `pollReportBefore(id, signal)` (`:155`): `GET /api/site-analyzer/{id}/raw-crawl` → `body.rawPages` or `body.pageContexts` → maps to `pages[]` (`{url,title,headings:{level,text}[]}`) with **no** `filter`/`Set`/`slice`, exact crawl order, `202/404` retry until `MAX_WAIT_MS`
  - `pollUntilDone(id, signal)` (`:40`): `GET /api/site-analyzer/{id}` → `body.pages` only on `ready` → `setReportAfter`
  - `analyze()` (`:258`): resets both (`setReportBefore(null); setReportAfter([])`), then `pollReportBefore(id).catch(()=>{})` parallel to `await pollUntilDone(id)`
  - UI (`:456`): two stacked reports — `REPORT 1 — BEFORE ANY PROCESSING WHATSOEVER` (amber, `before-${url}::${idx}`) and `REPORT 2 — AFTER DATA HAS BEEN INSERTED INTO THE DATABASE` (teal, `after-`), tables `#|URL|Title|Headings (raw, in order)`, `(no headings)` rows, `H{level}: {text}` with `paddingLeft`, identical schema for comparison. `SiteHeadingHierarchy` fixed to unfiltered (`key `${url}::${pi}``, no `filter(p=>headings.length>0)`).

- `src/app/api/site-analyzer/[id]/raw-crawl/route.ts` (new, 1.5KB): proxies `GET ${apiConfig.baseUrl}/api/geek-content-creator/site-analyzer/{id}/raw-crawl` with `Authorization: Bearer`, `cache: no-store`, forwards `202/404` verbatim for poll retry.

- `docs/plans/2026-08-16-two-reports-before-after-db.md` (approved): full plan, Key Decisions, Work Plan, Validation.

**Build:** `npm run build --webpack` ✓ `Compiled 860ms`, `16/16` pages now includes `GET /api/site-analyzer/[id]/raw-crawl`. Until backend query is deployed, `REPORT 1` stays `pending/empty` (poll handles `202/404` gracefully), `REPORT 2` populates on `ready` as today.

---

## 2. Backend Change — Query Only (no DB write)

**File:** `GeekBackend/GeekAPI/Controllers/ContentCreator/GccController.cs`

**Why a query is needed:** `GccController.GetSiteAnalysis [1136]` during `processing` returns `{Id,Domain,Status,seoStatus,step}` with **no `pages`** (`[1245-1255]`), so `REPORT 1 — BEFORE ANY PROCESSING WHATSOEVER` cannot be sourced from it. `pages` only appear after `LoadSiteModelByProfileAsync` → `snapshot.SitePages` → `UpdateSiteAnalysisAsync` (AFTER). The new query exposes the **same `PageContextDto[]` source** (`GccJobsAndSeo.cs:265 GetPageContextsAsync → GET api/seo/site-analyzer/{profileId}/page-contexts`) **before** any `SerializeAnalysisPayload`/`Gaps.Count==0` gate/DB write.

**What the query does (read-only, no INSERT/UPDATE):**
- `GET /api/geek-content-creator/site-analyzer/{id}/raw-crawl`
- `GetSiteAnalysisAsync(id)` → `404` if not found
- if `SeoProfileId` absent → `202 {status:"pending", reason:"SEO profile not yet assigned — crawl not started"}` (frontend keeps polling)
- `GetBearerToken()` → `401` if no bearer
- `_seo.GetPageContextsAsync(profileId, bearer)` → `502` if fail, else `200 {id, domain, rawPages: PageContextDto[]}` verbatim

**Code to insert (22 lines, before `SitemapXml` — the `/// Downloads the generated sitemap.xml` block ~1294):**

```csharp
    /// <summary>
    /// BEFORE ANY PROCESSING WHATSOEVER — raw Geek-SEO crawl, before any GeekAPI processing, filtering, or DB write.
    /// Proxies Geek-SEO GetPageContextsAsync verbatim (no SerializeAnalysisPayload, no Gaps.Count==0 gate).
    /// Frontend uses this as REPORT 1 — BEFORE; GetSiteAnalysis ready pages is REPORT 2 — AFTER.
    /// </summary>
    [HttpGet("site-analyzer/{id:guid}/raw-crawl")]
    public async Task<IActionResult> RawCrawl(Guid id, CancellationToken ct)
    {
        var analysis = await _repo.GetSiteAnalysisAsync(id, ct);
        if (analysis is null) return NotFound();
        if (analysis.SeoProfileId is not Guid profileId)
            return StatusCode(202, new { status = "pending", reason = "SEO profile not yet assigned — crawl not started" });
        var bearer = GetBearerToken();
        if (string.IsNullOrWhiteSpace(bearer))
            return Unauthorized(new { error = "Bearer token required to load raw crawl" });
        var result = await _seo.GetPageContextsAsync(profileId, bearer, ct);
        if (!result.Ok || result.Value is null)
            return StatusCode(result.StatusCode is >= 400 and < 600 ? result.StatusCode : 502, new { error = result.Error ?? "Failed to load raw crawl from SEO service" });
        var rawPages = result.Value;
        return Ok(new { id = analysis.Id, domain = analysis.Domain, rawPages });
    }
```

**How to apply (sandbox blocks auto-write from GeekContentCreator — `Operation not permitted` on `com.apple.provenance`):**

- **Pre-built artifacts from GeekContentCreator agent:** `/tmp/GccController.cs.patched` (full file, `RawCrawl` at 1299) + `/tmp/rawcrawl.patch` (35 lines, `2bb1cc4..602a759`)
- **Apply:**
  ```bash
  cd /Users/jeffmartin/development/GeekBackend
  cp /tmp/GccController.cs.patched GeekAPI/Controllers/ContentCreator/GccController.cs
  # or: git apply /tmp/rawcrawl.patch
  dotnet build
  # deploy GeekAPI (Railway)
  ```
- Frontend needs no redeploy — next `Analyze` will populate both reports (previously `REPORT 1` was `202/404` pending).

**Validation after deploy:**
- `GET .../raw-crawl` → `200 {rawPages}` populates `REPORT 1` (amber) before `ready`; `GET .../{id}` `ready` → `pages` populates `REPORT 2` (teal)
- Compare `JSON.stringify(rawPages.map(p=>p.url)) === JSON.stringify(pages.map(p=>p.url))` and `rawPages.length === pages.length` — expect equal (no loss)
- Both reports show duplicates with distinct `#` and ` (no headings)` rows — no filtering/dedup

---

## 3. Open Question for Backend Owner

Does `GetPageContextsAsync` return partial pages during crawl (`IsComplete==false`) or only final list after `IsComplete`? If only final, `REPORT 1` will be “right before gates/DB write” (still `BEFORE ANY PROCESSING` as no `UpdateSiteAnalysisAsync` has run, but not mid-crawl). Clarify via Geek-SEO `page-contexts` behavior; no code change needed either way.

---

**Frontend owner:** `GeekContentCreator` — `docs/plans/2026-08-16-two-reports-before-after-db.md`
**Contact:** Apply query, `dotnet build`, signal to re-verify Analyze flow with two reports.

