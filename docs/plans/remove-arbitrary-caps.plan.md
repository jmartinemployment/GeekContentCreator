# Remove arbitrary caps on real Content Creator / Site Analyzer data

## Context

While implementing heading-depth work (Phase B of `restore-workflow-and-deepen-headings.plan.md`),
`RelatedPageDto.Headings` was found silently truncated to 8 items via a borrowed constant
(`GccResearchCaps.MaxHeadingsPerPage`) that was never designed for that use case. A fuller
audit across the same codebase surfaced four categories; the user asked to eliminate items
1, 2, and 4 outright, and to fold in the "3b" sub-findings (count-caps mis-bucketed as
"legitimate" that are actually the same problem as item 1). This plan covers all of that.

**Status: partially applied already (before this was converted into a proper reviewable plan).**
Three edits already landed in `GeekBackend`:
- `GccGenerateService.cs` `TryBuildSectionContext`: removed `.Take(12)` on related pages.
- `GccSavedSerpParser.cs` `BuildPartialInformationGain`: removed `.Take(12)` on the
  related-pages loop and `.Take(4)` on a page's headings within it.
- `GccJobsAndSeo.cs` `LoadSiteModelByProfileAsync`: removed `.Take(24)` on topical
  neighbors.

These three match exactly what's below (item 1) — nothing beyond the agreed scope was
changed. The rest of this plan is what's still pending, held for review — the user wants
to test the already-applied Phase A/B changes first before continuing with this one.

## Remaining work

**1. `MaxParagraphsPerPage` (reclassified from "legitimate" to "same as item 1")**
- `GccArticleHtmlExtractor.cs`: remove the `if (paragraphs.Count >= GccResearchCaps.MaxParagraphsPerPage) break;` early-stop (line ~52) — keep every real paragraph extracted from an uploaded research page.
- `GccGenerateService.cs` (`BuildBriefAndResearchBlock`, quoteables loop): remove `.Take(GccResearchCaps.MaxParagraphsPerPage)` on `q.Paragraphs` (~line 218).
- Leave `MaxParagraphChars` (per-string length truncation) alone — different kind of guard, not a count cap.

**2. Dead `GccResearchCaps` constants (item 2)**
- Delete `MaxQuoteables`, `MaxOrganicTitleChars`, `MaxPaaChars` from `GccResearchModels.cs` — confirmed zero references anywhere in the codebase.

**3. `GccSerpIndex` prompt-render caps (3b)**
- `GccGenerateService.cs` (`BuildBriefAndResearchBlock`): remove `.Take(12)` on `serp.OrganicTitles` and `.Take(15)` on `serp.PeopleAlsoAsk` (~lines 248, 253).
- Note: `GccSerpIndex` itself appears to have no live construction path anywhere in the codebase (`grep "new GccSerpIndex("` found nothing) — it may be entirely dead. Not fully confirmed (haven't checked JSON-deserialization-only paths or old persisted shapes). Removing the caps is safe either way; confirming whether the whole field is dead is a smaller follow-up, not blocking.

**4. Frontend display truncation (item 4)**
- `SerpIngestPanel.tsx`: remove `.slice(0, 5)` on both `thisSiteCovers` and `competitorOpens` (~lines 165, 175) — render full lists.

## Explicit tradeoff

Removing all of these means Generate's prompt size for a large site (many related pages,
many paragraphs per uploaded doc, many topical neighbors) is no longer bounded by these
round numbers. Per the "no reason to preserve and work around bad data" stance already
given, proceed without adding a replacement size guard unless directed otherwise.

## Files touched
- `GeekAPI/Services/ContentCreator/GccArticleHtmlExtractor.cs`
- `GeekAPI/Services/ContentCreator/GccGenerateService.cs`
- `GeekApplication/Models/ContentCreator/GccResearchModels.cs`
- `GeekContentCreator/src/components/content-writer/SerpIngestPanel.tsx`

(Already-applied edits, listed above for completeness, touched `GccGenerateService.cs`,
`GccSavedSerpParser.cs`, and `GccJobsAndSeo.cs`.)

## Verification
1. `dotnet build GEEKBACKEND.slnx` — clean build.
2. `dotnet test GeekBackend.Tests/GeekBackend.Tests.csproj` — all tests pass (36 previously; watch for any test asserting the old cap counts, e.g. paragraph/heading count limits, which would need updating to assert the real uncapped count instead).
3. `npx tsc --noEmit` in `GeekContentCreator` — clean.
