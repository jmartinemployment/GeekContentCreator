# Show site heading hierarchy on Site Analyzer completion

## Context

The heading hierarchy should be visible immediately after Site Analyzer finishes
analyzing a domain — before the user picks a gap. This gives them a high-level
view of the site structure (h1–h6 trees per page) right away, grounding the gap
selection that follows.

**Dependency verified:** Phase B (leveled h1-h6 headings) is already shipped.
`HeadingDto(int Level, string Text)` is defined in `GccResearchModels.cs:56`,
and `RelatedPageDto` (in `GccGenerateService.cs:19`) already carries
`HeadingDto[] Headings`. The data path exists: `snapshot.SitePages`
(`GccController.cs:1168`) contains the full heading trees during completion.

Current gap: both "ready" response paths (lines 1101-1109 and 1191-1199 in
`GccController.cs`) load `snapshot.SitePages` but discard it before returning to
the client — only `{ Id, Domain, Status, gaps, findings }` goes out.

## Changes

### Backend (`GeekBackend/GeekAPI`)

**File:** `Controllers/ContentCreator/GccController.cs`

Both paths need to return pages:

**Path 1 (cached "ready" at lines 1087–1109):**
- This path deserializes gaps from storage but also needs to deserialize pages.
- Modify line 1090 area to also deserialize pages from `analysis.PayloadJson`:
  ```csharp
  var readyGaps = GccGenerateService.DeserializeGaps(analysis.GapsJson);
  var readyPages = GccGenerateService.DeserializeSitePages(analysis.PayloadJson);  // ADD THIS
  ```
  (Check `GccGenerateService` for the deserialize method; if it doesn't exist,
  add a helper to extract `SitePages` from the serialized payload.)

- Modify the return statement (lines 1101–1109) to include pages:
  ```csharp
  return Ok(new
  {
      analysis.Id,
      analysis.Domain,
      analysis.Status,
      lastAnalyzedAtUtc = analysis.UpdatedAtUtc,
      gaps = readyGaps,
      findings = persistedFindings,
      pages = readyPages  // ADD THIS
  });
  ```

**Path 2 (fresh "ready" completion at lines 1161–1199):**
- This path loads the full `snapshot` (line 1168).
- After line 1177 (payload construction) and before the response, add:
  ```csharp
  var pages = snapshot.SitePages
      .Select(sp => new
      {
          url = sp.Url,
          title = sp.Title,
          headings = sp.Headings.Select(h => new { level = h.Level, text = h.Text }).ToArray()
      })
      .ToList();
  ```

- Modify the return statement (lines 1191–1199) to include pages:
  ```csharp
  return Ok(new
  {
      analysis.Id,
      analysis.Domain,
      analysis.Status,
      lastAnalyzedAtUtc = analysis.UpdatedAtUtc,
      gaps,
      findings,
      pages   // ADD THIS
  });
  ```

**Rationale:** Pages are persisted as part of the analysis payload (line 1177:
`SiteAnalysisStoredPayload` includes `SitePages`), so both paths can return them
without re-querying. Cached-ready deserializes from storage; fresh-ready
serializes fresh data before storing.

### Frontend (`GeekContentCreator`)

**File:** `src/lib/types.ts`

Update `SiteAnalysis` type (lines 114–133) to include pages:

```typescript
pages?: Array<{ url: string; title: string; headings: Array<{ level: number; text: string }> }>;
```

**File:** `src/components/SiteHeadingHierarchy.tsx` (NEW)

Create a new component for site-wide heading display (not reusing
`SiteContextBanner`, which was built for per-gap context with nulled fields).
This component renders site structure with a collapsible to avoid overwhelming
the gap list:

```typescript
export function SiteHeadingHierarchy({
  pages,
}: {
  pages?: Array<{ url: string; title: string; headings: Array<{ level: number; text: string }> }>;
}) {
  if (!pages || pages.length === 0) return null;
  const pagesWithHeadings = pages.filter((p) => p.headings.length > 0);
  if (pagesWithHeadings.length === 0) return null;

  return (
    <div className="rounded-md border border-[var(--gcc-teal)]/30 bg-[var(--gcc-teal)]/10 px-4 py-3 text-sm text-[var(--gcc-ink)]">
      <p className="font-semibold text-[var(--gcc-teal-deep)]">Site structure</p>
      <p className="mt-1 text-xs text-[var(--gcc-muted)]">
        {pages.length} page{pages.length === 1 ? "" : "s"} with heading hierarchy
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-[var(--gcc-teal-deep)]">
          Expand to view headings
        </summary>
        <ul className="mt-2 space-y-2 pl-2">
          {pagesWithHeadings.map((p) => (
            <li key={p.url} className="text-xs">
              <p className="font-medium text-[var(--gcc-ink)]">{p.title}</p>
              <ul className="mt-0.5">
                {p.headings.map((h, i) => (
                  <li
                    key={i}
                    className="text-[var(--gcc-muted)]"
                    style={{ paddingLeft: `${Math.max(0, h.level - 1) * 0.75}rem` }}
                  >
                    H{h.level}: {h.text}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
```

**File:** `src/app/app/site-analyzer/site-analyzer-client.tsx`

1. Import the new component:
   ```typescript
   import { SiteHeadingHierarchy } from "@/components/SiteHeadingHierarchy";
   ```

2. Add state hook (near line 47):
   ```typescript
   const [sitePages, setSitePages] = useState<any[]>([]);
   ```

3. In `pollUntilDone` (line 109-110), after setting gaps, also capture pages:
   ```typescript
   setGaps(body.gaps ?? []);
   setSitePages(body.pages ?? []);  // ADD THIS
   setStepLabel(null);
   ```

4. In the JSX (before the gaps list, around line 328), render the hierarchy:
   ```typescript
   <SiteHeadingHierarchy pages={sitePages} />
   ```

## Verification

- Backend: `dotnet build` clean in GeekBackend.
- Frontend: `npx tsc --noEmit` clean in GeekContentCreator.
- Live:
  1. Site Analyzer → enter domain → Analyze
  2. After "ready" status, a "Site structure" collapsible appears above the gaps list
  3. Expanding shows all crawled pages and their heading hierarchies (H1–H6)
  4. Gaps list and "Review gap" flow work unchanged
  5. Per-gap context (via `section-context` endpoint) still works as before
