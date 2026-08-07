# Restore Workflow as Step 2, and deepen Site Analyzer heading knowledge

## Context

The app was quietly restructured into a **Site-Analyzer-only** flow across three
commits in `GeekContentCreator`:

- `7a06aa6` — deleted the Start Create form (`CreateStartForm.tsx`, 441 lines) and
  its route (`/app/create`), stripped the Creates list, and rewired Site Analyzer
  to create drafts directly from a selected gap (skip-the-form).
- `192374e` — made Site Analyzer the forced app entry and added a session gate.
- `c2b856d` — renamed "Creates" → "Workflow" (pointed at the list) and replaced
  the gate with `WorkflowGate`.

That restructure was a mistake and should not have been done. The intended product
flow is a **two-step sequence**:

1. **Step 1 — Site Analyzer.** Crawls the site and captures section structure
   (headings). This is genuinely the first step and its data feeds forward.
2. **Step 2 — Workflow** (the "pages and pages of questions" form, formerly called
   "Start Create"). This is the creation step. It must *consume* Site Analyzer's
   heading knowledge — so the target keyword becomes the page's H1 and real
   sub-headings are used in the draft.

> **Naming:** "Start Create" no longer exists as a label — the form is now called
> **Workflow**. This doc uses "Workflow (the form)" for the create form and reserves
> file/component names (`CreateStartForm.tsx`) for the code identifiers only.

**Confirmed problem with heading depth (why Phase B exists):** heading knowledge is
currently shallow — a flat, unlabeled list of strings, not a real h1–h6 outline.

- `RelatedPage.headings` is typed `string[]` (`GeekContentCreator/src/lib/types.ts:4`);
  backend `RelatedPageDto` matches (`GeekAPI/Services/ContentCreator/GccGenerateService.cs:19`).
- The HTML extractor only reads `//h1 | //h2 | //h3` and flattens to strings
  (`GeekAPI/Services/ContentCreator/GccArticleHtmlExtractor.cs:26-35`); h4–h6 are dropped.
- A **richer heading tree already exists server-side** (`GccJobsAndSeo.cs:421-424`,
  "mirrors Geek-SEO's PageSection JSON shape"; walked by `FindHeadingNode`,
  `GccGenerateService.cs:305-371`) but it is flattened to `string[]` when the section
  context / handoff is built, and passed into the prompt as a joined string
  (`GccGenerateService.cs:949-950`).

**Decision (from the user):** do **both** — restore the two-step Workflow first
(Phase A, flat headings), then deepen heading knowledge to full h1–h6 including the
GeekBackend changes (Phase B). Site Analyzer stays the first step; the gate/sequence
is kept, but the gaps-only "skip the form" behavior is removed.

---

## Phase A — Restore Workflow as Step 2 (frontend only, flat headings)

Goal: Site Analyzer (step 1) → **Workflow** (the create form, step 2) → generate. No
more create-straight-from-a-gap.

### A1. Restore the start form + route
- Restore from `7a06aa6^`:
  - `src/components/content-writer/CreateStartForm.tsx` (client, content type, topic,
    notes, department, domain analyze / continue-without-grounding, SA handoff).
  - `src/app/app/create/page.tsx` (Suspense wrapper).
- **Reconcile drift** (this is a revert + fixups, not a clean checkout):
  - `startingContentType` is now `string | null` in both `src/lib/types.ts` and
    `src/lib/gcc-api.ts`, and `createGccCreate`'s param is optional — make the
    restored form emit/tolerate that.
  - Confirm the restored form is compatible with the current
    `src/components/content-writer/CreateDraftWorkspace.tsx` (also edited in `7a06aa6`).
  - Reuse existing utilities as-is: `createGccCreate` (`src/lib/gcc-api.ts`),
    `ClientsPanel` / `getClients` (`src/components/content-writer/ClientsPanel.tsx`),
    `writeSiteSectionHandoff` / `readSiteSectionHandoff` (`src/lib/site-section-storage.ts`).

### A2. Rewire Site Analyzer → Workflow handoff (remove skip-the-form)
- In `src/app/app/site-analyzer/site-analyzer-client.tsx`, replace the direct-create
  path (`createGccCreate(...)` → `router.push('/app/creates/${created.id}')`, ~lines
  222–233) with the pre-`7a06aa6` hop: `writeSiteSectionHandoff(...)` then
  `router.push('/app/create?topic=…&siteAnalysisId=…')`, so the operator answers the
  Workflow questions in step 2.
- Keep SA's Review-gap / section-context / SERP / client-grounding capabilities. SA is
  fuller than "gaps only"; button label → **Open Workflow** (not "Start create").

### A3. Sidebar + gate (keep SA first, fix the unlock bug)
- `src/components/AppSidebar.tsx`: **Workflow → `/app/create`** with `match: "exact"`
  (required — `/app/create` is a string prefix of `/app/creates`; prefix match would
  mis-highlight). Keep **Site Analyzer** as the first nav item / app entry.
- Add a **History** nav item → `/app/creates` (otherwise the detail workspace
  `/app/creates/[id]` has no active nav item and no sidebar route back).
- Keep `WorkflowGate` (SA-first sequence is intended), **but fix the gaps-only unlock**:
  in `site-analyzer-client.tsx` (~lines 112–115) `unlockWorkflow()` currently fires
  only when `gaps.length > 0`. Unlock on any successful SA run so a legitimate zero-gap
  crawl doesn't lock the user out. (Note: the gate is session-only/in-memory, so a
  bookmarked `/app/create` needs an SA run per session — acceptable given SA is step 1.)

### A4. Restore list entry points + copy
- Restore `src/app/app/creates/page.tsx` to `7a06aa6^` behavior (ClientsPanel, client
  filter, CTA → `/app/create?clientId=…`, empty-state link). Restore **both** the
  Workflow CTA and the Image-prompt CTA. Page heading → **History**. Detail
  `/app/creates/[id]` unchanged.
- README / subtitles: happy path = Site Analyzer → Workflow (start form) → Content
  Brief / generate. Mark `docs/plans/site-analyzer-only-create.plan.md`
  **superseded — do not follow**.

**Phase A critical files:** `src/components/content-writer/CreateStartForm.tsx`,
`src/app/app/create/page.tsx`, `src/app/app/creates/page.tsx`,
`src/app/app/site-analyzer/site-analyzer-client.tsx`, `src/components/AppSidebar.tsx`,
`src/lib/types.ts`, `src/lib/gcc-api.ts`.

---

## Phase B — Deepen heading knowledge to full h1–h6 (GeekBackend + frontend)

Goal: carry a real leveled heading outline from crawl → section context → the create
form → generation, so the keyword lands as the H1 and real sub-headings are used.
Much of the depth already exists server-side; the work is mostly *stop flattening it*.

### B1. Capture h1–h6 at the source
- `GeekAPI/Services/ContentCreator/GccArticleHtmlExtractor.cs:27`: extend the selector
  from `//h1 | //h2 | //h3` to `//h1 … //h6`, and capture **level** with text
  (record `{ int Level, string Text }` instead of a bare string). Respect existing
  caps in `GccResearchCaps` (`MaxHeadingsPerPage`, `MaxHeadingChars`).
- Verify/preserve the existing persisted heading tree
  (`GccJobsAndSeo.cs:421-424`, PageSection shape) rather than duplicating it.

### B2. Stop flattening in the DTOs / section context
- `GeekAPI/Services/ContentCreator/GccGenerateService.cs`: change
  `RelatedPageDto.Headings` (line 19) and `SiteSectionContextDto` (line 21) to carry
  leveled headings (e.g. `HeadingDto(int Level, string Text)[]`). Update
  `TryBuildSectionContext` and the section-context endpoint
  (`GccController.cs:1249` `SectionContext`) to emit levels.
- Update the prompt builder that currently joins headings flat
  (`GccGenerateService.cs:949-950`) to render a leveled outline, and set the
  keyword/H1 intent via the existing `SectionOutline` / `DesiredHeadings` fields
  (`GccGenerateService.cs:492, 692`).

### B3. Propagate the leveled shape to the frontend
- `GeekContentCreator/src/lib/types.ts:4`: change `RelatedPage.headings: string[]` to
  the leveled shape matching the backend DTO.
- `src/lib/site-section-storage.ts` (`siteSectionForApi`, ~line 73) and the SA client:
  pass leveled headings through the handoff instead of `string[]`.
- `src/lib/draft-quality.ts`: extend `extractHeadingsFromHtml` (line 68) past h3 to
  h1–h6 and keep the `keyword-in-heading` check (line 139) meaningful against the
  fuller set.
- Surface the outline in the create step (`CreateStartForm.tsx` / `ContentBriefPanel`)
  so the operator sees the real section structure feeding generation.

**Phase B critical files:** `GeekAPI/Services/ContentCreator/GccArticleHtmlExtractor.cs`,
`GeekAPI/Services/ContentCreator/GccGenerateService.cs`,
`GeekAPI/Services/ContentCreator/GccJobsAndSeo.cs`,
`GeekAPI/Controllers/ContentCreator/GccController.cs`;
`GeekContentCreator/src/lib/types.ts`, `src/lib/site-section-storage.ts`,
`src/lib/draft-quality.ts`, `src/components/content-writer/CreateStartForm.tsx`.

---

## Verification

**Phase A (end-to-end in the running app):**
1. `npm run build` / typecheck `GeekContentCreator` — confirm no `startingContentType`
   or `RelatedPage` type drift errors after the restore.
2. Run the app. From a fresh load, Site Analyzer is the entry; Workflow is locked.
3. Run an Analyze that yields gaps → confirm Workflow unlocks and **Open Workflow**
   navigates to `/app/create` (the form), not straight to a draft.
4. Run an Analyze that yields **zero** gaps → confirm Workflow still unlocks (the
   unlock-bug fix).
5. Complete the Workflow form → lands on `/app/creates/[id]`; the History nav item
   is present and highlights on the list, and detail loads.
6. Direct-create-from-gap path no longer exists.

**Phase B:**
1. Backend: `dotnet test` for the GCC services; add/extend a test proving
   `GccArticleHtmlExtractor` captures h4–h6 with levels and that section-context emits
   leveled headings (near `GccSavedSerpParserTests.cs`).
2. Analyze a page with a known h1–h6 structure → inspect the `section-context` API
   response and confirm levels + h4–h6 are present (not a flat string list).
3. Generate a draft from that gap → confirm the target keyword appears as the H1 and
   real sub-headings from the crawl appear in the output; `draft-quality`
   `keyword-in-heading` passes.
