# Retire the content-writer merge for Workflow; own generation in GeekAPI; fix Tools duplication

## Context

Clicking **"Write Body"** on a pillar (`POST /api/projects/{id}/generate/pillar/body`,
proxied by GeekContentCreator's `/api/cw/[...path]` to GeekAPI) failed with an
OpenAI **429** surfaced to the browser as **502**:

```
OpenAI request failed (429): Rate limit reached for gpt-4o … tokens per min
(TPM): Limit 30000, Used 24624, Requested 7633. Please try again in 4.5s.
```

Chasing this down surfaced several compounding problems; this plan fixes all of
them together since they're structurally linked.

### Problem 1 — the Workflow product still reuses content-writer's backend directly

**Rule (recorded in memory as `feedback_no_content_writer_reuse`, blanket across
versions):** GeekAPI must not call into **any** content-writer repo's backend
methods — content-writer-v2, content-writer-v3, or the unversioned
`content-writer` — even when the source is itself deprecated. Needed logic is
**copied** into GeekAPI's own codebase, all the way down the dependency chain
(orchestration *and* the provider/DTO plumbing underneath it), never left as a
project reference.

That rule is currently **violated** for the Workflow product. `GeekAPI.csproj`
project-references all four content-writer-v2 assemblies and wires their
controllers straight into GeekAPI's own pipeline via `AddApplicationPart`:

```
GeekAPI.csproj:23-29   ProjectReference → ContentWriter.{Domain,Application,Infrastructure,Api}
                        // "content-writer-v2 merge, Phase 1 (GeekBackend/AGENTS.md § Service topology)."
Program.cs:39           .AddApplicationPart(typeof(ContentWriter.Api.Controllers.ProjectsController).Assembly)
```

So `/api/projects/{id}/generate/*` (Workflow's routes) are **not** GeekAPI
code — they're content-writer-v2's `GenerateController` →
`ContentGenerationOrchestrator`, merely hosted inside GeekAPI's process. The
comment points at "GeekBackend/AGENTS.md § Service topology" as the doc of
record — but that section only covers GeekOAuth/GeekRepository/GeekAPI trust
boundaries and **says nothing about content-writer**. The documentation the
merge promised was never written; fixed here (Part 0).

**Pre-existing debt, same violation:** GCC (`GeekAPI/Services/ContentCreator/GccGenerateService.cs`,
GeekAPI-owned at the orchestration layer) still project-references
content-writer-v2 for low-level primitives (`IContentGenerationProvider`,
`ChatCompletionRequest`, provider clients, schema-builder interfaces). Named
explicitly; full remediation follows once Part 1's copies exist (fast
follow-up, not blocking this plan).

### Problem 2 — the pillar body over-generates, and Tools work is duplicated

One "Write Body" click makes **~9–11 sequential gpt-4o calls**, and **~5–6 are a
Tools section** (`GenerateToolsSectionAsync`: 1 platform-list call + one call
per platform). Each re-sends context and reserves `max_tokens`, so the running
total crosses the 30,000 TPM cap and a later call 429s.

That Tools work is also **redundant**: Step 6 "Tool Documents" already
regenerates the authoritative tool pages from names it reads back out of the
pillar's own Tools section — the pillar spends ~6 calls building a section whose
only job is to seed names Step 6 immediately regenerates.

Separately, the tool names already exist **upstream** and are discarded: the
Site Analyzer hierarchy node carries a paragraph like
`Top AI Content Creation Tools: Jasper, Copy.ai, ChatGPT, Claude`
(`PageSectionNode.paragraphs`), but GeekContentCreator's hierarchy-match capture
keeps child **headings** only and drops the **paragraphs**
(`src/lib/content-creator/hierarchy-match.ts:98-105`) — so generation never sees
the list, which is *why* the pillar re-invents it with an LLM call.

### Problem 3 — the pillar's JSON-LD build mechanism won't survive Problem 2's fix

The pillar's existing JSON-LD construction reads **its own inline Tools
section text** (`ToolSectionExtractor.ExtractApplications` scans H3 headings the
pillar itself generated) to build `SoftwareApplication` entries, then does a
**post-hoc rebuild** once Step 6 creates real tool pages with real URLs
(`ContentGenerationOrchestrator.cs:238-248`). Once the pillar stops generating
an inline Tools section (Problem 2's fix), that extraction has **nothing left to
scan** — the JSON-LD construction must be reworked, not just "no longer need a
rebuild."

### Goal

1. GeekAPI owns Workflow's generation as its own code — no content-writer
   dependency, at any depth.
2. The pillar stops *generating* tools (~6 calls → 0) and *references* real,
   saved tool data instead; Site Analyzer's tools paragraph stops being thrown
   away and is persisted where generation can read it.
3. Every content type gets correct structured data, built from real data in one
   pass — including the three that have none today.

## Part 0 — Document the rule (both repos)

**Blanket, not scoped to one version:** GeekAPI must not reuse methods from
**any** content-writer repo — v2, v3, or unversioned — even when the source is
itself deprecated. Needed logic is always copied into GeekAPI's own codebase,
all the way down the dependency chain.

- **`GeekBackend/AGENTS.md`** — add a subsection under/near **§ Service
  topology & trust boundaries** stating this rule by name (v2/v3/unversioned),
  including that GeekAPI does not project-reference or `AddApplicationPart` any
  content-writer repo's controllers/services to run them as its own. Note this
  retires the "content-writer-v2 merge, Phase 1" comment in `GeekAPI.csproj`
  (which pointed at this doc before the doc said anything) — link this
  migration as the resolution.
- **`GeekContentCreator/AGENTS.md`** — add a short note next to the existing
  `src/lib/` vs `src/services/` boundary rule: the backend this app talks to
  (GeekAPI) does not reuse any content-writer repo's methods either.

## Part 1 — Copy Workflow's generation surface from content-writer-v2 into GeekAPI

Mirror the existing, already-correct GCC pattern: new GeekAPI-owned
controllers/services parallel to `Controllers/ContentCreator` /
`Services/ContentCreator`, e.g. `Controllers/Workflow/` and `Services/Workflow/`.

**Route templates stay byte-for-byte identical**
(`api/projects/{projectId:guid}/generate/...`,
`api/projects/{projectId:guid}/keyword-sources`, etc.) so GeekContentCreator's
`/api/cw` proxy and `src/services/content-writer-api.ts` need **zero** changes.

Copy (not reference), full depth, no shared-plumbing exception:
- `ContentGenerationOrchestrator` (all `GenerateXAsync` methods) → GeekAPI's
  own orchestrator.
- `GenerateController`, `ProjectsController`, `KeywordSourcesController` →
  GeekAPI-owned controllers.
- `ToolPageGenerator`, `ToolSectionExtractor`, `ContentPromptBuilder`,
  `ResearchBriefBuilder`, `ContentLengthTargets`,
  `PillarOutlineNormalizer`/`PillarSectionClassifier`, `LlmResponseJsonParser`.
- The `Project`/`KeywordSource` domain entities and their store, using GeekAPI's
  own persistence conventions.
- The low-level LLM plumbing: `IContentGenerationProvider`,
  `ChatCompletionRequest`, `OpenAiProvider`/`AnthropicProvider`/`GroqProvider`/`LmStudioProvider`,
  `LlmConcurrencyGate`, and all schema-builder interfaces/implementations
  (`ISoftwareApplicationSchemaBuilder`, `ITechnicalArticleSchemaBuilder`,
  `IBlogPostingSchemaBuilder`).

Once copied and routed, GeekAPI drops the
`ContentWriter.Api`/`Application`/`Domain`/`Infrastructure` `ProjectReference`s
entirely for the Workflow surface.

**Fast follow-up (named, not blocking):** repoint GCC's `GccGenerateService` at
these same GeekAPI-owned copies so GeekAPI can drop the content-writer-v2
references altogether — the copies already exist after Part 1 lands, so this
is comparatively small.

## Part 2 — Site Analyzer: preserve and persist the hierarchy tools paragraph

The tools list is Site Analyzer's data; stop discarding it.

- `src/lib/content-creator/hierarchy-match.ts` — `childHeadings` is built from
  headings only (`:98-105`), dropping `node.paragraphs` (`:5`). Carry the
  matched node's paragraphs through `HierarchyMatch` and parse the
  `Top [X] Tools: a, b, c, d` pattern into a structured tool-name list.
- Verify the underlying page-section-tree source (GeekAPI's Site Analyzer
  endpoints) actually populates `paragraphs` for the tools node end-to-end; fix
  there if stripped before reaching the frontend.
- No fallback: if a matched node has no such paragraph, the tool set is simply
  empty — never LLM-invented.
- **Persistence:** add a new field, e.g. `HierarchyToolNames`, to **Part 1's**
  GeekAPI-owned `Project` entity/`ProjectsController`, alongside the existing
  `HierarchyPath`/`HierarchyChildHeadings`/`HierarchySourcePageUrl`. Save it
  through the same call `HierarchyContextPanel.tsx`'s `persistSelection`
  already makes when the operator selects a hierarchy match, and thread it
  through `src/services/content-writer-api.ts`'s hierarchy-save function
  alongside `hierarchyChildHeadings`. Without this, the parsed list never
  reaches generation. This is why Part 2 depends on Part 1's `Project`/
  `ProjectsController` copy landing first.

## Part 3 — Step 3 upload: Tools category + OpenAI extraction saved to DB

In **Part 1's** GeekAPI-owned `KeywordSourcesController`, reuse its existing
upload → parse → persist shape (parse on upload, save the result on the entity,
same request):

- Add a **`Tools`** category (backend enum + frontend
  `KEYWORD_SOURCE_CATEGORIES` in `src/lib/types.ts`, surfaced in
  `FileUploadPanel.tsx`) — multi-file upload, one HTML page per tool.
- On upload with `category == Tools`: call OpenAI (via Part 1's copied provider
  plumbing) to extract structured per-tool research (what it does, features,
  use cases, positioning, pricing) and persist it on the keyword-source record
  as a new field, e.g. `ExtractedToolResearchJson`. One call per uploaded tool,
  **user-paced** across upload clicks — never stacks into the pillar's
  per-minute burst.
- Reconcile against Part 2's persisted hierarchy tool set: if the uploaded
  tools disagree with `HierarchyToolNames`, surface a visible warning to the
  operator — never silently pick one.

## Part 4 — Pillar body: stop generating Tools; weave mentions from persisted research

In Part 1's copied orchestrator/prompt builder:

- Remove Tools section generation from the pillar body path entirely — no
  platform-list call, no per-platform loop. Pillar-body Tools calls **~6 → 0**.
- Feed Part 3's persisted `ExtractedToolResearchJson` + Part 2's
  `HierarchyToolNames` into the pillar body prompt as grounding context,
  instructing the model to reference the specific tools **by name wherever each
  is contextually relevant across the sections** — recurring where relevant,
  discussed substantively. **Not** a re-listed roll-call, **not** a single
  first-occurrence mention. This rides along in the section/batch calls that
  already run — **no new LLM calls**.

## Part 5 — Tools step: per-tool documents + "Top X Tools for [topic]" roundup

- Change the Tools step's name source from "read the pillar's Tools section" to
  **Part 2's `HierarchyToolNames`** / Part 3's uploaded set — decoupling it from
  the pillar body.
- Each per-tool document is generated by **reading Part 3's persisted
  `ExtractedToolResearchJson`** — not the raw HTML, and not a fresh extraction
  pass. One generation call per tool: persisted research → document prose.
- The **"Top AI Tools for [topic]" roundup** is its own generated document that
  lists/links each per-tool document, likewise built by reading each tool's
  persisted research.

## Part 6 — Tools JSON-LD: build from real tool data in one pass (not text-scraped, not rebuilt)

JSON-LD is **not removed** — it's structured data this app deliberately
maintains. What changes is its input.

- The pillar's `SoftwareApplication` entries currently come from
  `ToolSectionExtractor` scanning the pillar's own inline Tools section text —
  which Part 4 removes. Rework `SoftwareApplicationSchemaBuilder`'s pillar-side
  call to build entries directly from **Part 5's `ToolPost` records** (name,
  description, real URL — already correct at creation, no placeholder-then-patch).
  This replaces the current build-once-with-missing-URLs +
  `ContentGenerationOrchestrator.cs:238-248` post-hoc-rebuild pattern with a
  single correct pass.
- The listed Tools section in the page layout **stays** — composed from Part 5's
  `ToolPost` data at render time, same source as the JSON-LD.

## Part 7 — Complete JSON-LD coverage: Social, Email, Advertising

Extend the existing one-schema-builder-per-content-type pattern
(`ITechnicalArticleSchemaBuilder`, `IBlogPostingSchemaBuilder`,
`ISoftwareApplicationSchemaBuilder`) to the types that currently have none,
all as Part 1 GeekAPI-owned code:

- **Social** (`SocialFacebook`/`SocialLinkedIn`) → new
  `ISocialMediaPostingSchemaBuilder` → `schema.org/SocialMediaPosting`, wired
  into `GenerateSocialAsync`'s existing content rows.
- **Email** (`EmailColdOutreach`, and the stubbed
  Newsletter/StoryNurture/Transactional) → new `IEmailMessageSchemaBuilder` →
  `schema.org/EmailMessage`, wired into `GenerateColdOutreachAsync`.
- **Advertising** → **new content type + generation path** (none exists today —
  only the `AdvertisingSummary` field, with nothing to attach a schema to).
  Add an `Advertising` `GeneratedContentType`, a `GenerateAdvertisingAsync`
  step (mirroring the existing per-type generate methods), and
  `IAdvertiserContentArticleSchemaBuilder` →
  `schema.org/AdvertiserContentArticle` (`Thing > CreativeWork > Article >
  AdvertiserContentArticle`). **Verify during implementation** whether any
  partial ad-type scaffolding (e.g. Google/Meta ad variants) already exists
  elsewhere in the codebase before building fresh — not confirmed either way
  going into this plan.

## Verification

1. **Builds**: `dotnet build GeekBackend/GeekAPI` clean with the new
   `Controllers/Workflow` / `Services/Workflow`; `npm run build` in
   GeekContentCreator clean (frontend routes unchanged).
2. **No content-writer reuse for Workflow**: `/api/projects/{id}/generate/*`
   requests execute GeekAPI's own namespace, not `ContentWriter.Api.*`.
3. **Site Analyzer + persistence (Part 2)**: for a keyword whose hierarchy has
   `Top … Tools: …`, confirm the parsed list is captured, saved via
   `persistSelection`, and present on the project (`HierarchyToolNames`).
4. **Upload (Part 3)**: upload N tool HTML pages under Tools; confirm one
   OpenAI extraction per file, persisted as `ExtractedToolResearchJson`;
   confirm the hierarchy/upload mismatch warning fires when they disagree.
5. **Pillar body (Part 4)**: generate a pillar; confirm **0** tool-specific LLM
   calls, prose **names the specific tools across multiple sections** (not a
   list, not one mention), total pillar-body calls drop ~9–11 → ~4–5 — no more
   30k-TPM 429 on a normal run.
6. **Tools step + JSON-LD (Parts 5, 6)**: confirm per-tool docs and the roundup
   read persisted research (not re-extracted); confirm pillar and tool-page
   JSON-LD both build correctly in one pass with real URLs, no rebuild step.
7. **Schema coverage (Part 7)**: confirm Social, Email, and the new Advertising
   type each produce valid, type-correct JSON-LD.
8. **End-to-end**: run "Write Body" on the test keyword; confirm no 429/502.

## Repos / files touched

- **GeekBackend/GeekAPI**: `AGENTS.md`; `GeekAPI.csproj` (drop content-writer
  references once migrated); new `Controllers/Workflow/`, `Services/Workflow/`
  (Parts 1–7); Site Analyzer page-section-tree source (Part 2, only if it
  strips paragraphs).
- **GeekContentCreator**: `AGENTS.md`; `src/lib/content-creator/hierarchy-match.ts`;
  `src/components/content-writer/HierarchyContextPanel.tsx`;
  `src/components/content-writer/FileUploadPanel.tsx`; `src/lib/types.ts`;
  `src/services/content-writer-api.ts`.
- **content-writer-v2**: unmodified — reference/legacy only, per Part 1.
