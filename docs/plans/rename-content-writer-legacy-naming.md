# Workflow completion + content-writer naming cleanup — the one plan

This is the single active plan for this entire workstream. It supersedes and
replaces:
- `docs/plans/openai-429-retry-backoff.md` (the original "day one" plan,
  committed at `0b2fb2c` — Parts 0–6 are done, confirmed by direct code
  inspection below; only Part 7 survives here as unfinished work)
- `docs/plans/content-writer-reuse-audit.md`,
  `content-writer-reuse-audit-review.md`,
  `content-writer-v2-vs-geekapi-file-audit.md`,
  `copy-content-writer-v2-fixes-to-geekapi.md` — session-generated
  investigation notes, fully absorbed into the history below, deleted as
  separate files
- `/Users/jeffmartin/.claude/plans/write-body-error-wild-hinton.md` — stale
  plan-mode scratch file, superseded, not a tracked repo file

## Full history

0. **Root cause of the naming problem** (found while updating this plan):
   commit `c79914f` ("Adopt Content Writer v2 as the Content Creator base",
   2026-08-01) wholesale-adopted content-writer-v2's own client code as
   GeekContentCreator's generation UI — introducing `/api/cw`,
   `src/components/content-writer/*`, and `src/lib/content-writer/{api,types}.ts`
   verbatim. `fc9a496` ("Reorganize: move fetch-based services to
   src/services/, fix misleading naming") later relocated
   `content-writer/api.ts` to `src/services/content-writer-api.ts`, fixing
   the *location* per the `src/lib` vs `src/services` rule but leaving the
   *name* — which is what Track B below finally corrects.
1. **429 bug report**: clicking "Write Body" threw `OpenAI request failed
   (429)`. Root cause: OpenAI's 30k TPM limit — `GeneratePillarBodyAsync`
   made ~9-11 sequential LLM calls in one rolling 60s window, ~5-6 of which
   were a redundant Tools section the app immediately re-derived in Step 6
   anyway.
2. That diagnosis produced the original comprehensive plan
   (`openai-429-retry-backoff.md`, commit `0b2fb2c`): retire GeekAPI's live
   `ProjectReference`/`AddApplicationPart` merge of content-writer-v2's
   assemblies, copy the generation surface into GeekAPI's own code, stop the
   pillar from generating Tools content it immediately discards, and persist
   the tool names Site Analyzer already surfaces instead of re-inventing them
   with an LLM call.
3. **Verified against the current codebase — Parts 0-6 are done:**
   - **Part 0** (document the rule): `GeekBackend/AGENTS.md:81-86` states the
     blanket copy-not-reuse rule across all content-writer versions.
   - **Part 1** (copy generation surface, drop the live reference):
     `GeekAPI.csproj` has zero `ContentWriter` references (confirmed by
     grep); `GeekAPI/Services/Workflow/`, `GeekAPI/Controllers/Workflow/`
     contain GeekAPI's own orchestrator/controllers/providers.
   - **Part 2** (persist Site Analyzer's tools paragraph):
     `src/lib/content-creator/hierarchy-match.ts` has
     `parseHierarchyToolNames`/`paragraphsOf`; `Project.HierarchyToolNames`
     exists in `GeekAPI/Services/Workflow/Domain/Entities/Project.cs:38` and
     is threaded through `ProjectContracts.cs`.
   - **Part 3** (Tools upload category + extraction): `Tools` category
     exists in `src/lib/types.ts:191,410`;
     `KeywordSource.ExtractedToolResearchJson` exists
     (`GeekAPI/Services/Workflow/Domain/Entities/KeywordSource.cs:32`).
   - **Part 4** (pillar stops generating Tools): `GenerateToolsSectionAsync`
     is gone from `ContentGenerationOrchestrator.cs`; the pillar body path
     calls `DescriptorsFromToolPosts` instead (real data, not LLM-invented).
   - **Part 5** (Tools step reads persisted data + roundup doc):
     `ToolPageGenerator.cs:116-137` reads `project.HierarchyToolNames` and
     `ExtractedToolResearchJson`; `IsToolRoundupSlug`
     (`ContentGenerationOrchestrator.cs:1191-1192`) confirms the "Top AI
     Tools for X" roundup document exists.
   - **Part 6** (JSON-LD from real tool data, one pass):
     `DescriptorsFromToolPosts` builds `SoftwareApplicationDescriptor`
     entries directly from `ToolPost` records — no more text-scrape,
     no post-hoc rebuild.
   - **Part 7 (Social/Email/Advertising JSON-LD) is NOT done** —
     `GeekAPI/Services/Workflow/Services/SchemaBuilders/` contains only
     `TechnicalArticleSchemaBuilder`, `BlogPostingSchemaBuilder`,
     `SoftwareApplicationSchemaBuilder`. No
     `ISocialMediaPostingSchemaBuilder`, no `IEmailMessageSchemaBuilder`, no
     `IAdvertiserContentArticleSchemaBuilder`. The `Advertising`
     `GeneratedContentType` enum value exists
     (`ContentEnums.cs:49`, value `14`) but has no schema attached — matches
     the plan's own note that only `AdvertisingSummary` existed with nothing
     to attach a schema to.
4. Separately, while confirming Part 1's "no live reference" claim, found and
   fixed real bugs left over from that migration: a non-compiling placeholder
   in `BuildAdvertisingPrompt` (`ContentPromptBuilder.cs`), an orphaned
   duplicate code block from the same edit, three debug-log
   `File.AppendAllText` call sites writing into content-writer-v2's own
   `.cursor/` folder (one of them a shared `AgentDebugLog` helper called from
   7 sites, not just 3), a dead Dockerfile clone step, and the
   `GeekAPI/Services/Workflow/`/`Controllers/Workflow/` trees being entirely
   **untracked in git**. All fixed and committed (`228ecbb`), `dotnet build`
   verified clean. GeekAPI now has zero live dependencies on content-writer-v2.
5. Turned to naming: `content-writer-api.ts`, `/api/cw`, and
   `components/content-writer/` in GeekContentCreator are misleading — own
   code calling GeekAPI's own Workflow generation, not an external client.
   Broader exploration found two *other*, unrelated live products —
   `ContentWriterV3` (backing the separately-deployed `content-writer-v3`
   Vercel app) and `ContentWriterV4`/`Gcw` (backing the separately-deployed
   `GeekContentWorkflow` Vercel app) — share the same misleading name, each
   with its own Postgres schema (`content_writer_v3`, `content_writer_v4`)
   in GeekRepository.
6. **User decision**: drop the `content_writer_v3`/`content_writer_v4`
   schemas directly (user-executed, outside this plan), knowingly abandoning
   `content-writer-v3` and `GeekContentWorkflow` as live callers. V3/V4
   changes from "rename, coordinate with 2 external repos" to "delete dead
   code" once those schemas are gone.
7. **Current ask**: one plan, one execution pass, covering the real
   remaining work (Part 7) and the naming cleanup (V2 rename, V3/V4
   deletion) together.
8. **LM Studio removal**: while reviewing `defaultLlmProvider()` and
   `preferredProvider`, found LM Studio should never have been a live option
   — the frontend's own comment says `"Hosted GeekAPI has no LM Studio"`,
   confirming it only ever worked for local dev against a developer's own
   machine. Worse: `GeekAPI/appsettings.json:10` has
   `"DefaultProvider": "LmStudio"`, and `Project.cs:17` defaults every new
   project's `PreferredProvider` to `LlmProviderType.LmStudio` (enum value
   `0`, C#'s implicit default) — meaning **the actual configured production
   default is a provider that doesn't work in production**, contradicted by
   the frontend's own comment. **Confirmed**: `Program.cs:20` uses
   `WebApplication.CreateBuilder(args)`, ASP.NET Core's standard config
   pipeline, which layers `appsettings.json` → environment variables (env
   vars win). So `LlmProviders__DefaultProvider` was always overridable on
   Railway without any code change — it just was never set, so production
   has been silently falling through to the checked-in `"LmStudio"` value
   this whole time. User decision: remove LM Studio entirely (frontend +
   backend), not just fix the default value.
9. **429-tracing pass** turned up a second silent fallback while walking the
   exact `GeneratePillarBodyAsync` call sites contributing to the OpenAI
   token burst: `ContentGenerationOrchestrator.cs:1059-1068` — when no
   outline heading matches the Introduction markers, the code falls back to
   a standalone lede-only call rather than the combined lede+introduction
   call, with a comment explicitly framing it as a fallback ("generate the
   lede on its own rather than silently dropping it"). Per the same
   no-fallbacks stance as Track D: user decision is to remove this fallback
   branch, not keep it as a safety net.

## Remaining work — five independent tracks

### Track A — Part 7: Social/Email/Advertising JSON-LD (GeekAPI, new code)

Extend the existing one-schema-builder-per-content-type pattern
(`ITechnicalArticleSchemaBuilder`, `IBlogPostingSchemaBuilder`,
`ISoftwareApplicationSchemaBuilder` in
`GeekAPI/Services/Workflow/Services/SchemaBuilders/`) to the types that
still have none:

1. **Social** (`SocialFacebook`/`SocialLinkedIn`): new
   `ISocialMediaPostingSchemaBuilder` → `schema.org/SocialMediaPosting`,
   wired into `GenerateSocialAsync`'s existing content rows.
2. **Email** (`EmailColdOutreach`, plus the stubbed
   Newsletter/StoryNurture/Transactional types if they exist as content
   rows): new `IEmailMessageSchemaBuilder` → `schema.org/EmailMessage`,
   wired into `GenerateColdOutreachAsync`.
3. **Advertising**: the `Advertising` enum value and
   `BuildAdvertisingPrompt` already exist (confirmed working after the
   earlier fix) — confirm whether a `GenerateAdvertisingAsync` orchestrator
   step exists yet or still needs adding, then add
   `IAdvertiserContentArticleSchemaBuilder` →
   `schema.org/AdvertiserContentArticle`
   (`Thing > CreativeWork > Article > AdvertiserContentArticle`).

**Verify before building**: check whether any partial ad-type scaffolding
(Google/Meta ad variants) already exists elsewhere in the codebase — not
confirmed either way.

### Track B — V2 naming rename (GeekContentCreator, low risk)

| Old | New |
|---|---|
| `src/services/content-writer-api.ts` | `src/services/workflow-api.ts` |
| `src/components/content-writer/` | `src/components/workflow/` |
| `src/lib/content-writer/` (empty) | delete |
| `/api/cw/[...path]` route folder | `/api/workflow/[...path]` |
| `API_BASE_URL = "/api/cw"` (`workflow-api.ts`, `gcc-api.ts`) | `/api/workflow` |
| `isProductionContentWriterApi()` | **delete** (not rename — see Track D: its only call site is an LM-Studio-only warning, removed there) |
| `CwClient` type (`src/lib/types.ts:169`, already `@deprecated`) | remove |
| Legacy "Content Writer v2"/"CWV2" comments across `src/services/*.ts`, `AGENTS.md`, `README.md`, `architecture.md` | reworded |

Steps:
1. `git mv src/services/content-writer-api.ts src/services/workflow-api.ts`; rename `isProductionContentWriterApi` → `isProductionWorkflowApi`; update `API_BASE_URL`
2. `git mv src/app/api/cw src/app/api/workflow`; update its comment
3. `src/services/gcc-api.ts`: `API_BASE` → `/api/workflow`, update comment
4. `git mv src/components/content-writer src/components/workflow`; fix self-imports
5. Update import sites: `src/app/app/creates/page.tsx`, `src/app/app/creates/[id]/repurpose/page.tsx`, `src/app/app/workflow/page.tsx`, `src/app/app/workflow/projects/[id]/page.tsx`, `src/app/app/site-analyzer/site-analyzer-client.tsx`
6. `rm -r src/lib/content-writer/`; remove `CwClient` after confirming zero references
7. Update comments/docs (batched, last): `AGENTS.md`, `README.md`, `architecture.md`, `.env.local`, `.env.example`, and inline comments in `src/lib/draft-quality.ts`, `src/components/content-creator/CreateDraftWorkspace.tsx`, `src/app/app/creates/[id]/page.tsx`, `src/lib/content-creator/brief-catalog.ts`
8. GeekAPI: sweep comments in `Services/Workflow/**/*.cs`/`Controllers/Workflow/**/*.cs` still referencing "content-writer-v2"/"CWV2" — reword. No namespace/class renames needed, already correct.

### Track C — V3/V4 deletion (GeekBackend, after user's schema drop)

**Pre-condition**: confirm `content_writer_v3`/`content_writer_v4` schemas
are actually dropped before deleting the C# code (GeekRepository's
`AddDbContext` calls run checks on startup — deleting code first just trades
one failure mode for another). Order: **schemas dropped → code deleted →
GeekRepository/GeekAPI redeployed.** Also confirm whether the *unversioned*
`ContentWriterDbContext` (`public.web_posts`) is being dropped too.

| Item | Location |
|---|---|
| `ContentWriterV3` namespaces/folders | `GeekApplication/Interfaces\|Models/ContentWriterV3/`, `GeekAPI/Controllers\|Services/ContentWriterV3/`, `GeekRepository/Controllers\|Data/Entities\|Repositories/ContentWriterV3/` |
| `ContentWriterV3DbContext` + factory + migrations | `GeekRepository/Data/ContentWriterV3DbContext.cs` + `Migrations/ContentWriterV3/` |
| `HttpContentWriterV3Repository` | `GeekAPI/HttpClients/HttpContentWriterV3Repository.cs` + DI registration |
| `ContentWriterV4` namespaces/folders | `GeekApplication/Interfaces\|Models/ContentWriterV4/`, `ContentWriterV4Constants.cs`, `GeekRepository/Controllers\|Data/Entities\|Repositories/ContentWriterV4/` |
| `Gcw*` namespaces/folders | `GeekAPI/Controllers/Gcw/`, `GeekAPI/Services/Gcw/` |
| `ContentWriterV4DbContext` + factory + migrations | `GeekRepository/Data/ContentWriterV4DbContext.cs` + `Migrations/ContentWriterV4/` |
| EF migration-history bootstrapping | `GeekRepository/Program.cs:47-73` — remove both `AddDbContext` calls, both migration-history configs, both `ApplyContentWriterV3/V4MigrationsAsync` calls |
| CORS entry for the abandoned app | `GeekAPI/Extensions/CorsOriginParser.cs:11-15,59,62` — remove `content-writer-v3.vercel.app` + wildcard |

Steps:
9. Delete GeekApplication's V3/V4 contracts
10. Delete GeekAPI's V3/V4/Gcw surface + CORS entry
11. Delete GeekRepository's V3/V4 persistence layer + `Program.cs` wiring
12. Check `GeekSa2Read`'s `Sa2ContentWriterBundleReader`/`Sa2ContentWriterExportReader`/`Sa2ContentWriterExportBuilder` and `GeekRepository/SeoDataRegistration.cs:46`'s `ContentWriterHandoffService` — confirm whether these talk to the schema being dropped (delete if so) or serve something unrelated (leave, flag naming for later)
13. `content-writer-v4` scaffold repo: no GeekAPI dependency, nothing to do — user's call on archiving separately

### Track D — remove LM Studio entirely + fix the resulting default-provider gap

LM Studio never worked in production (frontend's own comment confirms it's
local-dev-only), and its presence caused a real bug: the production default
provider (`appsettings.json` + `Project.cs`'s implicit default) silently
resolves to a provider that can't run. Removing it also removes the need for
`isProductionContentWriterApi()` (Track B originally listed this as a
rename — corrected here to **delete**, since its one call site is the
LM-Studio-only warning removed in this track).

**Frontend:**

| Item | Action |
|---|---|
| `"LmStudio"` in `LlmProviderType` (`src/lib/types.ts:173`) | remove from the union |
| `{ value: "LmStudio", ... }` in `PROVIDER_OPTIONS` (`types.ts:414`) | remove |
| `LmStudioHealthStatus` interface (`types.ts:396`) | remove (only used by the status check below) |
| `getLmStudioStatus()` (`content-writer-api.ts:520-522`) | remove |
| `isProductionContentWriterApi()` (`content-writer-api.ts:24-26`) | remove (not rename) |
| LM-Studio warning block (`ProjectForm.tsx:163-167`) | remove |

**Backend:**

| Item | Action |
|---|---|
| `LmStudioProvider.cs`, `LmStudioController.cs` | delete |
| `LlmProviderType.LmStudio = 0` (`ContentEnums.cs:5`) | remove enum member (renumber remaining values or pin explicit values so nothing silently shifts) |
| `Project.PreferredProvider` default (`Project.cs:17`) | change from implicit `LmStudio` (enum `0`) to an explicit real default — **no silent fallback**: either require the field to always be set at project creation, or default to a provider confirmed to work in production (`OpenAi`, matching the frontend's `defaultLlmProvider()`) |
| `AddKeyedTransient<IContentGenerationProvider>(LlmProviderType.LmStudio, ...)` (`WorkflowServiceRegistration.cs:64-66`) + `AddHttpClient<LmStudioProvider>()` (`:56`) | remove |
| `ContentProviderFactory.GetDefault()` (`ContentProviderFactory.cs:32-39`) | **delete outright** — zero call sites found (confirmed by repo-wide grep), and its fallback-to-`LmStudio`-on-parse-failure is exactly the kind of silent fallback to avoid; nothing currently calls it, so removing it is pure cleanup, not a behavior change |
| `LmStudio` section in `appsettings.json:11-14` (and `bin/Debug`/`bin/Release` copies, which regenerate on build) | remove |
| `"DefaultProvider": "LmStudio"` (`appsettings.json:10`) | change to `"OpenAi"` — matches the frontend's `defaultLlmProvider()`, and is a provider confirmed to work in the hosted environment |

**Config verification (do this regardless of code changes):**
14. Check Railway (via the Railway MCP, read-only: `list-variables` on the GeekAPI service) for whether `LlmProviders__DefaultProvider` is currently set. If it's unset, the `appsettings.json` fix above is the only thing standing between production and a working default. If it's set to something else already, note what, so the `appsettings.json` fallback fix doesn't create a false impression of what's actually running.

Steps:
15. Frontend: remove all six items in the frontend table above; `npm run build` to catch dangling references (e.g. `PROVIDER_OPTIONS.map` no longer needs an `LmStudio` case, `ProjectForm.tsx`'s import of `isProductionContentWriterApi` goes away)
16. Backend: remove all items in the backend table above, in this order — provider class/controller first, then enum member, then DI registration, then the two config files, then `ContentProviderFactory.GetDefault()`; `dotnet build` after each removal to catch dangling references (especially the enum renumbering — anything persisting `LlmProviderType` as an int, e.g. EF Core storing it as an int column, needs checking so existing projects' stored `PreferredProvider` values don't silently remap to a different provider)
17. Confirm Railway's `LlmProviders__DefaultProvider` env var state (step 14) and set/correct it if needed — this is a Railway action, not a code change, and needs your explicit go-ahead before I touch it

### Track E — remove the lede-only fallback branch

`ContentGenerationOrchestrator.cs:1046-1068`, inside `GenerateArticleBodyAsync`:

```csharp
if (introductionHeading is not null)
{
    // combined lede + introduction, one call
}
else
{
    // Fallback: no heading in this outline matches the Introduction markers — generate the
    // lede on its own rather than silently dropping it.
    _logger.LogInformation("Generating pillar lede (no Introduction heading found to combine with)");
    var ledeResult = await provider.CompleteAsync(
        _promptBuilder.BuildArticleLedePrompt(context, metadata, revisionNotes, existingLedeHeading),
        cancellationToken);
    (lede, ledeType) = LlmResponseJsonParser.ParseLede(ledeResult.Content, "TechnicalArticle lede");
}
```

The `else` branch is a fallback by its own comment's admission — remove it. Once removed, the only path left is the `introductionHeading is not null` branch, so the method needs to decide what happens when that condition is false, without silently degrading to a second, smaller LLM call:

18. Remove the `else` branch (lines ~1059-1068) entirely.
19. Replace it with an explicit failure: if `introductionHeading` is `null`, throw a `ContentGenerationException` naming the missing Introduction heading requirement, so a malformed/unexpected outline surfaces immediately as a clear error instead of quietly producing a lede-only document via an extra call. This also removes one of the possible LLM-call-count variations from the 429 tracing table above — the flow becomes single-path (combined call, or explicit failure), not two possible paths with different token costs.
20. Check `PillarOutlineNormalizer`/`PillarSectionClassifier` (wherever `introductionHeading` is classified, likely `PillarSectionClassifier.IsIntroductionSection`) — since this fallback is going away, confirm the pillar plan step (Step 1) reliably produces an outline with a real Introduction-classified heading every time, so the new hard failure doesn't start firing on legitimate outlines. If there's any known case where Step 1's outline doesn't include one, surface that as a Step 1 problem to fix, not something Step 2 should paper over.

## Testing surface

**Track A (Part 7):**
- `dotnet build GeekAPI/GeekAPI.csproj`
- Generate a project through Social, Cold Outreach, and Advertising steps; confirm each produces valid, type-correct JSON-LD for its new schema type

**Track B (V2 rename):**
- `npm run build` — catches dangling imports immediately
- `npm run dev`: Workflow project list → project detail → crawl → generate pillar plan → generate pillar body (the original 429 flow) → confirm the proxy still reaches GeekAPI
- Grep `content-writer` and `/api/cw` across `src/` — zero hits outside `docs/plans/*.md` (this file, kept as history)
- `dotnet build GeekAPI/GeekAPI.csproj` after step 8 (comment-only, no-op)

**Track C (V3/V4 deletion):**
- `dotnet build` on GeekApplication.csproj, GeekAPI.csproj, GeekRepository.csproj after each deletion step
- Start GeekRepository locally against the post-drop database — confirm clean boot, no missing-schema errors
- Start GeekAPI locally, check its route listing — confirm `api/content-writer/v3/*`/`api/gcw/*` are gone, Workflow/GCC routes still resolve
- Re-run Track B's GeekContentCreator flow once more after GeekAPI redeploys, confirming no collateral damage

**Track D (LM Studio removal + default-provider fix):**
- `npm run build` — confirms no dangling frontend references to `LmStudio`/`isProductionContentWriterApi`/`LmStudioHealthStatus`
- `dotnet build GeekAPI/GeekAPI.csproj` after each backend removal step — confirms no dangling references, especially around the enum renumbering
- Create a new project without explicitly setting a provider; confirm it defaults to a provider that actually generates successfully (not silently failing against a nonexistent LM Studio endpoint)
- Query/inspect any existing projects' stored `PreferredProvider` values before and after the enum change — confirm no existing project's provider silently remapped to a different one when `LmStudio = 0` was removed and the enum renumbered
- Railway: confirm `LlmProviders__DefaultProvider`'s actual current value (step 14) before touching `appsettings.json`, so the fix reflects reality rather than assumption

**Track E (remove lede-only fallback):**
- `dotnet build GeekAPI/GeekAPI.csproj`
- Generate a pillar body against an outline confirmed to have a proper Introduction heading — confirm the combined lede+introduction call still runs exactly as before (no behavior change on the normal path)
- Deliberately test with a Step 1 outline that lacks an Introduction-classified heading (if reproducible) — confirm it now throws a clear `ContentGenerationException` instead of silently falling back, and that the error message is actionable
- Re-check the call-count table from the 429 trace — confirm this removes the two-path branching, leaving one call path instead of two

## Risk assessment

- **Track A** — low risk, additive only (new schema builders, no changes to existing generation logic).
- **Track B** — low risk. Rename/move + comment edit, no logic changes. Worst case is a missed import path, caught immediately by `npm run build`. No compatibility shim needed — `/api/cw` has no external consumers.
- **Track C** — moderate risk, sequencing is the whole risk. The external callers are being knowingly abandoned by the user's own schema drop, so that's accepted, not a risk to mitigate. The actual risk is ordering: deleting `AddDbContext` calls before the schema drop, or after it but before confirming nothing else routes into V3/V4, turns a clean deprecation into a startup crash. Follow the pre-condition. Secondary risk: `GeekSa2Read`'s ambiguous naming — don't delete blind, check first (step 12).
- **Track D** — low risk, confirmed. `ProjectSnapshotSerializer.cs:19` and `ClientSnapshotSerializer.cs:17` both use `JsonStringEnumConverter()`, meaning `PreferredProvider` is persisted as the **string** `"LmStudio"`/`"OpenAi"`/etc., not a raw integer — so removing `LmStudio = 0` and letting the remaining enum values renumber is safe, no silent remapping risk. The only real edge case: any *existing* saved project whose `PreferredProvider` string is literally `"LmStudio"` will fail to deserialize once that enum member is removed — worth a quick check for how many (if any) projects currently have it set, so that doesn't surface as a surprise deserialization error later.
- **Track E** — low risk on the normal path (no behavior change when an Introduction heading exists, which is the common case), but turns a previously-silent edge case into a hard failure by design — that's the intent, not a defect, but means any operator-facing error surface should show the new exception message clearly rather than a generic 500, since it'll now be the failure mode whenever Step 1 produces a non-conforming outline.

Tracks A, B, C, D, and E are independent of each other and can be executed in any order or in parallel.
