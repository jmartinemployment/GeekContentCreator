# Integrate Content Writer (Workflow) with Content Brief — Plan

**Status:** Planned — next.
**Owner:** GeekContentCreator (`src/`) + GeekAPI Workflow (`Services/Workflow`).
**Location:** `docs/plans/` (durable, per `feedback_plan_location.md`).

## Goal

Every **Workflow** generation (`/app/workflow/projects/[id]` — the Content Writer `Project` path that still powers `ContentResults` steps 1–7) honors the **Content Brief** as the single source of truth for audience / angle / intent / funnel / tone / EEAT / length / SERP, same as the Content Creator `GccCreate` path already does. No keyword-only generation: `Generate` is fail-closed when the Brief is missing or incomplete, and the LLM prompts for pillar / blog / social / email / tools / image-prompts all receive the Brief context.

## Success Criteria

- `Project` (`GeekAPI/Services/Workflow/Domain/Entities/Project.cs`) persists `BriefJson` (nullable `string`, JSON of `ContentBrief`) — same shape as `GccCreate.BriefJson` — via a new `AddProjectBriefJson` migration; `HttpWorkflowRepository`/`GccRepository` round-trips it.
- `PATCH /api/projects/{id}/brief-research` (or `PUT /api/projects/{id}/brief` if preferred) persists the Brief on a Workflow project; frontend `patchProjectBrief` in `src/services/content-writer-api.ts` (to be renamed `workflow-api.ts` per `rename-content-writer-legacy-naming.md` Track B) calls it. `src/lib/` stays pure — no `fetch` added there.
- `ContentBriefPanel` in `src/app/app/workflow/projects/[id]/page.tsx` saves directly onto the **Project** (not a detached `GccCreate` via `localStorage` prefix `gcc-content-brief:`). The panel's `createId` prop is removed or aliased to `projectId`; `loadBriefFromStorage` is kept only as a local-draft fallback, not the source of truth.
- `canGenerate` remains `hierarchyOk && briefComplete && !loading` (already shipped at `6a447b5`), but is now **enforced server-side**: `POST /api/projects/{id}/generate/{pillar|blog|social|…}` returns `400 brief required` / `400 brief incomplete: <missing fields>` when `BriefJson` is null or `contentBriefMissingFields` fails — mirroring `GccGenerateService.ValidateBriefRequired` (`GeekBackend`).
- Prompt builders (`GeekAPI/Services/Workflow/Services/PromptBuilders/ContentPromptBuilder.cs`) inject `BuildBriefBlock` / `BuildLedeTypeGuidance` / `BuildBriefBodyGuidance` from the persisted `BriefJson` for **all** Workflow generate paths (pillar plan `BuildArticlePlanPrompt`, pillar body `BuildArticleBodyPrompt` + `BuildArticleLedePrompt`/`BuildArticleLedeAndIntroductionPrompt`, blog, social, email, tools, image-prompts). Currently only the `Gcc*` (creator) path does this — verified shipped at `f3a83bc`/`afa1eda` + `ecc4620` (lede taxonomy). Workflow's `ContentGenerationOrchestrator.cs` paths do not.
- Existing Workflow projects with `BriefJson = null` deserialise cleanly (nullable column, no backfill required) and are blocked at generate-time until the operator completes the Brief — same behaviour as `GccCreate` today.
- `dotnet build GeekAPI/GeekAPI.csproj` and `npm run build` (Next, 16 App Router, see `node_modules/next/dist/docs/`) both green. No `src/lib/` file gains a `fetch` call.

## Context and Current Facts

**Two parallel create models — one Brief, one not:**

| Model | Frontend service | Backend route | Persists Brief? | Generate honours Brief? |
|---|---|---|---|---|
| **GccCreate** (Content Creator) | `src/services/gcc-api.ts` (`API_BASE=/api/cw`) → `POST /api/geek-content-creator/creates`, `PATCH /creates/{id}/brief-research`, `POST /creates/{id}/generate` | `GeekAPI/Controllers/ContentCreator/GccController.cs`, `Services/ContentCreator/GccGenerateService.cs:155-198 ValidateBriefRequired`, `Services/ContentCreator/GccGenerateService.cs:200 BuildBriefAndResearchBlock`, `Services/Workflow/Services/PromptBuilders/ContentPromptBuilder.cs:213 BuildLedeTypeGuidance/BuildBriefBodyGuidance` | **Yes** — `briefJson` column, `briefToJson` (`gcc-api.ts:635`), `contentBriefMissingFields`/`isContentBriefComplete` (`brief-catalog.ts:412`) | **Yes** — fail-closed + prompt injection shipped |
| **Project** (Content Writer / Workflow) | `src/services/content-writer-api.ts` (`API_BASE_URL=/api/cw`) → `POST /api/projects`, `PUT /api/projects/{id}/hierarchy-context`, `POST /api/projects/{id}/generate/pillar/plan|body|blog|social|…` | `GeekAPI/Controllers/Workflow/*`, `Services/Workflow/Domain/Entities/Project.cs`, `Services/Workflow/Services/ContentGenerationOrchestrator.cs`, `Services/Workflow/Services/PromptBuilders/ContentPromptBuilder.cs` (same builder, different call sites) | **No** — `Project.cs` has `HierarchyPath`, `HierarchyChildHeadings`, `HierarchyToolNames` etc., but no `BriefJson` field (confirmed by grep `briefJson|BriefJson` → 0 hits in `src/services/content-writer-api.ts`, 1 hit `brief` param in `generateToolsFromNames` only) | **No** — `WorkflowProjectPage` `canGenerate = hierarchyOk && briefComplete` gates the button, but `generatePillarPlanContent`/`generatePillarBodyContent` etc. send only `projectId` — the Brief never reaches the orchestrator. `ContentBriefPanel` on this page currently writes to `localStorage` (`CONTENT_BRIEF_STORAGE_PREFIX`) and, if a `createId` is present, to a `GccCreate`; with no `createId` (current call site at `projects/[id]/page.tsx:134`) it writes only to localStorage — detached from the `Project` that `Generate` reads. |

**Recent history (grounding):**

- `afa1eda` / `f7314ca` — `ContentBriefPanel` incorporated into Workflow `projects/[id]/page.tsx`; `293da90` — Brief declared sole research input, `Upload Research Inputs` panel removed; `8ba6d39` — SERP ingest clarified as file-upload → `SerpPages`/`SerpIndex` → `Apply to brief SERP fields` via `buildCuratedSerpSeed`.
- `ecc4620` + `fix-lede-heading-regression-and-lede-taxonomy.md` — `LedeType` expanded to 12; `BuildLedeTypeGuidance`/`BuildBriefBodyGuidance` wired through `GccGenerateService.ExtractBriefFields`/`BuildMinimalContext` so all **creator** content types are Brief-guided. Workflow's orchestrator call sites were not updated in that change.
- `rename-content-writer-legacy-naming.md` Track B — `content-writer-api.ts` → `workflow-api.ts`, `/api/cw` → `/api/workflow`, `components/content-writer/` → `components/workflow/` (pending). This plan is compatible: the Brief integration lands on the same files Track B renames; either order works if the rename is a pure `git mv` + import fix.

**Catalog shape (source of truth):**

- `src/lib/content-creator/brief-catalog.ts` — `BRIEF_VERSION=2`, `ContentBrief` (12 fields: `primaryIntent`, `secondaryIntent`, `buyingStage`, `audienceSegment`, `audienceDetails[]`, `audienceNotes`, `angle`, `ctaType`/`ctaLabel`, `toneOfVoice`, `eeatSignals[]`, `lengthBand`, `writingNotes`, `serpTitles`/`serpUrls`/`paaQuestions`/`relatedSearches`), plus `PRIMARY_INTENTS`, `SECONDARY_INTENTS`, `BUYING_STAGES`, `AUDIENCE_SEGMENTS` (6, Google Ads verbatim `support.google.com/google-ads/answer/2497941`), `AUDIENCE_DETAILS` (3), `CONTENT_ANGLES` (4), `CTA_TYPES`, `TONES_OF_VOICE`/`EEAT_SIGNALS`/`TONE_COMPATIBILITY`, `migrateBrief` (legacy maps `LEGACY_*`), `contentBriefMissingFields` (9 required), `isContentBriefComplete`, `buildBriefBlock`/`formatBriefAsHtml`.
- `src/components/content-creator/ContentBriefPanel.tsx` — form + validation + persistence; `CreateKeywordUploadPanel.tsx` populates `serpTitles/Urls`/`relatedSearches` via `uploadCreateKeywordSource` + `applyCuratedSerpToBrief`.

**Hard rules (must not violate):**

- `AGENTS.md` — `src/lib/` is pure utilities, never `fetch`; new API methods go in `src/services/`. Backend does not reuse content-writer repo methods (owns its generation code).
- `docs/plans/remove-regex-*.md` — HTML is DOM (`AngleSharp`/`querySelectorAll`), not regex. Unrelated but must not be regressed.
- Next.js docs live at `node_modules/next/dist/docs/` — consult before changing App Router patterns.

## Constraints and Non-goals

- **Do not** edit `GeekContentWorkflow` / `content-writer-v2` repos. All backend changes land in `GeekAPI`/`GeekRepository` under `Services/Workflow` and `Services/ContentCreator` (copy-own, per `architecture.md` §8).
- **Do not** add `fetch` to `src/lib/` — new `patchProjectBrief` lives in `src/services/content-writer-api.ts` (or `workflow-api.ts` after Track B).
- **Do not** migrate existing `Project` rows — `BriefJson` is nullable, no backfill; old rows generate only after the operator completes the Brief (fail-closed matches `GccCreate`).
- **Do not** reintroduce `Upload Research Inputs` as a separate gate — Brief is sole research input (per `6a447b5`); SERP file-uploads feed the Brief via `CreateKeywordUploadPanel` → `Apply to brief SERP fields`.
- **Do not** change `LedeType` taxonomy or prompt wording beyond threading the existing `Build*Guidance` helpers — that shipped and is out of scope.
- **No** `content_writer_v3`/`v4` work, no LM Studio work, no regex work — those remain in their own plans.

## Key Decisions

| Decision | Choice | Why | Alternative rejected |
|---|---|---|---|
| Where does `BriefJson` live for Workflow? | **Add `BriefJson TEXT NULL` to `Project`** (`Project.cs`), not a join to `GccCreate` | Workflow `Generate` already loads `Project` by id; one column, one load path, no cross-aggregate join. Mirrors `GccCreate.BriefJson` pattern that already validates and prompts correctly. | Link `Project.LinkedCreateId → GccCreate` — would couple two aggregates, require a second load + eventual consistency handling, and is not needed when the Brief is conceptually a property of the writing job regardless of creation path. |
| API shape | `PATCH /api/projects/{id}/brief-research` (or `PUT /api/projects/{id}/brief`) with body `{ briefJson: string | null }`, mirroring `gcc-api.ts:124 patchBriefResearch` | Minimal, symmetric with creator; reuses existing `migrateBrief`/`briefToJson` helpers. | Multipart or `content-brief.html` trick — explicitly forbidden by `architecture.md:168` ("Trick `content-brief.html` ... as the brief — do not"). |
| Persistence helper | New `patchProjectBrief(projectId, briefJson)` in `src/services/content-writer-api.ts` (or `workflow-api.ts` after rename) | Keeps `src/lib/` pure; follows `src/lib` vs `src/services` rule. | Add `fetch` to `brief-catalog.ts` — violates `AGENTS.md` and repeats the spaghetti that `rename` plan is unwinding. |
| Panel wiring | `WorkflowProjectPage` passes `projectId` (not `clientId`-only) into `ContentBriefPanel`; panel reads/writes `Project.briefJson` via `getProject` + `patchProjectBrief`; `localStorage` kept as optimistic draft only | Makes the displayed `project.hierarchy*` and the Brief share one persisted entity that `Generate` reads — closes the current detach (panel saves to `GccCreate`/LS, generate reads `Project`). | Keep dual writes (Project + GccCreate) — would leave two sources of truth and require sync. |
| Server enforcement | `ContentGenerationOrchestrator` / `GccGenerateService`-style `ValidateBriefRequired` at the top of every `generatePillar*`/`generateBlog`/`generateSocial`/`generateTools`/`generateColdOutreach` handler for `Project` path — `400` with `contentBriefMissingFields` list | Fail-closed matches creator (`scripts/smoke-gcc-api.py:211` asserts generate fail-closed without Brief). UI gate alone is insufficient (direct API call would bypass). | UI-only gate — rejected: bypassable, inconsistent with creator contract. |
| Prompt injection | Reuse existing `ContentPromptBuilder.BuildBriefBlock` / `BuildLedeTypeGuidance` / `BuildBriefBodyGuidance` (shipped for creator) at Workflow orchestrator call sites; no new prompt helpers | Already tested + taxonomy-aligned; avoids prompt drift between creator and workflow. | Fork new prompt helpers for Workflow — would duplicate and drift. |
| Rename ordering | Either: (A) land Brief integration first, then Track B rename as pure `git mv`; or (B) land rename first, then Brief integration on `workflow-api.ts`. Commit message must state which. | Both are safe if the rename commit is pure move + import fix with no logic change. | Mix rename + logic in one commit — would obscure review and conflict with `rename` plan's requirement that the rename be a clean move. |

## Recommended Approach

### 1) Backend — `Project.BriefJson` + validation + prompt threading

**Files:** `GeekAPI/Services/Workflow/Domain/Entities/Project.cs`, `GeekRepository/Data/*` (migration), `GeekAPI/Services/Workflow/Services/ContentGenerationOrchestrator.cs` (or the per-content-type handlers it delegates to), `GeekAPI/Services/Workflow/Services/PromptBuilders/ContentPromptBuilder.cs` (call sites only — helpers already exist), `GeekAPI/Controllers/Workflow/ProjectsController.cs` (new `PATCH brief-research` action), `GeekAPI/Services/Workflow/DTOs/GenerationRequest.cs` / `ProjectGenerationContext` if needed for typed audience/angle (already added for creator at `ecc4620` — reuse).

Steps:

1. Add `public string? BriefJson { get; set; }` to `Project.cs`; generate EF migration `AddProjectBriefJson` (nullable `TEXT`); apply via `Database.MigrateAsync` on startup (same pattern as `AddGccCreateBriefResearchJson` at `architecture.md:193`).
2. Add `PATCH /api/projects/{id}/brief-research` — body `{ briefJson: string | null }`. Handler: parse JSON, run `migrateBrief`-equivalent validation on the backend (`ValidateBriefRequired` — check 9 required fields via `contentBriefMissingFields` logic ported to C# or via shared JSON schema; reuse `GccGenerateService.ValidateBriefRequired:155-198` as template). On invalid JSON or incomplete Brief, return `400` with `{ missingFields: string[] }`. On success, persist `Project.BriefJson` and return updated `ProjectDetail`.
3. At the top of each Workflow generate handler (`pillar/plan`, `pillar/body`, `blog`, `social-pack`, `cold-outreach`, `tools`, `image-prompts` — whichever exist as `Workflow` endpoints; confirm by grepping `generate.*pillar|generate.*blog` in `GeekAPI/Controllers/Workflow`), call the same `ValidateBriefRequired` — fail closed with `400` and the missing-fields list. This is the server-side counterpart to the existing UI `briefComplete` gate.
4. Thread the Brief into prompts: where the orchestrator builds `ProjectGenerationContext` / calls `ContentPromptBuilder.BuildArticle*Prompt`, parse `Project.BriefJson` (via `JsonDocument`, as `GccGenerateService.BuildMinimalContext` already does) and pass the extracted `audienceSegment`/`audienceDetails`/`audienceNotes`/`angle`/`primaryIntent`/`buyingStage`/`toneOfVoice`/`eeatSignals`/`lengthBand`/`serpTitles` etc. into `BuildBriefBlock`/`BuildLedeTypeGuidance`/`BuildBriefBodyGuidance`. For handlers that currently pass only `targetKeyword`/`department`/`siteName`, extend the context construction — reuse `GccGenerateService.ExtractBriefFields` if available. No change to the helper bodies themselves (they shipped).
5. Wire `ProjectDetail` DTO to expose `briefJson` (nullable string) so the frontend can hydrate `ContentBriefPanel` from `getProject`.

### 2) Frontend — `ContentBriefPanel` on `Project` + `ContentResults` contract unchanged

**Files:** `src/services/content-writer-api.ts` (or `src/services/workflow-api.ts` after Track B), `src/app/app/workflow/projects/[id]/page.tsx`, `src/components/content-creator/ContentBriefPanel.tsx` (minor prop change), `src/lib/content-creator/brief-catalog.ts` (no `fetch` added).

Steps:

1. Add to `src/services/content-writer-api.ts`:

   ```ts
   export function patchProjectBrief(projectId: string, briefJson: string): Promise<ProjectDetail>
   export function getProjectBrief(projectId: string): Promise<ContentBrief | null> // optional, or just use ProjectDetail.briefJson
   ```

   Implementation: `PATCH /api/projects/${id}/brief-research` with `ApiError` handling (same as `gcc-api.ts:124`). No new file in `src/lib/`.

2. Update `WorkflowProjectPage` (`src/app/app/workflow/projects/[id]/page.tsx:134`):

   - Pass `projectId`, `initialBriefJson={project.briefJson}` (new field on `ProjectDetail`), `onBriefSaved={(json, complete)=> setBriefComplete(complete)}` into `ContentBriefPanel`.
   - Remove the current `createId`-less `ContentBriefPanel` call that writes to detached storage. Hydrate `briefComplete` from `project.briefJson` via `migrateBrief` + `isContentBriefComplete` (same as `CreateDraftWorkspace.tsx:69` does for `GccCreate`).
   - Keep `HierarchyContextPanel` unchanged — `hierarchyOk` and `briefComplete` remain the two gates for `canGenerate`.

3. Update `ContentBriefPanel.tsx` to support a `projectId` mode:

   - New props: `projectId?: string; initialBriefJson?: string | null` (alongside existing `createId`/`clientId` for the creator path — keep both, branch on which is set so the component remains reusable).
   - `useEffect` hydrates from `initialBriefJson` (via `migrateBrief(JSON.parse(...))`) when `projectId` is set, falling back to `loadBriefFromStorage(projectId)` only as an optimistic draft before the first server load.
   - `persistLocal` still writes to `localStorage` for draft resilience, but `save` calls `patchProjectBrief(projectId, briefToJson(brief))` (not `patchBriefResearch` on a `GccCreate`) when in `projectId` mode.
   - Validation message stays: `contentBriefMissingFields(brief)` drives `isContentBriefComplete`.

4. `ContentResults.tsx` — **no change** to its `generatePillarPlanContent` etc. calls. The Brief is now read server-side from `Project.BriefJson` inside the orchestrator, so the frontend does not need to pass it. The `!canGenerate` helper text at `:224` ("Crawl the site...") is already stale after `293da90` — update to "Complete the Content Brief and site hierarchy to enable Generate." (copy fix, not logic).

### 3) Sequencing with Track B rename

- **If this plan lands before Track B:** land it on `src/services/content-writer-api.ts` and `src/components/content-writer/`. The subsequent Track B commit is then a pure `git mv` + import rewrite (no logic).
- **If Track B lands first:** land this plan on `src/services/workflow-api.ts` and `src/components/workflow/`. Either order is acceptable — the commit message must state which path was taken.
- In both cases `src/lib/content-writer/` (empty) is deleted per Track B — no Brief code lives there.

## Work Plan

| Step | Owner | Files | Validation |
|---|---|---|---|
| W0 | Trace | `Project.cs`, `ProjectDetail` DTO, `ProjectsController.cs`, `ContentGenerationOrchestrator.cs`, `ContentPromptBuilder.cs`, `GccGenerateService.cs:155-200`, `src/services/content-writer-api.ts`, `src/app/app/workflow/projects/[id]/page.tsx`, `src/components/content-creator/ContentBriefPanel.tsx`, `src/lib/content-creator/brief-catalog.ts` | Confirm no missed `Project` generate handler; confirm `BuildLedeTypeGuidance`/`BuildBriefBodyGuidance` helpers exist and are reused; confirm frontend has zero `briefJson` on `ProjectDetail` today |
| W1 | Backend — column | `GeekAPI/Services/Workflow/Domain/Entities/Project.cs`, EF migration `AddProjectBriefJson`, `GeekRepository` startup `MigrateAsync` | `dotnet ef migrations add AddProjectBriefJson` creates nullable `TEXT`; `dotnet build GeekAPI/GeekAPI.csproj` green; existing rows load with `BriefJson=null` |
| W2 | Backend — API | `GeekAPI/Controllers/Workflow/ProjectsController.cs`, `GeekAPI/Services/Workflow/Services/ProjectBriefValidator.cs` (or inline in controller/service, reusing `GccGenerateService.ValidateBriefRequired`) | `PATCH /api/projects/{id}/brief-research` persists and returns `{ briefJson }`; invalid JSON → 400; incomplete Brief → 400 `{ missingFields }`; `curl` with `ApiError` handling |
| W3 | Backend — gate | `GeekAPI/Services/Workflow/Services/ContentGenerationOrchestrator.cs` (all `generate/*` handlers) | `POST /api/projects/{id}/generate/pillar/plan` without Brief → 400 `brief required`; with incomplete Brief → 400 `brief incomplete: <list>`; with complete Brief → proceeds (unit test mirrors `scripts/smoke-gcc-api.py:211-226`) |
| W4 | Backend — prompt | `GeekAPI/Services/Workflow/Services/PromptBuilders/ContentPromptBuilder.cs` call sites + `GenerationRequest.cs` / `ProjectGenerationContext` | Logged prompt preview (or test helper) shows `=== BRIEF ===` block with audience/angle/intent/tone/EEAT/length/SERP; `LedeType` guidance reflects angle (e.g. `problem_solution` → anecdotal/scene-setting, `comparative` → question/startling-statement) |
| W5 | Frontend — service | `src/services/content-writer-api.ts` (or `workflow-api.ts`) | `patchProjectBrief` added; `ApiError` on 400 surfaced; no `fetch` in `src/lib/` (grep `fetch(` in `src/lib` → 0) |
| W6 | Frontend — panel | `src/components/content-creator/ContentBriefPanel.tsx`, `src/app/app/workflow/projects/[id]/page.tsx` | Panel hydrates from `project.briefJson` via `migrateBrief`; save writes to `Project`; `canGenerate` reflects `isContentBriefComplete(migrateBrief(JSON.parse(project.briefJson)))` + hierarchy gate |
| W7 | Frontend — copy | `src/components/content-writer/ContentResults.tsx:224` | Disabled helper text no longer mentions "research inputs" (removed at `293da90`) — matches Brief-only messaging |
| W8 | Build | — | `dotnet build GeekAPI/GeekAPI.csproj` green; `npm run build` green (Next 16 App Router — check `node_modules/next/dist/docs/` if App Router conventions are touched) |

Dependencies: W1 → W2 → W3 → W4 (backend chain); W5 → W6 (frontend chain); W0 first; W7 independent; W8 last. Backend and frontend chains can run in parallel after W0.

## Validation Plan

- **Builds (required, both gates):**
  - `dotnet build GeekAPI/GeekAPI.csproj` (or `dotnet build GeekBackend/GeekAPI/GeekAPI.csproj` depending on checkout path — confirm at run time)
  - `npm run build` in `GeekContentCreator` (Next 16 — consult `node_modules/next/dist/docs/` before changing App Router files)
- **API contract (manual + `curl`):**
  - `GET /api/projects/{id}` returns `briefJson: string | null` (new DTO field). Existing projects → `null` (no migration breakage).
  - `PATCH /api/projects/{id}/brief-research` with `briefJson: JSON.stringify(emptyContentBrief())` → `400` with `missingFields` listing the 9 required fields (`Primary intent`, `Buying stage`, `Audience segment`, `Audience notes`, `Angle`, `Call to action`, `Tone of voice`, `E-E-A-T signal`, `Length` — per `brief-catalog.ts:412`).
  - Same endpoint with a complete Brief (all 9 + valid `serpTitles` etc.) → `200` and `project.briefJson` round-trips.
  - `POST /api/projects/{id}/generate/pillar/plan` with `BriefJson=null` → `400 brief required` (fail-closed, matches `scripts/smoke-gcc-api.py:211` expectation for creator).
  - Same generate with `BriefJson` incomplete → `400 brief incomplete: …`.
- **Prompt evidence (backend log or test helper):**
  - Generate a pillar with Brief `angle=problem_solution` + `audienceSegment=affinity` → captured prompt contains `=== BRIEF ===` block with `Audience segment: Affinity Segments`, `Angle: The Problem-Solution Angle`, and lede guidance favouring `Anecdotal`/`SceneSetting`/`DirectAddress` (per `fix-lede-heading-regression-and-lede-taxonomy.md:F3` mapping). Repeat with `angle=comparative` → guidance favours `Question`/`StartlingStatement`/`SingleItem`. Confirms `BuildLedeTypeGuidance` is threaded.
- **Frontend (manual):**
  - Open `Workflow` → pick a project → Brief panel hydrates from `project.briefJson` (no flash of empty form); editing and saving persists via `PATCH` and survives reload; `canGenerate` flips to `true` only when both hierarchy and Brief are complete; `Generate` buttons enable.
  - Direct `POST /api/projects/{id}/generate/pillar/plan` via `curl` without Brief → `400` (proves server gate, not just UI gate).
  - `grep -R "fetch(" src/lib` → 0 (rule `src/lib` vs `src/services` holds).
- **Pre-existing failures:** if a `dotnet build` or `npm run build` failure reproduces on `main` without this change, treat as unrelated and flag.

## Risks / Rollback

- **Risk:** Adding a nullable column + new endpoint is additive, but a bug in `ValidateBriefRequired` could block all Workflow generates (including valid Briefs) if legacy `LEGACY_*` values are not migrated on the backend. **Mitigation:** backend validator reuses `migrateBrief` logic (or calls `migrateBrief` via shared JSON handling) — test with fixtures containing legacy values (`interest_affinity`, `case_study`, `buy`) from `brief-catalog.ts:260-316`.
- **Risk:** Two Brief sources (localStorage draft vs server `Project.BriefJson`) diverge if the operator edits in two tabs. **Mitigation:** server is source of truth; localStorage is draft-only and overwritten on `getProject` load. Document in panel comment.
- **Risk:** Rename churn (Track B) collides with this change. **Mitigation:** land one before the other; the second commit is a pure `git mv` + import fix. State order in commit message; `git status` must show no logic diff in the rename commit.
- **Risk:** `ProjectGenerationContext` threading breaks minimal contexts used in tests/tool generation. **Mitigation:** new Brief-derived fields default to `null`/empty; existing construction sites compile without new args (same pattern as `fix-lede-…:F2`).
- **Rollback:** revert the `AddProjectBriefJson` migration and the controller/handler changes; `Project` rows remain readable (nullable column ignored). Frontend revert is `git revert` of `patchProjectBrief` + panel prop change — no data loss (Brief drafts remain in `localStorage` until re-saved).

## Open Questions

- **Endpoint path:** `PATCH /api/projects/{id}/brief-research` (symmetric with creator's `PATCH /creates/{id}/brief-research`) vs `PUT /api/projects/{id}/brief` — confirm with backend convention (`ProjectsController` currently uses `PUT /hierarchy-context` and `PUT /serp-context`; `PATCH` is used for `creates` — pick one and be consistent).
- **DTO exposure:** should `ProjectDetail.briefJson` be the raw JSON string (like `GccCreate.briefJson`) or a parsed `ContentBrief` object? Keep raw string to mirror creator and avoid double-parsing.
- **SERP on Project:** Workflow's `updateProjectSerpContext` (`content-writer-api.ts:165`) still exists — after this plan the Brief's `serpTitles/Urls`/`relatedSearches`/`paaQuestions` are the canonical SERP fields. Confirm whether `updateProjectSerpContext` is deleted now (SERP lives in the Brief) or kept as a deprecated alias during migration.
- **ResearchJson on Project:** creator has `ResearchJson` (≤3 quoteable destination-page extracts) separate from the Brief. Workflow currently has no `ResearchJson` — confirm it stays Brief-only (per `293da90`) or whether a `Project.ResearchJson` column is also needed for the `research/follow` flow.
