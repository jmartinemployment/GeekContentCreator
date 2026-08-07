# Show site heading hierarchy on Site Analyzer completion

## Requirement

After Site Analyzer completes analyzing a domain, display the site's full heading hierarchy (h1–h6 trees per page) before gap selection.

## Backend Changes

**File:** `GeekBackend/GeekAPI/Controllers/ContentCreator/GccController.cs` (lines 1161–1199, fresh-completion path only)

After line 1177 (payload construction), add:
```csharp
var pages = snapshot.SitePages
    .Select(sp => new
    {
        url = sp.Url,
        title = sp.Title,
        headings = (sp.Headings ?? Enumerable.Empty<HeadingDto>())
            .Select(h => new { level = h.Level, text = h.Text })
            .ToArray()
    })
    .ToList();
```

Modify return statement (lines 1191–1199) to include pages:
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

**Notes:**
- Pages are only returned in the fresh-completion path (status transition to "ready"), not on every poll of a processing or failed analysis.
- Null-safety: `sp.Headings ?? Enumerable.Empty<HeadingDto>()` handles pages with no extracted headings.

## Frontend Changes

**File:** `src/lib/types.ts`

Add to `SiteAnalysis` type (lines 114–133):
```typescript
pages?: Array<{ url: string; title: string; headings: Array<{ level: number; text: string }> }>;
```

**File:** `src/components/SiteHeadingHierarchy.tsx` (NEW)

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

1. Import: `import { SiteHeadingHierarchy } from "@/components/SiteHeadingHierarchy";`

2. Add state (near line 47), properly typed:
   ```typescript
   const [sitePages, setSitePages] = useState<SiteAnalysis['pages']>([]);
   ```

3. In `pollUntilDone` (line 109–110), after `setGaps`:
   ```typescript
   setSitePages(body.pages ?? []);
   ```

4. In JSX (before gaps list, around line 328):
   ```typescript
   <SiteHeadingHierarchy pages={sitePages} />
   ```

## Verification

- Backend: `dotnet build` clean (confirm HeadingDto is in scope for the null-coalescing syntax)
- Frontend: `npx tsc --noEmit` clean
- Live:
  1. Analyze domain → after "ready" status
  2. "Site structure" collapsible appears above gaps list
  3. Expand to see all pages and h1–h6 hierarchies
  4. While processing (before ready), pages array should be empty/absent on responses
  5. Confirm gaps list and "Review gap" flow unaffected

## Open Question (not a blocker)

GetSiteAnalysis caches snapshot data on cached-ready polls (only deserializes gaps, not full snapshot). Verify the caching mechanism (TTL, invalidation logic) doesn't risk stale heading data. This plan returns fresh pages only on completion, but worth confirming the broader snapshot cache is sound.
