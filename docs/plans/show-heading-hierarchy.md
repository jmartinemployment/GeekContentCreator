# Show site heading hierarchy on Site Analyzer completion

## Architecture

- `SiteAnalysisStoredPayload` (includes `Gaps` and `SitePages`) is serialized and stored in `analysis.GapsJson` when analysis completes
- `GccGenerateService.ParseAnalysisPayload()` deserializes the full payload from storage
- Both "ready" paths can extract pages from the stored payload without reloading the SEO backend snapshot

## Backend Changes

**File:** `GeekBackend/GeekAPI/Controllers/ContentCreator/GccController.cs`

**Path 1 (cached ready, lines 1087–1109):**
Replace line 1090:
```csharp
var readyGaps = GccGenerateService.DeserializeGaps(analysis.GapsJson);
```
With:
```csharp
var payload = GccGenerateService.ParseAnalysisPayload(analysis.GapsJson);
var readyGaps = payload.Gaps;
var pages = payload.SitePages.Select(sp => new
{
    url = sp.Url,
    title = sp.Title,
    headings = sp.Headings.Select(h => new { level = h.Level, text = h.Text }).ToArray()
}).ToList();
```

Add `pages` to return statement (lines 1101–1109):
```csharp
return Ok(new
{
    analysis.Id,
    analysis.Domain,
    analysis.Status,
    lastAnalyzedAtUtc = analysis.UpdatedAtUtc,
    gaps = readyGaps,
    findings = persistedFindings,
    pages  // ADD THIS
});
```

**Path 2 (fresh completion, lines 1161–1199):**
After line 1177 (payload construction), add:
```csharp
var pages = snapshot.SitePages.Select(sp => new
{
    url = sp.Url,
    title = sp.Title,
    headings = sp.Headings.Select(h => new { level = h.Level, text = h.Text }).ToArray()
}).ToList();
```

Add `pages` to return statement (lines 1191–1199):
```csharp
return Ok(new
{
    analysis.Id,
    analysis.Domain,
    analysis.Status,
    lastAnalyzedAtUtc = analysis.UpdatedAtUtc,
    gaps,
    findings,
    pages  // ADD THIS
});
```

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

2. Add state (near line 47): `const [sitePages, setSitePages] = useState<any[]>([]);`

3. In `pollUntilDone` (line 109–110), after `setGaps`, add:
   ```typescript
   setSitePages(body.pages ?? []);
   ```

4. In JSX (before gaps list, around line 328), render:
   ```typescript
   <SiteHeadingHierarchy pages={sitePages} />
   ```

## Verification

- Backend: `dotnet build` clean
- Frontend: `npx tsc --noEmit` clean
- Live: Analyze → after "ready" → "Site structure" collapsible appears above gaps with all pages and h1–h6 hierarchies
