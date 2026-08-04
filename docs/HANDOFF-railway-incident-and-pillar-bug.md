# Handoff — Railway hosting incident + live pillar-insert bug

**Date:** 2026-08-04 (last updated end of session, ~99% budget)
**Status:** Item 1 (Railway hosting) — **FULLY DONE** (code, docs, and the Railway service itself deleted). Item 2 (pillar-insert bug) — diagnosed, root-caused, and a repo plan written; **fix NOT yet implemented** — this is the top open item for the next session.

**Next session, start here:** implement `docs/plans/fix-analyze-pillar-duplicate-key.plan.md` (the full, verified fix plan). One-method change in `GeekBackend/GeekRepository/Repositories/Seo/SiteAnalysisProfileRepository.cs`. See Item 2 below for the summary.

---

## 1. Railway hosting incident — FULLY RESOLVED

**Resolution (2026-08-04):** Investigation confirmed there were **no backend services trapped in the Next.js app to migrate** — the only server-side code is OAuth/session BFF + a thin proxy layer, both of which correctly belong with the frontend; the real Content Creator backend already lives natively in GeekAPI (`Controllers/ContentCreator/GccController.cs`, `Services/ContentCreator/Gcc*`). So "incorporate its services into the backend" was already satisfied — nothing migrated. The vestigial container-build artifacts (`Dockerfile`, `.dockerignore`, `DOCKER_BUILD` branch in `next.config.ts`) were removed — unused by both Vercel (builds natively) and the Railway service (used Railpack); removal committed/pushed as `c661f80`, Vercel redeployed green. **The redundant Railway `geek-content-creator` service was then deleted by the user — verified via `list-services`: the project now has zero services.** Vercel is the sole UI host. This item needs no further action.

### What happened
GeekContentCreator's UI has been running on **two separate hosting platforms simultaneously**: Railway (`geek-content-creator-production.up.railway.app`) and Vercel (`geek-content-creator.vercel.app`). Only Vercel was ever supposed to host it.

### Root cause, confirmed via git history (not guessed)
- **Aug 1, 12:52:15** — commit `eea8a04` ("Host Geek Content Creator on Vercel like Geek Content Workflow") deliberately decommissioned Railway: deleted `railway.toml`, rewrote README's "Deploy" section from Railway/Docker to Vercel, repointed all env var docs (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_OAUTH_REDIRECT_URI`, etc.) at the Vercel URL.
- **Aug 2, 14:25:57** — commit `c5fdd3e` ("Document Creates-first happy path and drop orphan image-prompt API") — a commit about an **entirely unrelated topic** — silently reintroduced the line `- Production (Railway): https://geek-content-creator-production.up.railway.app` into README.md's Stack section as an incidental side effect of rewriting that section for other reasons. Nothing in the commit's own stated purpose relates to hosting.
- Every session since (including the one that produced this handoff) treated that accidental line as ground truth. Real effort was spent this session reconnecting the Railway service's GitHub auto-deploy, believing it needed to be kept current — it didn't need to exist at all.

### Current live state (verified this session, not assumed)
- **Vercel** (`prj_57SjtjBZodCL0GNVwjkRjkS3dNyx`, team `team_PJXXEaTDliZg5jHcVCfu8cjI`): git-connected to `jmartinemployment/GeekContentCreator` main, auto-deploys correctly, currently fully up to date. **This is the correct, working, intended production host.**
- **Railway** (project `e1dbc908-ea3e-4f81-a040-d43e0e4f0bca`, service `a911231b-b5ee-4638-85b2-6208d89d3bfb`): also live, was fixed this session (previously undocumented, non-git-connected — see the "Fix stale sitemap-generator-step1" work earlier in this project's history) to auto-deploy from the same repo/branch. It should not exist as a UI host at all.

### What does NOT need to move before deleting Railway (checked, not assumed)
1. **No custom domain** on the Railway service — only default `*.up.railway.app` domains. Confirmed via Railway `list-domains`.
2. **No source code reference** to the Railway URL anywhere in the GeekContentCreator codebase (checked via grep across `.ts`/`.tsx`/`.md`). `.env.example` already documents Vercel as the only production config.
3. **Vercel's own env vars already work independently** — confirmed via real runtime logs from an actual user Analyze attempt on Vercel: successful GeekOAuth-authenticated requests and successful GeekAPI calls reached the backend. Vercel borrows nothing from Railway at runtime.
4. GeekOAuth's redirect-URI allowlist and GeekAPI's `CORS_ORIGINS` may still include the Railway URL as an *additional* allowed entry — this is shared config, not something unique to the Railway service. An unused-but-still-allowed origin is harmless after the service is deleted. Optional cleanup, not a blocker.

**Conclusion: deleting the Railway service is a clean, safe deletion. Nothing needs to be migrated first.**

### Action required (manual — no Railway MCP delete-service tool exists)
1. Railway dashboard → project `geek-content-creator` (`e1dbc908-ea3e-4f81-a040-d43e0e4f0bca`)
2. Service `geek-content-creator` (`a911231b-b5ee-4638-85b2-6208d89d3bfb`)
3. Settings → Danger zone → Delete Service

After deletion, verify (read-only `list-services` on that project) it's gone and confirm Vercel continues serving with no regression.

### Explicitly out of scope for this item (per user direction, 2026-08-04)
- **ContentWriterV2 is not to be touched** — preserve as-is until told otherwise.
- **GeekContentCreator itself (the app/repo) is not being deleted or restructured** — that's a separate, later decision pending the user's own audit ("If Geek-Content-Creator ever passes my audit, yes, it may be deleted. But that is not the focus of this conversation.").
- Whether Geek-SEO's standalone backend service should be more deeply merged into GeekAPI's process (like ContentWriterV2 was, Phase 1) was raised but explicitly set aside — not part of this action. For reference: GeekRepository already has a direct `ProjectReference` to `Geek-SEO/GeekSeo.Persistence` (real merge, DB layer only); the actual Geek-SEO compute service (`GeekSeoBackend`) remains a separate deployed Railway service that talks to GeekAPI over HTTP only, which is compliant with the documented trust-boundary rule in `GeekBackend/AGENTS.md` § "Service topology & trust boundaries" (every product/frontend integrates through GeekAPI, never GeekRepository/Postgres directly) — it's just not compiled into GeekAPI's own process the way CWV2 is.

---

## 2. Live bug: duplicate-key crash on Analyze re-run — TOP OPEN ITEM (fix planned, NOT implemented)

**➡ Full fix plan (verified, ready to implement): [`docs/plans/fix-analyze-pillar-duplicate-key.plan.md`](./plans/fix-analyze-pillar-duplicate-key.plan.md).** The section below is the background; the plan doc is the authoritative, corrected fix. Where they differ, trust the plan doc — it supersedes the earlier "Planned fix" text kept below for history.

### How it was found (and re-confirmed still live)
User ran Analyze at `geek-content-creator.vercel.app/app/site-analyzer` → "Site analysis failed," empty/`null` browser console. Re-confirmed still live via Railway logs on 2026-08-04 12:58–13:01 UTC (same `RunCoverageAsync:764` → `POST .../pillars` failure, same profile `2688c73a-283e-4bde-843c-48db2f219d1f` the user re-analyzed). First-time analyses succeed; **re-Analyze of an already-analyzed profile is what crashes** — which is why the user keeps hitting it on the same domain.

### Root cause, confirmed via Railway logs (not guessed)
- **GeekSeoBackend** logs: `RunCoverageAsync` (`SiteAnalysisStepExecutionService.cs:764`) threw `InvalidOperationException` because `profileRepo.BulkInsertPillarsAsync` returned a failure `Result`.
- **GeekRepository** logs (same request, same timestamp): the actual DB error is `Npgsql.PostgresException: 23505: duplicate key value violates unique constraint "PK_niche_pillars"`.
- Source (`GeekBackend/GeekRepository/Repositories/Seo/SiteAnalysisProfileRepository.cs:1031-1053`): `BulkInsertPillarsAsync` and `BulkInsertSubtopicsAsync` **always insert, never delete prior rows first** (`AddRange` + `SaveChangesAsync`, no cleanup). `SiteAnalysisStepExecutionService.RunCoverageAsync` deliberately **reuses the same `Id`** for a pillar it recognizes as already existing (`existing?.Id ?? Guid.NewGuid()`), which collides with the still-present row from the previous Analyze run — i.e., **any re-Analyze of an existing profile crashes.**
- **Correction to an earlier assumption:** `BulkInsertEntitiesAsync` (line 1105) and `BulkInsertPillarPagesAsync` (line 1117) share the missing-delete shape but have **zero callers anywhere** (dead code) — they are NOT implicated in the crash and are out of scope for the fix. Verified: the only live callers of any `BulkInsert*` are `SiteAnalysisStepExecutionService.cs:762,766` and `SiteAnalysisStepRerunService.cs:458,459`, and both call only `BulkInsertPillarsAsync` then `BulkInsertSubtopicsAsync`.
- The correct pattern already exists in the same file, `BulkInsertCompetitorsAsync` (line 1055-1073): derive `profileId` from `list[0].SiteAnalysisProfileId`, `ExecuteDeleteAsync` scoped to it, then insert — **no signature change needed** (`SiteAnalysisPillar` carries `SiteAnalysisProfileId`). The plan wraps delete+insert in an explicit transaction (pattern already used at line 848) for atomicity, which the competitors method does not.

**Naming note (informational, not in scope to fix):** the constraint is named `PK_niche_pillars` — a leftover from the incomplete Niche→SiteAnalysis rename flagged earlier in this project's `docs/FALLBACK_INVENTORY.md`. Renaming the physical table/constraint is separate, riskier migration work.

### FK cascade behavior, confirmed directly (`GeekSeo.Persistence/Data/SeoDbContext.Extensions.cs`)
- `SiteAnalysisSubtopic` → `SiteAnalysisPillar` (`PillarId`): `OnDelete(DeleteBehavior.Cascade)` (~line 344)
- `SiteAnalysisPillarPage` → `SiteAnalysisPillar` (`PillarId`): `OnDelete(DeleteBehavior.Cascade)` (~line 505)
- `SiteAnalysisEntity` → `SiteAnalysisProfile` (`SiteAnalysisProfileId`): `OnDelete(DeleteBehavior.Cascade)` (~line 494) — cascades only from profile deletion, irrelevant here since the profile is never deleted on a re-Analyze

**This means:** deleting a profile's old pillars automatically cascades away their old subtopics and pillar-pages at the DB level. Only `BulkInsertPillarsAsync` and `BulkInsertEntitiesAsync` need their own explicit delete step; `BulkInsertSubtopicsAsync`/`BulkInsertPillarPagesAsync` are fine as plain inserts **as long as pillars are always refreshed first** in the call sequence (confirmed for pillars→subtopics: `SiteAnalysisStepExecutionService.cs:748-766`; pillar-pages' call site still needs to be spot-checked for the same ordering, not assumed).

### Fix — FINALIZED (see the plan doc for the exact code)
**The entire fix is one method.** Rewrite `BulkInsertPillarsAsync` (line 1031) in `GeekBackend/GeekRepository/Repositories/Seo/SiteAnalysisProfileRepository.cs` to delete-then-insert, scoped to `profileId` derived from `list[0].SiteAnalysisProfileId`, wrapped in a `BeginTransactionAsync`/`CommitAsync` so the cascade-delete of old pillars (which cascades their old subtopics away) + the re-insert are atomic. Early-return on empty list. **No signature change**, so no ripple to the interface / `HttpSiteAnalysisProfileRepository` / GeekAPI internal controller. `BulkInsertSubtopicsAsync` needs no delete (it's covered by the pillar cascade + the pillars-first call ordering) — just a comment noting that dependency. `BulkInsertEntitiesAsync`/`BulkInsertPillarPagesAsync` are dead code, left untouched. Exact code block is in `docs/plans/fix-analyze-pillar-duplicate-key.plan.md`.

### Also needs investigating (separate, smaller): the "console → null" symptom
Once Analyze actually completes or fails with a real surfaced error after the fix above, check whether the frontend still shows a bare `null` on any failure path. Trace `analysis.ErrorMessage` / the GCC error-propagation chain (`GccController`, `content_creator.gcc_site_analyses.ErrorMessage` column) for a path where a failure is recorded but the message string itself ends up null. May resolve itself once the primary bug is fixed (nothing left to fail), or may be a distinct small bug.

### Verification (once implemented)
- Trigger two Analyze runs in a row against the same domain/profile — the real repro condition. Second run must not crash on duplicate keys.
- Confirm each Bulk* method leaves exactly one generation's worth of rows per profile after a re-run, not accumulating duplicates.
- Confirm a mid-operation failure leaves previous data intact (transaction rollback), not a half-deleted state.
- Live-verify via `geek-content-creator.vercel.app` with a real re-Analyze — same URL that surfaced the bug.
- `dotnet build` GeekRepository/GeekBackend clean; existing tests still pass.

### Explicitly out of scope for this item
- Renaming `niche_pillars`/`PK_niche_pillars` (separate Niche-rename migration work, already tracked).
- The deferred transactional-batch-endpoint follow-up already logged in `docs/FALLBACK_ELIMINATION_PLAN.md` item 13 (different code path — GeekSeoBackend's `SiteAnalysisPersistenceService`, not this GeekRepository bulk-insert code).

---

## Related docs
- [README.md](../README.md) — "Known incident" note on the Railway hosting mistake
- [architecture.md](../architecture.md) — Site Analyzer section, hosting note
- [CONTENT_CREATOR_PLAN.md](../CONTENT_CREATOR_PLAN.md) — top-level status table, §14 open items
- [docs/FALLBACK_ELIMINATION_PLAN.md](./FALLBACK_ELIMINATION_PLAN.md) — the prior, completed fallback-elimination work (unrelated to both items above, but same session lineage)
- `GeekBackend/AGENTS.md` § "Service topology & trust boundaries" — the actual documented backend architecture rules referenced in item 1
