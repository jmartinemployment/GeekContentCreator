# Site Analyzer hangs on "step 5 of 8"

## Context

Running Site Analyzer stalls on **step 5 of 8** and never finishes. The browser console is empty —
the frontend is only polling status and repeatedly reads the same step, so there is no client
error. The stall is entirely server-side, in the crawl.

### What "step 5 of 8" actually is

Progress is pushed **after** each step completes, not when it starts
(`SiteAnalyzerService.RunThroughCoverageAsync`, `SiteAnalyzerService.cs:180-190`: the loop calls
`PushProgress(stepNumber)` only once `stepExecution.RunAsync` returns). The `ThroughCoverage`
catalog (`SiteAnalyzerStepCatalog.cs:10-20`) is:

```
1 schema  2 site_urls  3 nav  4 headings  5 page_content  6 site_crawl  7 internal_links  8 url_patterns
```

So while **step 6 `site_crawl` is running**, the last pushed progress is still **5** (`page_content`).
"Hangs on step 5 of 8" = **`site_crawl` is running and never completing.**

### Root cause

**The settle wait was changed from a working 400ms to 1000ms, and that hung the app.**

In commit `4564782` ("Finding 3"), `FetchWithPlaywrightAsync` raised
`WaitForTimeoutAsync(400)` → `WaitForTimeoutAsync(1000)` (`SitePageCrawler.cs:214`). The commit
message claimed this fixed "garbled heading text from mid-animation snapshot." **That was not a
user-reported problem** — no garbled headings were observed or filed; the longer sleep was an
unverified speculative change in the same commit as real fixes (soft-404, heading dedup, step
counter).

With a **fully serial, unbounded BFS** in `CrawlAsync` (`SitePageCrawler.cs:34-115`), the extra
**600ms × every page** pushes total crawl time past the worker's **15-minute `JobTimeout`**
(`SiteAnalysisJobWorker.cs:17`; `CancelAfter` at `:107`). The job is cancelled → progress never
advances past 5 → UI hangs, then "Analysis timed out."

The known-good value is **400ms**. Revert to that. Do not keep 1000ms, do not delete the sleep,
do not invent a replacement "settle" strategy for an unobserved heading bug.

### Compounding defect (same commit)

`IsSoft404` (`SitePageCrawler.cs:250-268`) returns `null` for any page with a `noindex` robots meta
or a "404"/"not found" title/heading, so that page is **not added** to `pages`. `RunSiteCrawlAsync`
(`SiteAnalysisStepExecutionService.cs:276-284`) then **throws "Site crawl incomplete"** if any
inventory URL is missing from the fetched set. A single legitimate `noindex` inventory page fails
the whole analysis. This is a hard failure rather than the reported hang, but lives in the same code
path and should be fixed alongside it.

## Changes

### 1. Revert settle wait to 400ms (direct regression fix) — `FetchWithPlaywrightAsync`

In `FetchWithPlaywrightAsync` (`SitePageCrawler.cs:214`): change
`await page.WaitForTimeoutAsync(1000);` back to **`await page.WaitForTimeoutAsync(400);`**.

- Keep `GotoAsync` with `WaitUntil = DOMContentLoaded` and `Timeout = 15_000` unchanged.
- No other settle logic.

### 2. Parallelize the crawl (defense in depth) — `SitePageCrawler.CrawlAsync`

Replace the serial `while (queue.Count > 0)` loop with **wave-based BFS** and bounded concurrency
so large sites stay under `JobTimeout` even with the 400ms settle:

- Cap concurrency at **6** via `SemaphoreSlim` over pages in the same `IBrowserContext`, draining
  the frontier in waves via `Task.WhenAll`.
- After each wave, enqueue links discovered from fetched HTML for the next wave, guarded by the
  existing `seen` / `queue` dedup.
- Keep `ct.ThrowIfCancellationRequested()` per unit of work.
- No page-cap change: still unlimited inventory + BFS; only fetch scheduling changes.

### 3. Make the completeness check tolerant of dead / noindex inventory URLs

`RunSiteCrawlAsync` (`SiteAnalysisStepExecutionService.cs:262-330`): a URL that is genuinely
unreachable, soft-404, or `noindex` is **"no page here,"** not a crawl failure. Instead of throwing
on any missing inventory URL:

- **Exclude** missing inventory URLs and log them.
- Let the analysis complete with the fetched set.
- Hard-fail only if inventory was non-empty and **zero** inventory URLs were fetched (total crawl
  breakdown).
- Adjust the success summary to report fetched vs excluded counts.

## Out of scope

- UI still showing "5 of 8" while `site_crawl` runs (misleading labeling; not the hang).
- Changing `GotoAsync` `WaitUntil` (stays `DOMContentLoaded`).
- Keeping 1000ms, removing the settle sleep, or adding a heading-stability poll for an unobserved
  "garbled heading" issue.
- Re-solving speculative mid-animation heading quality via a longer sleep (that unprompted change
  caused this hang).

## Files

- `Geek-SEO/GeekSeoBackend/Services/SiteExtraction/SitePageCrawler.cs` — revert settle to
  `WaitForTimeoutAsync(400)`; parallelize `CrawlAsync`; leave `GotoAsync` / `IsSoft404` / dedup
  as-is otherwise.
- `Geek-SEO/GeekSeoBackend/Services/SiteAnalyzerStepRunners/SiteAnalysisStepExecutionService.cs` —
  `RunSiteCrawlAsync`: exclude-and-log missing inventory URLs instead of throw-on-any-missing.
- `Geek-SEO/GeekSeoBackend.Tests` — adjust/add crawl completeness coverage.

## Implementation todos

1. Revert `WaitForTimeoutAsync(1000)` → `WaitForTimeoutAsync(400)` in `FetchWithPlaywrightAsync`.
2. Wave-based BFS + `SemaphoreSlim(6)` in `SitePageCrawler.CrawlAsync`.
3. `RunSiteCrawlAsync`: exclude/log missing inventory URLs; fail only if zero inventory fetched.
4. Add/adjust Geek-SEO tests; `dotnet build` + re-run analyzer on a previously hanging domain.

## Verification

- Re-run Site Analyzer on the domain that hung. It must progress **past step 5** through
  `site_crawl` (6), `internal_links` (7), `url_patterns` (8) to **complete** well within the
  15-minute `JobTimeout`.
- Confirm the worker log `Site crawl finished for {Origin}: {Fetched}/{Attempted} page(s)` appears
  with the expected fetched count and no "Site crawl incomplete" throw for a site whose only missing
  URLs are noindex/soft-404.
- Confirm gap output is unchanged in kind (real crawled headings with no page).
- `dotnet build` clean in `Geek-SEO`. Existing crawl/coverage tests pass; add a test asserting a
  missing/noindex inventory URL is excluded (not thrown) and the crawl still reports complete.
