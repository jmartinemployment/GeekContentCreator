# Fix Workflow "Start Content Brief" 400 error — GeekContentCreator-native Client

## Context

Clicking "Start Content Brief" on `/app/workflow` throws a 400:
```
$.clientId: The JSON value could not be converted to Guid
```
`src/app/app/workflow/page.tsx` calls `createGccCreate({ clientId: "default", topic: "Content Brief" })` — `"default"` isn't a GUID, and the workflow page has no real client id available at all.

The previously proposed fix mounted `ContentBriefPanel` and resolved the client through ContentWriterV3's `/api/clients`. The client resolution is rejected: **GeekContentCreator is its own project and must not call into, extend, or share storage with `content-writer-v2` or `ContentWriterV3`.** Where their existing logic is useful, it gets copied and reimplemented under GeekContentCreator's own name.

`ContentBriefPanel` itself is not part of that rejection. Verified directly: it does not exist anywhere in the `content-writer-v2`, `content-writer-v3`, or `content-writer` repos (checked via `find` on all three) — it was built from scratch inside this repo (git log on `src/components/content-writer/ContentBriefPanel.tsx` shows a native commit history: "Wire Content Brief, deep research, and generate to GeekAPI creates", "Ship Google-aligned Content Brief catalogs...", etc.). It is already GeekContentCreator's own code — it only talks to `gcc-api` (currently `@/lib/gcc-api`: `createGccCreate`, `getGccCreate`, `patchBriefResearch`) and its own local catalog, currently at `@/lib/content-writer/brief-catalog` (also native, not fetched from any v2/v3 service). Two naming/placement problems, both real, both fixed below:

1. **Fetch-based clients don't belong in `src/lib/` at all.** `src/lib/` currently mixes real fetch-based API clients (`gcc-api.ts`, `content-writer/api.ts`, `lib/auth/tokens.ts`) with pure utilities (`draft-quality.ts`, `types.ts`, `site-section-storage.ts`) flat, side by side, with no `src/services/` split. §0 below fixes this: creates `src/services/` and moves every fetch-based file there, so `gcc-api` becomes `@/services/gcc-api` and `src/lib/` is left holding only pure utilities.
2. **The `content-writer/` *subfolder* name misattributes ownership.** It reads as "owned by the content-writer-v2/v3 product," and for `lib/content-writer/api.ts` that's true — but for `brief-catalog.ts` and `serp-lens.ts` it's false; they're pure local data/validation with zero network calls that happen to sit in a folder named after a product they don't belong to. §1 below fixes this by moving them (and `ContentBriefPanel.tsx`) to correctly-named paths (`lib/content-creator/brief-catalog`, `components/content-creator/ContentBriefPanel`) that reflect actual ownership.

Both fixes compose: `gcc-api.ts` ends up at `@/services/gcc-api.ts` (fetch client, §0), while `brief-catalog.ts` ends up at `@/lib/content-creator/brief-catalog.ts` (pure data, §1, stays in `lib/` since it does no fetching). This is purely a path/naming move for everything except `ContentBriefPanel.tsx` itself, which gets one small, deliberate logic addition — see §4.

GeekContentCreator already has its own independent backend vertical for this: `ContentCreatorDbContext` (schema `content_creator`), entities/DTOs/repositories/controllers prefixed `Gcc*`, routed at `api/geek-content-creator/*` → `repo/content-creator/*`. `GccCreate.ClientId` is a bare `Guid` — it has always assumed a client already exists, but GeekContentCreator has never had its own `Client` concept; every caller borrowed one from ContentWriterV3. The fix: give GeekContentCreator its own `GccClient`, stored in `content_creator` schema, with zero dependency on ContentWriterV3/content-writer-v2.

## What is being copied vs. what is new

ContentWriterV3's entire client stack is three methods, each duplicated behind two near-identical controllers:

- **`ClientRepository`** — `GeekBackend/GeekRepository/Repositories/ContentWriterV3/WorkspaceRepository.cs:63-101` (implements `IClientRepository`), backed by `ContentWriterV3DbContext.Clients`:
  - `GetByIdAsync(Guid id)` (line 69) — `FirstOrDefaultAsync(c => c.Id == id)`, maps to `ClientDto`.
  - `GetByWorkspaceIdAsync(Guid workspaceId)` (line 75) — list scoped to a workspace, ordered by `CreatedAtUtc` desc.
  - `CreateAsync(CreateClientCommand)` (line 84) — builds `Client { WorkspaceId, Name, CreatedAtUtc, UpdatedAtUtc }`, no trimming/validation, no uniqueness check.
- **Controller pass-throughs** (both call straight into the three methods above, no extra logic):
  - `ClientsController` — `GeekBackend/GeekRepository/Controllers/ContentWriterV3/WorkspacesController.cs:62-100`, routed `repo/content-writer-v3/clients`.
  - `ClientsApiController` — `GeekBackend/GeekAPI/Controllers/ContentWriterV3/WorkspacesClientsController.cs:53-103`, routed `api/content-writer/v3/clients`.
  - `GcwClientsController` — `GeekBackend/GeekAPI/Controllers/Gcw/GcwWorkspacesController.cs:105-189`, routed `api/gcw/clients` (adds workspace-ownership `Forbid()` checks, otherwise same three operations).

**Copied and reimplemented as `GccClient`/`GccClientRepository`:** the `GetByIdAsync` and `CreateAsync` shape above — field mapping (`Id`, `Name`, `CreatedAtUtc`, `UpdatedAtUtc`), dropping `WorkspaceId` (GeekContentCreator has no workspace concept, so no `GetByWorkspaceIdAsync` equivalent is needed).

**New, not present anywhere in ContentWriterV3 to copy from:** a name-based lookup (`GetByNameAsync`) and a unique index on `Name`. ContentWriterV3 only ever looks clients up by `Id` or by `WorkspaceId` — there is no existing "resolve by name" method. This is required because Site Analyzer needs to match an analyzed domain to a client without a workspace picker, so it's designed fresh for GeekContentCreator, not ported.

## Backend — new `GccClient` vertical (GeekBackend repo, external to this checkout)

Structural pattern (DbContext registration, migration shape, DTO/interface/EF-repo/controller layering) mirrors the existing `GccSiteAnalysis` vertical (`GeekRepository/Repositories/ContentCreator/GccSiteAnalysisRepository.cs`, `GeekApplication/Interfaces/ContentCreator/IGccRepositories.cs`, `GeekAPI/HttpClients/HttpGccRepository.cs`) — that part is about following this codebase's own conventions, not about content-writer-v2/v3.

1. **Entity** — `GeekRepository/Data/Entities/ContentCreator/Entities.cs`: add
   ```csharp
   public class GccClient
   {
       public Guid Id { get; set; } = Guid.NewGuid();
       public string Name { get; set; } = string.Empty;
       public string? Notes { get; set; }
       public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
       public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
   }
   ```
2. **DbContext** — `GeekRepository/Data/ContentCreatorDbContext.cs`: add `DbSet<GccClient> GccClients`, table `gcc_clients` in the existing `content_creator` schema, unique index on `Name` (new — see above).
3. **Migration** — new file under `GeekRepository/Data/Migrations/ContentCreator/` (dated after `20260806160000_PurgeOrphanedGccSiteAnalyses`), adding `gcc_clients`.
4. **DTOs** — `GeekApplication/Models/ContentCreator/GccDtos.cs`: add
   `GccClientDto(Guid Id, string Name, string? Notes, DateTime CreatedAtUtc, DateTime UpdatedAtUtc)`
   `CreateGccClientCommand(string Name, string? Notes = null)`.
5. **Repository interface** — `GeekApplication/Interfaces/ContentCreator/IGccRepositories.cs`: add
   ```csharp
   public interface IGccClientRepository
   {
       Task<GccClientDto?> GetByIdAsync(Guid id, CancellationToken ct = default);       // copied shape from ClientRepository.GetByIdAsync
       Task<GccClientDto?> GetByNameAsync(string name, CancellationToken ct = default); // new — no ContentWriterV3 equivalent
       Task<GccClientDto> CreateAsync(CreateGccClientCommand command, CancellationToken ct = default); // copied shape from ClientRepository.CreateAsync
   }
   ```
6. **EF repository** — new `GeekRepository/Repositories/ContentCreator/GccClientRepository.cs`. `GetByIdAsync`/`CreateAsync` follow `ClientRepository`'s structure (`GeekRepository/Repositories/ContentWriterV3/WorkspaceRepository.cs:69-97`) minus `WorkspaceId`. `GetByNameAsync` is new: trimmed, case-insensitive match on `Name` (`CreateAsync` also trims `Name` before saving — ContentWriterV3's version doesn't trim; adding it here since `Name` is now a uniqueness/lookup key, which it wasn't in ContentWriterV3).
7. **GeekRepository controller** — new `GeekRepository/Controllers/ContentCreator/GccClientsController.cs`, `[Route("repo/content-creator/clients")]`, `[Authorize(Policy = RepositoryAuthConstants.InternalServicePolicy)]` (mirror `GccCreatesController.cs`'s attribute/DI shape, not ContentWriterV3's): `GET {id:guid}`, `GET ?name=`, `POST`.
8. **GeekAPI HTTP client** — `GeekAPI/HttpClients/HttpGccRepository.cs`: add `GetClientByIdAsync`, `GetClientByNameAsync`, `CreateClientAsync`, following the existing `GetSiteAnalysisAsync`/`GetLatestSiteAnalysisByDomainAsync`/`CreateSiteAnalysisAsync` methods' `GetAsync`/`PostAsync` helper usage, calling `repo/content-creator/clients/...`.
9. **GeekAPI controller** — `GeekAPI/Controllers/ContentCreator/GccController.cs` (already routed `api/geek-content-creator`): add
   - `GET clients?name=` → `_repo.GetClientByNameAsync(name)`
   - `POST clients` → `_repo.CreateClientAsync(command)`

## Frontend — this repo (GeekContentCreator)

### 0. Move all fetch-based methods to `src/services/`

**Decision (from the user):** fetch/API methods in `src/lib/` are disabled for use going forward and will eventually be deleted outright — this isn't a style preference, it's a hard rule. `src/lib/` is pure utilities only, permanently; no new fetch/API method may be added there again. This move is the first step of that: relocate every fetch-based file out now.

Create `src/services/` directory and move:

- `src/lib/gcc-api.ts` → `src/services/gcc-api.ts`
- `src/lib/content-writer/api.ts` → `src/services/content-writer-api.ts`
- `src/lib/auth/tokens.ts` → `src/services/auth-tokens.ts`

Update all imports across the codebase to reference `@/services/*` instead of `@/lib/*`. Run `npx tsc --noEmit` to catch missed imports.

### 1. Fix misleading naming: move native code out of `content-writer/` folders

Audited every file in `src/components/content-writer/` and `src/lib/content-writer/` for what they actually depend on (not just where they sit):

| File | Depends on ContentWriterV3? |
|---|---|
| `components/content-writer/ContentBriefPanel.tsx` | No — only `ApiError` (generic error class) + `gcc-api.ts` |
| `components/content-writer/CreateAiToolsPanel.tsx` | No — same |
| `components/content-writer/CreateDraftWorkspace.tsx` | No — same |
| `components/content-writer/CreateKeywordUploadPanel.tsx` | No — same |
| `components/content-writer/SerpIngestPanel.tsx` | No — same |
| `components/content-writer/ClientsPanel.tsx` | **Yes** — imports `createClient` from `content-writer/api.ts` |
| `lib/content-writer/brief-catalog.ts` | No — pure native brief catalog/validation |
| `lib/content-writer/serp-lens.ts` | No — pure native SERP/PAA types |
| `lib/content-writer/types.ts` | Mixed: `Project`/`GeneratedContent` etc. from v3 (stay), `LENGTH_BAND_OPTIONS` (move to brief-catalog) — **merge into `lib/types.ts`, delete file** |
| `lib/content-writer/api.ts` | **Yes** — this *is* the ContentWriterV3 HTTP client (`getClients`, `createProject`, `generateBlogContent`, etc.) |

The five "No" components and two "No" lib files are native GeekContentCreator code that only ended up under a `content-writer/` path by accident of naming. Move them out — unmodified in logic, except `ContentBriefPanel.tsx`, which gets the small keyword-field addition described in §4:

- `git mv src/components/content-writer/{ContentBriefPanel,CreateAiToolsPanel,CreateDraftWorkspace,CreateKeywordUploadPanel,SerpIngestPanel}.tsx src/components/content-creator/`
- `git mv src/lib/content-writer/brief-catalog.ts src/lib/content-writer/serp-lens.ts src/lib/content-creator/`
- **Merge types files:** Move all type definitions from `src/lib/content-writer/types.ts` into `src/lib/types.ts` (consolidating both GeekContentCreator native types and ContentWriterV3 DTOs into one shared file), then delete `src/lib/content-writer/types.ts`. Extract `LENGTH_BAND_OPTIONS` (and its type) out of the merged `src/lib/types.ts` into `src/lib/content-creator/brief-catalog.ts` (the only file that uses it).
- `ApiError` currently lives in `lib/content-writer/api.ts` (moving to `src/services/content-writer-api.ts` per §0) and is imported by `gcc-api.ts` and all five moved components. Move `ApiError` into `src/services/gcc-api.ts` (the most-used entry point), and repoint every moved component's `ApiError` import to `@/services/gcc-api`.
- `git mv` alone doesn't fix imports — update the moved files' own internal imports too, not just external call sites: `ContentBriefPanel.tsx`'s `import {...} from "@/lib/content-writer/brief-catalog"` → `@/lib/content-creator/brief-catalog`, and `import { LENGTH_BAND_OPTIONS } from "@/lib/content-writer/types"` → `@/lib/content-creator/brief-catalog` (since it moves there per the bullet above); same sweep for any `content-writer/serp-lens` or cross-references among the five moved components (e.g. `ContentBriefPanel` imports `CreateKeywordUploadPanel` from the same directory — that import stays relative-equivalent once both move together, but verify each moved file's imports of siblings still resolve after the move). Also update any imports of `@/lib/content-writer/types` to `@/lib/types` (the merged file).
- Update the handful of external import sites accordingly: `src/app/app/creates/[id]/page.tsx` (→ `CreateDraftWorkspace`), `src/app/app/site-analyzer/site-analyzer-client.tsx` (→ `SerpIngestPanel`).
- Leave `ClientsPanel.tsx` where it is (`src/components/content-writer/ClientsPanel.tsx`) — it's the one component that's genuinely ContentWriterV3-coupled (imports `createClient`). Its import updates to `@/services/content-writer-api` per §0's move, but the component itself doesn't relocate. `api.ts` itself does not stay in `lib/` — per §0 it already moves to `src/services/content-writer-api.ts` (path only, logic untouched); after that move, `src/lib/content-writer/` is empty and can be deleted.
- Run `npx tsc --noEmit` after the move as the concrete check that every import was caught — this is the kind of change static typing catches immediately, so there's no need to manually enumerate every reference.

### 2. `src/services/gcc-api.ts`: add client resolution + `ApiError`

```ts
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); this.name = "ApiError"; } } // consolidated here, see §1
export interface GccClient { id: string; name: string; notes: string | null; createdAtUtc: string; updatedAtUtc: string; }
export function getGccClientByName(name: string): Promise<GccClient | null> { ... } // GET /api/geek-content-creator/clients?name=
export function createGccClient(input: { name: string; notes?: string }): Promise<GccClient> { ... } // POST /api/geek-content-creator/clients
```
Both follow the existing `gccRequest` helper already in this file — no new fetch plumbing needed.

### 3. Site Analyzer → Workflow handoff

`src/app/app/site-analyzer/site-analyzer-client.tsx`: in `pollUntilDone()`, right after a successful analyze (where `unlockWorkflow()` is currently called), resolve the analyzed domain to a `GccClient`: try `getGccClientByName(domain)`, fall back to `createGccClient({ name: domain })` (both from `@/services/gcc-api`). Write the resolved `clientId` + `domain` into a small new sessionStorage handoff (new export in `src/lib/site-section-storage.ts` — this file stays in `lib/`, it's pure sessionStorage read/write, no fetch — e.g. `writeWorkflowClientHandoff`/`readWorkflowClientHandoff`, a distinct key from the existing `SiteSectionHandoff`/`gcc.siteSectionContext` used by the gap-detail flow — keeping them distinct matters, see §4).

**Remove the "Optional seed topic" input.** Now that the keyword is exclusively supplied on Content Brief (§4), the `seedTopic` field on the Site Analyzer form (`site-analyzer-client.tsx:277-283`, state at line 46, sent as `seedTopic: seedTopic || null` at line 150) no longer has a purpose — it was a second, conflicting place to enter a topic/keyword. Remove the `<input>`, the `seedTopic` state, and stop sending it in the analyze POST body (send `seedTopic: null`, or drop the field from the request body entirely — it's already optional server-side, so this is frontend-only, no backend change). Site Analyzer's form is left with just the domain input.

### 4. `src/app/app/workflow/page.tsx`: mount `ContentBriefPanel` (moved, from §1) instead of the hardcoded create

**Correction (from the user):** the client id comes from Site Analyzer's domain entry (§3, already correct — `getGccClientByName(domain)`/`createGccClient({ name: domain })`), but the keyword does **not** get collected upfront on the Workflow page. It is `null`/empty going into Content Brief, and is to be supplied **on** Content Brief — i.e., inside `ContentBriefPanel` itself, not via a separate gating input beforehand.

This means `ContentBriefPanel` is not fully "reused as-is, unmodified" — it needs one small addition, because there is currently no path to supply or edit that keyword anywhere else: checked `CreateDraftWorkspace.tsx:233,253` — `detail.topic` (the create's title) is rendered as a read-only `<h1>` and passed straight through as `targetKeyword` when reopening an existing create. There is no rename/edit UI anywhere in the app. If Workflow mounted `ContentBriefPanel` with an empty `targetKeyword` and nothing else changed, `ensureCreateId()`'s `topic: targetKeyword.trim() || "untitled"` (`ContentBriefPanel.tsx:237`) would permanently title the create "untitled" with no way to ever fix it.

**Fix:** add a "Target keyword" field to `ContentBriefPanel` itself (small, contained addition — one new controlled input near the top of the form, required for `isContentBriefComplete`), backed by its own local state seeded from the `targetKeyword` prop (empty when opened from Workflow, pre-filled when reopening an existing create from `CreateDraftWorkspace`). `ensureCreateId()` uses that local state instead of the raw prop when building the `topic`. This is the one deliberate exception to "unmodified in logic" — necessary because Workflow no longer pre-collects it and nothing else in the app ever will.

- Read the handoff via `readWorkflowClientHandoff()`. If missing, keep the existing locked/"run Site Analyzer" messaging.
- Render `<ContentBriefPanel clientId={handoff.clientId} targetKeyword="" onBriefSaved={(createId) => router.push(`/app/creates/${createId}`)} onBriefValidityChange={...} />` immediately once the handoff is present — no separate topic-collection step on the Workflow page (import from its new path, `@/components/content-creator/ContentBriefPanel`).
- **Stale-handoff guard, required, not optional:** `sessionStorage` is scoped to the browser tab, not to which page wrote it. If a user opened a gap in Site Analyzer (writing the `gcc.siteSectionContext` handoff via `writeSiteSectionHandoff`) and then navigated to `/app/workflow` without completing that gap's "Start create", the handoff is still sitting there. `ContentBriefPanel`'s `ensureCreateId()` (`ContentBriefPanel.tsx:225-249`) reads it via `readSiteSectionHandoff()` unconditionally and, if present, silently attaches that unrelated gap's `siteAnalysisId`/`siteSection` to the Workflow-initiated create — wrong grounding data on the wrong create, not a 400, which is worse because it fails silently. Fix: before rendering `ContentBriefPanel`, `workflow/page.tsx` must call the existing `clearSiteSectionHandoff()` (`@/lib/site-section-storage`, already exported) once on mount, so Workflow-initiated creates are never contaminated by a leftover gap-detail handoff. With that guard in place, `ensureCreateId()` calls `createGccCreate({ clientId, topic, siteSection: null })` — a real GUID `clientId`, no 400, no cross-flow leakage.
- Remove the old silent `console.error` — errors now surface through `ContentBriefPanel`'s own `setError`/`onBriefSaved(id, false)` path.

## Out of scope (explicitly not touched)

- `src/components/content-writer/ClientsPanel.tsx`, `src/services/content-writer-api.ts` (moved from `lib/content-writer/api.ts` per §0, path only — logic untouched) — untouched (genuine ContentWriterV3 client surface).
- Site Analyzer gap-detail "Start create" (`startCreate`/`doCreate`, its `getClients()`/`<select>` client picker) — still ContentWriterV3-backed; not migrated in this fix.
- No changes to `content-writer-v2` or `ContentWriterV3` code.

## Verification

- Backend: `dotnet build` on GeekRepository + GeekAPI clean; new migration applies.
  - `POST repo/content-creator/clients` then `GET ?name=` round-trips a client.
  - `GET api/geek-content-creator/clients?name=<unseen>` → 404/null (no match); `POST` creates; re-`GET` by same name returns it (idempotent resolve pattern for re-analyze).
- `npx tsc --noEmit` clean in this repo.
- Workflow locked with no Site Analyzer run in session → existing locked message, unchanged.
- Analyze a new domain → Site Analyzer unlocks Workflow and a `GccClient` is created with `name` = domain; sessionStorage handoff written.
- Re-analyze the same domain → no duplicate `GccClient` (resolved via `getGccClientByName`).
- Site Analyzer's form shows only the domain input — no "Optional seed topic" field, and the analyze request no longer sends a populated `seedTopic`.
- `/app/workflow` → `ContentBriefPanel` renders immediately (unlocked, handoff present), keyword field empty — no separate topic-collection step first. Fill in the keyword field plus required brief fields → "Save brief for generate" → `createGccCreate` receives a real GUID `clientId` and the keyword-field value as `topic` → no 400 → redirected to `/app/creates/{id}` with the correct title (not "untitled").
- Errors (e.g. handoff missing/expired) are shown on the page, not just logged.
- **Stale-handoff regression check:** open a gap in Site Analyzer (writes `gcc.siteSectionContext`), navigate away to `/app/workflow` without starting that create, submit a Workflow brief → the resulting `GccCreate` has `siteAnalysisId: null` / `siteSectionJson: null` (not the abandoned gap's data).
- Gap-detail "Start create" path unaffected (still using the old ContentWriterV3 client picker, unchanged).
