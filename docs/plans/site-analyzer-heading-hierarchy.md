# Show site heading hierarchy on Site Analyzer completion

## Context

The heading hierarchy should be visible immediately after Site Analyzer finishes
analyzing a domain — before the user picks a gap. This gives them a high-level
view of the site structure (h1–h6 trees per page) right away, grounding the gap
selection that follows.

Current state:
- Backend (`GeekAPI/GccController.GetSiteAnalysis`) loads the full
  `SiteModelSnapshot` with page heading trees during analysis, but the "ready"
  response (lines 1101-1109, 1191-1199) discards this data and only returns
  `{ Id, Domain, Status, gaps, findings }`.
- Frontend `SiteAnalysis` type (`src/lib/types.ts:114-133`) has no field for
  headings/pages, so even if backend sent them, there's nowhere to put them.
- Heading data only appears per-gap via the separate `section-context` endpoint
  (which *does* return `RelatedPageDto[]` with headings), not in the main
  analysis result.

Requirement: expose site-wide heading hierarchy (all crawled/sitemap pages, all
their h1–h6 trees) in the main site-analysis-status response so the frontend can
render it right after "ready" status, before gap selection.

## Changes

### Backend (`GeekBackend/GeekAPI`)

**File:** `Controllers/ContentCreator/GccController.cs`

1. Find `GetSiteAnalysis(Guid id, ...)` (line 1081).
2. In the "ready" response blocks (lines 1101-1109 and 1191-1199), after loading
   `modelResult` and `snapshot` (which contains `snapshot.SitePages`), add a new
   field to the returned object:
   ```csharp
   pages = snapshot.SitePages?.Select(sp => new {
     url = sp.Url,
     title = sp.Title,
     headings = sp.Headings?.Select(h => new { level = h.Level, text = h.HeadingText }) ?? new List<object>()
   }).ToList() ?? new List<object>()
   ```
   (Use the actual `SitePageDto` or `RelatedPageDto` shape already defined in the
   codebase; search `GccJobsAndSeo.cs` for `RelatedPageDto` which already carries
   headings and should be the canonical DTO.)
3. No changes to `section-context` endpoint needed — it already works.

### Frontend (`GeekContentCreator`)

**File:** `src/lib/types.ts`

1. Update `SiteAnalysis` type (lines 114-133) to add a `pages?` field:
   ```typescript
   pages?: RelatedPage[];
   ```

**File:** `src/app/app/site-analyzer/site-analyzer-client.tsx`

1. Import `SiteContextBanner` from `@/components/SiteContextBanner`.
2. In `pollUntilDone` (line 109), when status is "ready", also capture the
   pages: `const pages = body.pages ?? [];` (or set it in state as needed).
3. In the gaps-list JSX (after line 328, before the gaps loop), render the
   site-wide heading hierarchy using `SiteContextBanner`:
   ```typescript
   {pages.length > 0 && (
     <SiteContextBanner siteSection={{ 
       siteAnalysisId: analysisId, 
       gapTopic: null, 
       gapSectionPath: null, 
       relatedPages: pages, 
       topicalNeighbors: [], 
       informationGain: null 
     }} />
   )}
   ```
   (Adapt to match the actual `SiteSectionContext` shape; if `SiteContextBanner`
   doesn't accept `null` for optional fields, tweak accordingly.)

## Verification

- Backend: `dotnet build` clean in GeekBackend.
- Frontend: `npx tsc --noEmit` clean in GeekContentCreator.
- Live: Site Analyzer → Analyze a domain → after "ready" status, the heading
  hierarchy for all crawled pages (H1–H6 per page) appears in a banner above the
  gaps list, so the user sees the site structure before picking a gap.
