# Why Part A's fixes didn't work — investigation + real root-cause fixes

## Context

Four Site Analyzer bugs (step counter 1/9→1/8, heading duplication, 404 ingested as a page,
gaps flagging every heading as "missing page") were reported fixed by a prior session, committed,
and — this session — actually deployed (all three Railway services confirmed `SUCCESS`, post-fix
timestamps). The bugs still reproduce **identically**. This document explains, per bug, why the
deployed code does not fix it: **in every case the prior "fix" targeted an adjacent code path or
the wrong signal, not the mechanism that actually produces the bug.** Deployment was never the
blocker — the fixes are ineffective, not un-deployed.

All findings below were read directly from the currently-deployed source.

---

## Current status

**Implemented (Geek-SEO, additive filters — no deletions):**
- Finding 1 — soft-404 detection in `SitePageCrawler.FetchWithPlaywrightAsync` + new `IsSoft404`
  helper.
- Finding 2 — per-page heading dedup in `PageSectionTreeBuilder.Build` + new `IsDuplicateHeading`
  helper.

**Must revert before building:** an investigation misstep added `Gaps`/`Pages` properties
referencing non-existent `ContentGap`/`SitePageSummary` types to
`GeekSeo.Application/Models/Seo/SiteAnalysisModels.cs` (`SiteAnalysisProfileResult`). That type
is returned by `SiteAnalyzerController.GetProfile`, which is **not** on the frontend's status-poll
path — the edit doesn't compile and isn't needed. Revert it.

**Corrected data-flow for Finding 4** (the frontend does not call `GetProfile` directly):
`site-analyzer-client.tsx` → Next.js `/api/site-analyzer/[id]` → GeekAPI
`GccController.GetSiteAnalysis` (`GccController.cs:1135-1268`) →
`GccJobsAndSeo.LoadSiteModelByProfileAsync` (`GccJobsAndSeo.cs:135-204`) →
`GetContentGapsAsync` (`GccJobsAndSeo.cs:265-279`) → Geek-SEO
`GET api/seo/site-analyzer/{id}/content-gaps` (`CollectAllHeadingGaps`). **Findings 1 & 2 are
correctly on this path** — no rework. `LoadSiteModelByProfileAsync` (`:188-195`) wraps every raw
gap in a `LiveGap` with a `"No page found for heading …"` reason and `SuggestPillar` hardcoded
`false`, so **100% of gaps returned today are missing-page gaps** and the pipeline has **no
invented-topic source** to gate off.

**Finding 4 fix is therefore frontend-only:** hide the "Start create" button in
`site-analyzer-client.tsx` (`:423-434`) behind a single named constant
(e.g. `SHOW_GAP_GENERATE_BUTTON = false`) with a comment explaining why — one line to flip if a
non-missing-page gap type ever appears. No new discriminator field on `ContentGap`/`LiveGap`.

## Finding 1 — 404 ingested as a real page (fix checked the wrong signal)

**Screenshot:** `H1: 404 — missing page`, `H2: This page could not be found.`

**Deployed "fix":** `SitePageCrawler.FetchWithPlaywrightAsync` captures `response` and returns
`null` for non-2xx (`SitePageCrawler.cs:209`, `!response.Ok`).

**Why it can't work:** the target is a **SPA** — the crawler's own class doc says so
(`SitePageCrawler.cs:11`: "SPA shells return the same HTML for every client-side route"). A
nonexistent client-side route returns **HTTP 200** with the app shell, then renders a "404 / This
page could not be found" component *client-side*. `response.Ok` is `true`, so the page is ingested
and its `<h1>404</h1>` is extracted. HTTP-status checking structurally cannot detect a **soft
404**.

**Real fix:** content-based soft-404 detection after render, before `pages.Add` — treat a page as
not-found when its rendered `<title>`/`<h1>` is "404" / "page not found" / "not found", or it
carries `<meta name="robots" content="noindex">` on an error route. Skip those. (Code point:
`SitePageCrawler.cs:81-84`, the `pages.Add` after fetch.)

## Finding 2 — Duplicate headings within one page (fix was a different code path)

**Screenshot:** under the single homepage block, `Schedule a Free Consultation` ×3, the whole
`The Methodology` H2+H3 subtree ×2, `Clone Yourself Work 24/7` ×2, etc.

**Deployed "fix":** URL-normalization dedup (`Trim()` vs `Trim().TrimEnd('/')`) for
`RelatedPageDto`. That is the **content-brief grounding** path in GeekAPI
(`GccGenerateService`), a completely separate feature from the Site Structure heading tree.

**Why it can't work:** the duplication shown is *within one page's* heading list.
`PageSectionTreeBuilder.Build` (`PageSectionTreeBuilder.cs:15-57`) extracts **every** `<h1>`–`<h6>`
in the captured DOM with **no dedup**. SPA DOMs routinely contain the same section twice — mobile +
desktop variants both mounted, SSR + hydrated copies, slider/animation clones — so the tree
faithfully contains 3× "Schedule a Free Consultation" because the DOM has 3 of them. A
URL-normalization fix on a different feature cannot touch this.

**Real fix:** dedup within the per-page section tree — collapse identical sibling heading subtrees
(same level + same normalized `HeadingText`) during `Build`/seal, scoped per page. (Code point:
`PageSectionTreeBuilder.cs:56` seal, or `FlattenSectionsToHeadings` in
`SiteAnalysisStepRelationalLoader.cs`.)

## Finding 3 — Garbled heading "…Efficiency E Efficiency E" (never addressed)

**Screenshot:** `H1: Redefine Your Business Efficiency E Efficiency E`.

**Root cause:** `FetchWithPlaywrightAsync` waits only `WaitForTimeoutAsync(400)` after
`DOMContentLoaded` (`SitePageCrawler.cs:204-215`), then snapshots. The homepage H1 is a
typewriter/animation effect; the 400 ms snapshot catches a mid-animation DOM where partial /
duplicated text nodes coexist. Tag-stripping then concatenates them.

**Real fix:** wait for the page to settle before `ContentAsync()` — `WaitUntilState.NetworkIdle`
plus a longer settle, or wait for animation/text stability. Lower confidence; needs tuning against
the live site.

## Finding 4 — Every heading flagged "missing page" (the core design mismatch — not touched)

**Screenshot:** nearly every heading annotated "— missing page".

**The rule (deployed, working as written):** `SiteAnalyzerController.GetContentGaps`
(`SiteAnalyzerController.cs:415-434`) → `SiteContentCoverageMatcher.CollectAllHeadingGaps` +
`HasNoMatchingPage` (`SiteAnalysisContentCoverageMatcher.cs:315-321, 391-414`). The controller's
own doc states it plainly (`:410-413`): *"a real crawled heading exists somewhere on the site and
no discovered/sitemap URL's slug matches it. No topic scoring, no pillar selection, no minimum
length gate. This is the entire rule."*

**Why it flags everything:** the site's content lives on one long homepage. A section like
"Schedule a Free Consultation" has no `/schedule-a-free-consultation` URL, so it fails the test —
as does every other section heading. The rule conflates **"this heading has no dedicated URL"**
with **"missing page,"** which is only meaningful on a multi-page site. It also sweeps in
CTA/utility/error headings ("Contact", "Schedule a Free Consultation", and — via Finding 1 — "404")
that are not content topics at all.

**Why Part A didn't fix it:** the prior "stale gap topics" work was a **data purge migration** plus
switching pillar *suggestion* from LLM to mechanical heading-matching. It changed where suggestions
come from; it never changed this rule that flags every uncovered heading. This is the same
"unwanted topics vs. missing pages" complaint raised originally — still unaddressed.

**Decision (given):** the gap list must contain **only real headings that have no page — no
made-up topics** — and the **"generate content" button on missing items is hidden**. So the
mechanical rule stays as-is (it is already purely mechanical — `CollectAllHeadingGaps` invents
nothing); the list is wrong today only because its *inputs* are polluted. Fixing Findings 1 & 2
(drop soft-404 pages, dedup headings) is therefore the substance of the gap fix — it removes the
"404", the CTA/error noise from that page, and the ×2/×3 repeats. No rule redefinition, no new
"should this be a page" heuristic (that would be a made-up judgment the decision forbids).

Plus a UI change: **hide the generate-content action on missing items.** In
`site-analyzer-client.tsx`, each gap row's "Review gap" expansion currently exposes `startCreate`
(the button at `:423-434` that calls `doCreate` → `createGccCreate`). Hide that generate trigger
(and the expansion that leads only to it) so missing items are informational only — no button
offering to generate content for a heading-without-a-page. This is consistent with the rest of the
session's direction (the Workflow/generate flow is being taken offline while rebuilt).

**No invented-topic path exists to gate off.** Tracing the live data-flow (see **Current status**
above) confirms `CollectAllHeadingGaps` is the sole gap source and it invents nothing — every gap
is a real heading with no matching URL, wrapped by `LoadSiteModelByProfileAsync` with
`SuggestPillar` hardcoded `false`. So the "hide made-up-topics code" instruction has no live
target; the only change here is hiding the generate button (above). The `suggestPillar`/`reason`
fields the UI reads at `site-analyzer-client.tsx:358-361` are display-only and stay in place.

## Finding 5 — Step counter flips 1/9 → 1/8 (fix removed a fallback, not the cause)

**Deployed "fix":** the status endpoint stopped applying a `> 0 ? … : Ordered.Count (9)` fallback;
it now reads `AnalysisTotalSteps` directly (`SiteAnalyzerController.cs:150`).

**Why it can't work:** the flip is data-driven, not fallback-driven. Every current writer uses
`ThroughCoverage.Count` (8) — but at create/enqueue the profile row's total is a stale/leftover
value (9 from a prior run, or a default) until the **worker's claim** overwrites it with 8 on first
processing (`SiteAnalysisJobWorker.cs:98`). The poll window between enqueue and worker-claim shows
the stale 9, then it flips to 8. Removing the controller fallback doesn't close that window.

**Real fix:** write `analysis_total_steps = ThroughCoverage.Count` (8) at profile create/enqueue,
so the very first poll already reads 8. (Need to locate the create/enqueue path — it does not
appear among the `totalSteps` writers, so it currently leaves the column stale/defaulted.)

---

## Proposed fix order

1. **Finding 1 (soft-404 detection)** — highest leverage; also removes the 404 headings from gaps.
2. **Finding 2 (per-page heading dedup)** — removes the duplicate headings from Site Structure and
   from gaps.
3. **Finding 4 UI (hide generate button)** — frontend-only; gate the "Start create" button behind
   `SHOW_GAP_GENERATE_BUTTON = false`, don't delete. The gap list itself becomes correct once
   Findings 1 & 2 clean its inputs — no rule change, and no made-up-topics path to gate (none
   exists; see **Current status**).
4. **Finding 5 (enqueue sets total=8)** — small, isolated.
5. **Finding 3 (render settle)** — tune against the live site; lowest confidence.

## Verification

- Re-run Site Analyzer on the same domain after each fix (not batched):
  - Site Structure shows **no** "404 / This page could not be found" page.
  - Each heading appears **once** per page (no ×2/×3 repeats, no repeated subtrees).
  - The H1 renders as clean final text (no "Efficiency E Efficiency E").
  - Step indicator shows **8** from the first poll — never 9.
  - Gap list = real headings without pages only (no invented topics); with 404 + duplicates gone
    it is materially shorter and contains no "404"/duplicate entries.
  - Missing items show **no** generate-content button — the gap rows are informational; the
    `startCreate` action at `site-analyzer-client.tsx:423-434` is hidden.
- Confirm no deletions: the soft-404 and dedup fixes are additive filters; the hidden
  generate-button stays in the source behind `SHOW_GAP_GENERATE_BUTTON`, not removed.
- Confirm the erroneous `Gaps`/`Pages` addition to `SiteAnalysisModels.cs` has been reverted (see
  **Current status**) — otherwise `dotnet build` in `Geek-SEO` fails on the missing types.
- `dotnet build` clean in `Geek-SEO`; `npx tsc --noEmit` clean in `GeekContentCreator`; existing
  `SiteContentTreeGapTests` / `SiteExtractionTests` still pass (and get new cases for soft-404 skip
  + heading dedup).
