# Fix live Analyze failure: duplicate-key crash on pillar re-insert

**Status:** Planned, not implemented. **Date:** 2026-08-04.

## Context

Running Analyze at `geek-content-creator.vercel.app/app/site-analyzer` fails with "Site analysis failed" (empty browser console). Confirmed still live via Railway logs (2026-08-04 12:58–13:01 UTC): `RunCoverageAsync` (`Geek-SEO/GeekSeoBackend/Services/SiteAnalyzerStepRunners/SiteAnalysisStepExecutionService.cs:764`) throws because the `POST .../pillars` call fails — same profile `2688c73a-283e-4bde-843c-48db2f219d1f` the user keeps re-analyzing. The exact DB error (read from GeekRepository logs earlier this session): `Npgsql.PostgresException 23505: duplicate key value violates unique constraint "PK_niche_pillars"`.

(Unrelated and already done: the redundant Railway `geek-content-creator` UI service was deleted — the Railway project now has zero services; Vercel is the sole UI host.)

## Root cause (confirmed against current code)

`GeekBackend/GeekRepository/Repositories/Seo/SiteAnalysisProfileRepository.cs:1031` `BulkInsertPillarsAsync` **always inserts, never deletes prior rows** (`AddRange` + `SaveChangesAsync`). `RunCoverageAsync` deliberately **reuses each pillar's existing `Id`** (`existing?.Id ?? Guid.NewGuid()`), so **any re-Analyze of a profile that already has pillars collides on the primary key** and crashes. First-time analyses work; re-runs fail — exactly the repro.

**Key simplification (verified this session):** only pillars is actually reachable.
- **Live callers**: `SiteAnalysisStepExecutionService.cs:762,766` and `SiteAnalysisStepRerunService.cs:458,459` — both call **only** `BulkInsertPillarsAsync` then `BulkInsertSubtopicsAsync`, in that order.
- `BulkInsertEntitiesAsync` (1105) and `BulkInsertPillarPagesAsync` (1117) have **zero callers anywhere** (dead code) — not implicated, not fixed here.
- `BulkInsertSubtopicsAsync` (1043) needs **no delete of its own**: `SiteAnalysisSubtopic → SiteAnalysisPillar` is `OnDelete(Cascade)` (`GeekSeo.Persistence/Data/SeoDbContext.Extensions.cs:~344`). Deleting a profile's old pillars cascades away their old subtopics. Because every live caller inserts pillars *before* subtopics, once pillars delete-then-reinsert, the old subtopics are already gone and the fresh subtopic insert (even with reused Ids) can't collide.

So the entire fix is **one method**.

## Correct pattern already exists in the same file

`BulkInsertCompetitorsAsync` (1055-1073): derive `profileId` from `list[0].SiteAnalysisProfileId`, `ExecuteDeleteAsync` scoped to it, then `AddRange`+`SaveChangesAsync`. `SiteAnalysisPillar` carries `SiteAnalysisProfileId`, so the same derivation works — **no signature change**, no ripple through the interface / `HttpSiteAnalysisProfileRepository` / GeekAPI internal controller.

## Fix

Rewrite `BulkInsertPillarsAsync` (line 1031) to delete-then-insert wrapped in an explicit transaction (so the cascade-delete of old pillars + the re-insert are atomic — a mid-op failure must not leave the profile with pillars wiped and nothing reinserted):

```csharp
public async Task<Result> BulkInsertPillarsAsync(
    IEnumerable<SiteAnalysisPillar> pillars, CancellationToken ct = default)
{
    var list = pillars.ToList();
    if (list.Count == 0) return Result.Success();      // matches BulkInsertCompetitorsAsync

    var profileId = list[0].SiteAnalysisProfileId;
    await using var tx = await db.Database.BeginTransactionAsync(ct);   // pattern already used at line 848
    // Re-Analyze reuses pillar Ids; clear the profile's prior pillars first (cascades old
    // subtopics + pillar-pages) so the re-insert can't collide on PK_niche_pillars.
    await db.SiteAnalysisPillars
        .Where(p => p.SiteAnalysisProfileId == profileId)
        .ExecuteDeleteAsync(ct);
    foreach (var p in list)
        if (p.Id == Guid.Empty) p.Id = Guid.NewGuid();
    db.SiteAnalysisPillars.AddRange(list);
    await db.SaveChangesAsync(ct);
    await tx.CommitAsync(ct);
    return Result.Success();
}
```

- Add a one-line comment on `BulkInsertSubtopicsAsync` noting it intentionally relies on the pillar cascade + pillars-first ordering (so a future reader doesn't "fix" it independently or reorder the calls).
- **Do not** touch `BulkInsertEntitiesAsync` / `BulkInsertPillarPagesAsync` — dead code; note for a separate cleanup decision.

## Secondary (note, not core): "empty/null browser console" on failure

The frontend shows "Site analysis failed" with no detail because the error message isn't surfacing. Likely disappears once Analyze succeeds. If it persists after the fix, trace the GCC failure→message chain (`GccController` analysis-status path → `content_creator.gcc_site_analyses.ErrorMessage`) for a path that records a failure with a null/blank message. Small follow-up, not part of this crash fix.

## Verification

- `dotnet build` GeekRepository/GeekBackend clean.
- Re-run Analyze **twice** on the same profile (repro: `2688c73a…` / `geekatyourspot.com`) via `geek-content-creator.vercel.app`: both succeed, no `PK_niche_pillars` duplicate-key; each run leaves exactly one generation of pillar/subtopic rows (no accumulation).
- Confirm via GeekSeoBackend/GeekRepository Railway logs that `RunCoverageAsync` no longer throws and the `pillars` POST returns success.
- Existing GeekBackend tests still pass.
- Push to the GeekBackend repo `main`; GeekRepository auto-redeploys on Railway (it did for `7ef3c61` earlier this session). Confirm the deploy is green before re-testing.

## Out of scope
- Renaming the `PK_niche_pillars` / `niche_pillars` constraint/table (separate, riskier Niche→SiteAnalysis migration; already tracked as known naming drift).
- The dead `BulkInsertEntitiesAsync` / `BulkInsertPillarPagesAsync` methods (later cleanup; not required to fix the crash).
- The deferred transactional-batch-endpoint item from `docs/FALLBACK_ELIMINATION_PLAN.md` #13 (different code path in GeekSeoBackend's `SiteAnalysisPersistenceService`).
