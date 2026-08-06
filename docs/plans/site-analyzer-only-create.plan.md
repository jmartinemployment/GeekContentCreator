# Plan: Site Analyzer-only create — delete Start Create, strip Creates

## Goal
Make **Site Analyzer the only enabled create entry**. `Creates` stays labelled `Creates` (no rename to Workflow/History) but becomes a pure history/workflow list. Most runs start with Site Analyzer before anything, so standalone create path is deleted. 6 prior attempts failed — this plan is deletions-only, with no renames, no new fallbacks.

## Related requirements
- Site Analyzer is only enabled option.
- Delete Start Create (route + button/nav).
- Delete Site Analyzer button from Creates (remove any CTA/text that duplicates SA entry).
- Remove workflow selector from Creates.
- Remove clients selector from Creates.
- Creates becomes x Workflow functionally (history list) but keeps the `Creates` label/slug.

## Success Criteria (checkable)
- [ ] Sidebar has exactly 2 items: `Creates` (`/app/creates`) and `Site Analyzer` (`/app/site-analyzer`). No `Start create` entry.
- [ ] `GET /app/create` does not render a form — returns 404 (or redirects to `/app/site-analyzer` if we choose soft-delete). No dead `router.push('/app/create...')`.
- [ ] `/app/creates` renders with **no** `ClientsPanel`, **no** client filter state, **no** `Start a create` / `Image prompt` buttons, and **no** `"or pick a Site Analyzer gap"` text. Lists all creates unfiltered (or server-filtered) and links to `/app/creates/[id]`.
- [ ] Gap → create works end-to-end without touching `/app/create`: Analyzer `Review gap` → `Start create` calls `createGccCreate` directly and lands on `/app/creates/:id`.
- [ ] `npm run build` and `npm run lint` pass; `grep -r "app/create" src` returns zero (or only a redirect stub).
- [ ] Existing `/app/creates/[id]` detail (draft workspace) still works.

## Context and current facts (grounded)
- `src/components/AppSidebar.tsx:6-9` — nav array has 3 entries: `Creates` (prefix), `Start create` (exact `/app/create`), `Site Analyzer` (prefix). Brand link points to `/app/creates`.
- `src/app/app/create/page.tsx:1-18` — thin wrapper around `CreateStartForm` inside `<Suspense>`. Sole route for standalone create.
- `src/components/content-writer/CreateStartForm.tsx` — 441 lines. Handles two modes: (a) SA handoff (`siteAnalysisId` + `SiteSectionHandoff.relatedPages` required, `saRequired`/`sectionOk` gates line 119-120) and (b) manual domain path (`domain` input, `Analyze now` / `Continue without grounding`, `checkOrAnalyzeDomain` polling 138-173). Also handles `startingContentType`, `department`, `notes`, client picker, and `seedBriefFromHandoff`. Only consumed by `src/app/app/create/page.tsx`.
- `src/app/app/creates/page.tsx:1-135` — client-filtered history. Imports `ClientsPanel`, `getClients`, `listGccCreates`. State: `clients`, `selectedClientId`, `creates`. Effects: `getClients()` + `listGccCreates()`. Header CTAs: `Image prompt` and `Start a create` links to `/app/create` with `clientId`/`type` query (58-79). Body: `<ClientsPanel>` block (84-93). Empty state `Start a create` link (99-108) plus text `or pick a Site Analyzer gap.` (109). List filters by `selectedClientId` (41-43).
- `src/app/app/site-analyzer/site-analyzer-client.tsx:183-215` — current `startCreate()` does `writeSiteSectionHandoff(...)` then `router.push('/app/create?topic=&siteAnalysisId=...')`. Needs `analysisId`, `selectedGap`, `section` (with `relatedPages` validated 172-174). Uses `curatedSerp` from `SerpIngestPanel`.
- `src/lib/gcc-api.ts:49-78` — `createGccCreate` validates `siteSection.relatedPages` non-empty when `siteSection` present; otherwise throws 400. Allows `siteAnalysisId` alone (domain-only grounding) but SA-handoff path will send both.
- `src/lib/site-section-storage.ts` — sessionStorage handoff `gcc.siteSectionContext`; `readSiteSectionHandoff` requires `relatedPages.length`. Used only by `CreateStartForm` (read) and `SiteAnalyzerClient` (write).
- `src/components/content-writer/ClientsPanel.tsx:1-99` — renders client chips + `+ New client` form; only used by `src/app/app/creates/page.tsx` after this change (no other consumers).
- `grep -i workflow src` — only hit is `brief-catalog.ts:296` mapping `howto_workflow → ultimate_guide` (not a Creates filter). "Remove workflow from Creates" therefore means remove the workflow/state filter chips if re-added — currently no workflow filter exists, so this is a guard-rail not to introduce one.
- Repo state: clean, last commit `63e2c90`.

## Constraints and non-goals
- **Do NOT rename** `Creates` label, route (`/app/creates`), or heading to `Workflow` or `History` (per explicit correction this turn).
- **Do NOT** add silent fallbacks: no keyword-only create when SA context expected, no provider auto-switching, no fabricated gaps. Fail closed on missing `relatedPages`.
- **Do NOT** edit GeekBackend/Geek-SEO, `CONTENT_CREATOR_PLAN.md`, or `architecture.md` in this pass.
- **Do NOT** touch `src/app/app/creates/[id]/page.tsx` or `CreateDraftWorkspace` detail.
- Scope is Next.js UI only; backend already enforces the gate.

## Key decisions
1. **Hard-delete vs redirect for `/app/create`** — **Resolved: hard-delete / 404** (per Final Consolidated critique). Consistent with no-fallback philosophy; soft redirect is a silent fallback. If bookmarks later matter, add redirect as one-line follow-up — not in this pass.
2. **Client ownership after removing ClientsPanel from Creates** — **Resolved: explicit picker (a).** `GccCreate` requires `clientId` (`src/lib/gcc-api.ts:62`). Auto-picking `clients[0]` hides ownership and contradicts this decision (original bug). New Step 1 renders `<select>` with `clients` + error handling; `Start create` disabled until `clientId` chosen. No silent default.
3. **Creates filtering** — After removing `selectedClientId`, list shows **all** creates (current `listGccCreates()` without `clientId` param already does this). No workflow filter, no client filter.
4. **Site-section handoff** — Keep `sessionStorage` as transient bridge only until SA directly creates. After direct-create lands, handoff can be deprecated but not in this pass.
5. **SA does not decide content type (NEW — from critique)** — `suggestPillar ? "pillar" : "blog"` heuristic deleted. Content type is chosen in Workflow (`CreateDraftWorkspace.tsx` `GCC_OUTPUT_TYPES` checkboxes already support single or multi-type). SA only gates grounding and creates the record.
6. **Notes / department (NEW)** — `notes` simplified to `gapReason || null` only; `curatedSerp bits` undefined dropped. `department` hardcoded `"marketing"` flagged as arbitrary (feeds canonical URL/JSON-LD) — either justify, derive from `gapSectionPath` first segment, or mark as known simplification to revisit. Confirm before implement.
7. **Topic visibility (NEW)** — `CreateDraftWorkspace.tsx:232` already shows `<h1>{detail.topic}</h1>` plus `detail.startingContentType` at 230, `SiteContextBanner` at 242, and `targetKeyword={detail.topic}` into `ContentBriefPanel` (252). No missing header — verified. No additional `h1` needed unless design wants duplicate.


## Recommended approach
Delete the standalone path and make Site Analyzer create directly. Minimal diff, no renames, no new routes. Order matters: wire SA direct-create first, then strip Creates, then delete the form and nav entry — so the app is never left with a `router.push` to a missing route.

## Work plan
### Step 1 — Make Site Analyzer directly create (no `/app/create` hop) — CORRECTED (content-type decision removed from SA)
**File:** `src/app/app/site-analyzer/site-analyzer-client.tsx`
- Add imports: `createGccCreate` from `@/lib/gcc-api`, `getClients`/`ApiError` from `@/lib/content-writer/api`, `Client` type.
- Add local state: `clients: Client[]`, `clientId: string`, `clientError`, `creating`, `clientsLoading`.
- On mount: `getClients().then(list => { setClients(list); if(!clientId && list[0]) setClientId(list[0].id); })`. Render explicit `<select>` picker in gap detail (not silent default) — Decision 2 now matches implementation. Picker shows `clients.map(c => <option>)` plus error if fetch fails. `Start create` disabled until `clientId` selected.
- Replace `startCreate()` body (`site-analyzer-client.tsx:183-215`): **SA does not decide content type**. Remove `startingContentType` heuristic (`suggestPillar ? "pillar" : "blog"` deleted). SA is gate + grounding only. New body:
  ```ts
  // site-analyzer-client.tsx — startCreate() — CORRECTED
  const created = await createGccCreate({
    clientId,
    topic: selectedGap.topic,
    notes: selectedGap.reason?.trim() || null, // simplified: only gapReason; curatedSerp/sectionPath dropped (see notes spec below)
    siteAnalysisId: analysisId,
    siteSection: section,
    // department: derive from gapSectionPath first segment or keep "marketing" pending confirmation (see item 2)
    // startingContentType: OMITTED — set later in Workflow
  });
  clearSiteSectionHandoff();
  router.push(`/app/creates/${created.id}`);
  ```
  Keep `section.relatedPages` guard (`172-174`); surface `ApiError` on failure. Disable button while `creating`.
- **Required confirmation before implement:** `createGccCreate` currently typed as `startingContentType: string` required (`src/lib/gcc-api.ts:62`). Workflow (`CreateDraftWorkspace.tsx:48-54,272-292`) already uses `GCC_OUTPUT_TYPES` checkboxes with fallback `["blog"]` — content type is chosen in Workflow, not SA. If backend requires `startingContentType`, change schema to nullable/optional (`string | null`) and default in Workflow/Generate (same fallback). Do not fake a default in SA. Confirm with GeekBackend owner (Claude Code) before coding — do not assume.

### Step 2 — Strip Creates to a plain list
**File:** `src/app/app/creates/page.tsx`
- Delete imports `ClientsPanel`, `getClients`, `Client`.
- Delete state `clients`, `selectedClientId`; delete `useEffect(getClients)` (16-25); delete `visible` filter (41-43); render `creates` directly.
- Delete header CTA div (58-79) containing both `Image prompt` and `Start a create` links.
- Delete `ClientsPanel` block (84-93) and its `onCreated`/`onSelect` handlers.
- Delete/thin empty state (96-112): keep `"No creates yet."` but remove `Start a create` link and `"or pick a Site Analyzer gap"` text. Just plain text + maybe a link to `/app/site-analyzer` if desired — but per "Delete Site Analyzer Button from Creates", **no** SA button here either. Keep empty state text-only.
- Update heading subtitle to remove `"start create →"` reference (54-55). Keep heading `<h1>Creates</h1>` unchanged per your correction.
- Simplify to: `listGccCreates().then(setCreates)` only.

### Step 3 — Remove Start Create from nav
**File:** `src/components/AppSidebar.tsx:6-9`
- Delete `{ href: "/app/create", label: "Start create", match: "exact" }` from `nav` array. Leave `Creates` and `Site Analyzer`. No label rename.

### Step 4 — Delete the standalone create route and form
- Delete `src/app/app/create/page.tsx` and empty folder `src/app/app/create/`.
- Delete `src/components/content-writer/CreateStartForm.tsx` (only consumer was the deleted page).
- If decision 1 is "soft redirect": instead of delete, replace `page.tsx` with `import { redirect } from "next/navigation"; export default function(){ redirect("/app/site-analyzer"); }`.

### Step 5 — Cleanup and guardrails
- Leave `src/lib/site-section-storage.ts` for now (SA still writes handoff before direct create; can be removed in a follow-up).
- `src/components/content-writer/ClientsPanel.tsx` becomes unused after Step 2 — leave it (may be reused in SA picker) or delete in a follow-up pass; not required to satisfy acceptance.
- Run `grep -r "app/create" src` — should be zero (or one redirect stub).

## Validation plan
- **Static:** `npm run build` — catches deleted-import breakage (most common failure in prior 6 attempts). `npm run lint` — no orphan imports.
- **Nav check:** Load `/app/site-analyzer`, `/app/creates`, `/app` — sidebar shows 2 items, no `Start create`, active state correct.
- **Creates stripped:** Visit `/app/creates` — no client chips, no workflow filter chips, no `Start a create` / `Image prompt` / SA buttons, heading still `Creates`, list renders links to `/app/creates/[id]`.
- **SA-only create:** Enter domain → `Analyze` → gaps appear → `Review gap` → pick gap → SA client picker shows clients → `Start create` → navigates to `/app/creates/:id` without hitting `/app/create`. Verify new create has `siteAnalysisId` and `siteSection.relatedPages` visible on detail (`SiteContextBanner` or JSON).
- **Negative:** Direct `GET /app/create` → 404 (or redirect to `/app/site-analyzer` if soft-delete). Empty DB: `/app/creates` shows text-only empty state, no CTA buttons.
- **Negative:** If SA gap detail has no `relatedPages`, `Start create` stays disabled / errors fail-closed (existing guard in `createGccCreate` 400).

## Risks and rollback
- **Risk — client-less create:** Now mitigated — explicit picker, no silent default (Step 1 corrected).
- **Risk — bookmarked `/app/create`:** Hard 404 by design (critique item 4); intentional honest failure. Redirect only as follow-up if needed.
- **Risk — `startingContentType` required on backend:** Next layer `src/lib/gcc-api.ts:62` requires it; Workflow already defaults via `CreateDraftWorkspace.tsx:53` (`["blog"]` fallback) and `GCC_OUTPUT_TYPES` checkboxes. Make backend nullable/optional if needed — confirm before implement (do not fake default in SA).
- **Risk — department hardcode:** `department || "marketing"` in `gcc-api.ts:89` means SA hardcode propagates to canonical URL/JSON-LD; revisit derivation from `gapSectionPath`.
- **Risk — sessionStorage handoff orphan:** Step 1 clears on success; add mount-time `clearSiteSectionHandoff` if needed.
- **Risk — over-deletion:** Keep `Creates` detail route and all `gcc-api` intact. Rollback is `git checkout -- src/app/app/create src/components/content-writer/CreateStartForm.tsx src/components/AppSidebar.tsx src/app/app/creates/page.tsx src/app/app/site-analyzer/site-analyzer-client.tsx` — confirmed matching Steps 1-4 scope.

## Open questions — resolved pending one confirmation
- 404 vs redirect: **hard delete** (resolved). Client picker: **explicit select** (resolved). SA content-type: **omit** (pending backend nullability confirmation). Department: pending justification/derivation. Notes: simplified to `gapReason` (confirm acceptable).

---
*Plan saved to `docs/plans/site-analyzer-only-create.plan.md`. No code changed — awaiting approval to implement.*
