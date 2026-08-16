# Fix: Workflow HierarchyContextPanel reports no match for "AI Content Creation Workflow" despite keyword present in Site Analyzer

**Status:** Proposed — awaiting approval (no code changed).
**Reporter:** Project keyword "AI Content Creation Workflow" tested for weeks; Site Analyzer report shows the exact heading, but Workflow → HierarchyContextPanel shows `No hierarchy match for "AI Content Creation Workflow" — page/site hierarchy context will be omitted. Generate stays blocked until you acknowledge the keyword is outside site scope.`

---

## 1) Facts from the repo (observed, not assumed)

**Data flow:**

* `Site Analyzer → Analyze` polls `GET /api/geek-content-creator/site-analyzer/{id}` (via [src/app/api/site-analyzer/[id]/route.ts](/Users/jeffmartin/development/GeekContentCreator/src/app/api/site-analyzer/[id]/route.ts:1)). Response `body.pages` is `Array<{ url, title, headings: Heading[] }>` where `Heading = { level: number; text: string }` ([src/lib/types.ts](/Users/jeffmartin/development/GeekContentCreator/src/lib/types.ts:4), [src/app/app/site-analyzer/site-analyzer-client.tsx:65](/Users/jeffmartin/development/GeekContentCreator/src/app/app/site-analyzer/site-analyzer-client.tsx:65)). Rendered in [src/components/SiteHeadingHierarchy.tsx](/Users/jeffmartin/development/GeekContentCreator/src/components/SiteHeadingHierarchy.tsx:1) and the two REPORT tables in `site-analyzer-client.tsx` — **this is the "persisted crawl data contains the exact Keyword" the user sees.**

* `Workflow → HierarchyContextPanel` does **not** read `SiteAnalysis.pages`. It fetches a *different* endpoint: `GET /api/geek-content-creator/site-analyzer/{id}/page-section-trees` via proxy [src/app/api/site-analyzer/[id]/page-section-trees/route.ts](/Users/jeffmartin/development/GeekContentCreator/src/app/api/site-analyzer/[id]/page-section-trees/route.ts:1). Body is cast directly to `PageContextPage[]` in [src/components/content-writer/HierarchyContextPanel.tsx:145](/Users/jeffmartin/development/GeekContentCreator/src/components/content-writer/HierarchyContextPanel.tsx:145):
  ```ts
  const pages = (Array.isArray(body) ? body : []) as PageContextPage[];
  const nextMatches = findHierarchyMatches(pages, targetKeyword);
  ```

* Matcher is [src/lib/content-creator/hierarchy-match.ts](/Users/jeffmartin/development/GeekContentCreator/src/lib/content-creator/hierarchy-match.ts:1). Type in use after `d0de04b`:
  ```ts
  export type PageContextPage = { pageUrl: string; headings?: string[] | null; markdown?: string | null; title?: string | null; };
  ```
  `findHierarchyMatches` **ignores `headings` entirely**. It does:
  ```ts
  const markdown = page.markdown ?? "";
  const sections = parseMarkdownSections(markdown); // only /(^#{1,6}\s+…)/ headings
  // then slugsMatch(slugifyHeading(section.heading), topicSlug)
  ```
  (`hierarchy-match.ts:273-307`) plus a URL-slug fallback (`pageUrlSlug`).

* Prior shape before `d0de04b` was `PageSectionTreePage = { pageUrl, roots: PageSectionNode[] }` with `headingText / children / paragraphs`. Commit `d0de04b` switched the matcher to the Markdown-only model; `src/lib/types.ts:Heading` and `SiteAnalyzerClient`'s `pages` array were **not** updated to match — they still carry the structured `Heading[]` model. The two models now diverge in the UI.

* Gate: [src/app/app/workflow/projects/[id]/page.tsx:40](/Users/jeffmartin/development/GeekContentCreator/src/app/app/workflow/projects/[id]/page.tsx:40) blocks Generate unless
  ```ts
  const hierarchyOk = hierarchyGate.matched || hierarchyGate.allowOutsideSiteScope;
  const canGenerate = hierarchyOk && briefComplete && !hierarchyGate.loading;
  ```

**Therefore the user-observed symptom is causal, not descriptive:** crawl Report 1 can contain `H2: AI Content Creation Workflow` while `page-section-trees → markdown` for that same `siteAnalysisId` can be `null | "" | non-ATX` and the matcher will still return `[]`, leaving the banner stuck on "No hierarchy match" and the checkbox as the only gate exit.

---

## 2) Hypotheses (ranked by likelihood; all falsifiable against network output)

**H1 — Markdown-absent fallback missing (most likely).**
`GET …/page-section-trees` for this `siteAnalysisId` returns `PageContextPage` rows where `markdown` is `null`/`""` (crawler persisted headings but theMarkdown materializer did not run, or was cleared). Since `findHierarchyMatches` reads only `markdown`, it sees zero sections and returns no matches even though `headings: ["AI Content Creation Workflow"]` is present. The Site Analyzer report (which reads `SiteAnalysis.pages[].headings`) still shows the keyword, so the user perceives a contradiction that correctly reflects a code-level split-brain.

*Falsifier:* open devtools Network → `page-section-trees` response and inspect one entry. If any entry has `headings` containing the keyword but `markdown` empty/null, H1 is confirmed. Check two old analysis IDs (the project’s `project.siteAnalysisId` and the current `siteAnalysisId` shown in Site Analyzer’s "Analysis {id}" line) — mismatch of IDs also confirms a stale project binding (see H3).

**H2 — Response-shape mismatch (wrapper vs bare array).**
Proxy [route.ts:28](/Users/jeffmartin/development/GeekContentCreator/src/app/api/site-analyzer/[id]/page-section-trees/route.ts:28) does `await res.json()` and then `return NextResponse.json(body)`. If GeekAPI returns `{ pages: PageContextPage[], pageSectionTrees: … }` or `{ value: … }` (common .NET envelope) then `Array.isArray(body)` is false and the panel sets `pages = []`, throwing the follow-up error "Site Analyzer returned no page context" — or silently showing zero matches if the wrapper is an object with array inside that is ignored. The user’s panel shows the zero-match banner, not the page-context error, so if H2 were true the payload would have to be a bare array of objects whose fields are cased differently.

*Falsifier:* `page-section-trees` response in Network: is the JSON a bare `[...]` or an object? If bare array, H2 is out. If object, note the exact key (`pages`, `trees`, `value`, `data`, `items`).

**H3 — Stale `siteAnalysisId` binding on the project.**
`ProjectForm` captures `siteAnalysisId: handoff?.siteAnalysisId ?? null` at creation time ([src/components/content-writer/ProjectForm.tsx:72](/Users/jeffmartin/development/GeekContentCreator/src/components/content-writer/ProjectForm.tsx:72)). `Workflow project page` then builds:
```ts
const siteAnalysisId = project.siteAnalysisId ?? readWorkflowClientHandoff()?.siteAnalysisId ?? null;
```
([src/app/app/workflow/projects/[id]/page.tsx:109](/Users/jeffmartin/development/GeekContentCreator/src/app/app/workflow/projects/[id]/page.tsx:109))
If the user has been testing for weeks, the project likely points at an older analysis ID than the one visible in Site Analyzer today. The new crawl contains the keyword; the old one (loaded by the panel) does not. The persisted crawl data the user sees in Site Analyzer is *not* what HierarchyContextPanel loads.

*Falsifier:* compare `project.siteAnalysisId` (visible in `GET /api/cw/.../projects/{id}` response, and in the page props `initialSourcePageUrl`/`initialPath` echoes) with `siteAnalysisId` rendered as `Analysis {id}` in Site Analyzer. Different IDs → H3. Same ID but still no match → H1.

**H4 — Heading not ATX-parseable even though markdown is non-empty.**
`parseMarkdownSections` only recognises `^(#{1,6})\s+(.+?)\s*$`. If GeekAPI’s markdown stores `AI Content Creation Workflow` as raw text without a leading `#`, as `## AI Content Creation Workflow — …` with non-standard punctuation, or with preceding BOM/whitespace that keeps the regex from matching the line, then `sections` stays empty. Alternatively, slug comparison uses `slugifyHeading` which NFKDs and strips to `ai-content-creation-workflow`; an exact match should still succeed, but if heading includes decorative quotes or `:` suffix not stripped correctly, rank logic could prefer empty. H4 predicts markdown is non-empty but contains no lines matching the heading regex that includes the keyword.

*Falsifier:* paste the `markdown` string for the page that should contain the heading into `parseMarkdownSections` offline. If the function returns no candidate with `heading === "AI Content Creation Workflow"`, H4 is in play. Also test `slugifyHeading` on the real heading text.

**H5 — Case/envelope casing (PascalCase vs camelCase).**
GeekAPI .NET serializer toggles `PageUrl`/`Markdown` vs `pageUrl`/`markdown`. `PageContextPage` reads only lowercase keys. If the backend returns PascalCase, `page.markdown` is `undefined` → fallback `""`, same symptom as H1 but cause is casing, not absent markdown.

*Falsifier:* inspect raw `page-section-trees` JSON keys for one row. Lowercase `pageUrl` + `markdown` → H5 out. `PageUrl`/`Markdown` → H5.

---

## 3) One-day diagnosis ladder (no code changes, 10 minutes in browser)

Do these in order; stop when a hypothesis is confirmed.

1. **Capture the truth source.** Open the failing Workflow project → `Cmd-Opt-I` → Network → refresh → filter `page-section-trees` → copy response body. Also open DevTools Console and run `await fetch('/api/cw/projects/'+location.pathname.split('/').pop()).then(r=>r.json()).then(j=>console.log(j.siteAnalysisId, j.hierarchyPath))` to see which `siteAnalysisId` the project is bound to.
2. **Compare IDs.** Site Analyzer tab shows `Analysis {id}` after a run. If that ID ≠ the project’s `siteAnalysisId`, H3 is the culprit. Do not change matcher logic until the binding is fixed (see §4.2).
3. **Inspect one row.** Pretty-print the `page-section-trees` body. Check: (a) bare array vs wrapper key, (b) key casing, (c) for any row `headings` containing `AI Content Creation Workflow`, what `markdown` holds (null / "" / markdown with/without `#` headings).
4. **Local slug check.** In console run `((s)=>s.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''))("AI Content Creation Workflow")` to confirm slug `ai-content-creation-workflow`. Then scan the markdown string for that line.
5. **Offline matcher.** Paste the captured `PageContextPage[]` into a throwaway `node` REPL that imports `findHierarchyMatches` — see if it returns zero. This isolates frontend logic from backend payload.

Share the captured JSON (or its shape/keys + one representative row) and the project ID → the fix below becomes a single-path change.

---

## 4) Minimal fix the evidence will likely point to

### 4.1 Matcher: fall back to `headings` when `markdown` is empty/incomparable (addresses H1/H5/H4)

**File:** [src/lib/content-creator/hierarchy-match.ts](/Users/jeffmartin/development/GeekContentCreator/src/lib/content-creator/hierarchy-match.ts:249)

Change `findHierarchyMatches(pages, keyword)` so it matches against **both** sources, with deterministic precedence:

* Keep current Markdown-section matching (highest fidelity: section path + `assignmentMarkdown` slice). When `markdown` is non-empty and `sections.length > 0`, keep existing flow unchanged.
* Add a fallback that scans `page.headings` (`string[]` case — see `PageContextPage.headings`; if the API actually returns `Heading[]`, normalize by `h.text` first — read the real payload before shipping) using the same `slugsMatch(slugifyHeading(heading), topicSlug)` rank. When a heading matches there but `markdown` gave no section, synthesize a minimal `HierarchyMatch`:
  ```ts
  { path: [matchedHeading],
    childHeadings: headings.slice(idx+1, idx+4), // best-effort next siblings; empty is acceptable
    toolsByHeading: [],        // no tool evidence without markdown
    assignmentMarkdown: "",    // or headings-joined sentinel — never hallucinate
    sourcePageUrl: page.pageUrl,
    matchedHeading,
    kind: kind === 'exact' ? 'exact-heading' : 'contains-heading' }
  ```
  Dedupe by existing `byKey` map (path+pageUrl), preserving `KIND_RANK` ordering (`exact-heading` > `exact-page` > ...). Do not degrade the Markdown path when both sources match the same path.

* Also add PascalCase-tolerant normalization at the call site in [HierarchyContextPanel.tsx:145](/Users/jeffmartin/development/GeekContentCreator/src/components/content-writer/HierarchyContextPanel.tsx:145): `normalizePage(p)` that maps `PageUrl→pageUrl`, `Markdown→markdown`, `Headings→headings` (handle both `string[]` and `Heading[]`) before passing to `findHierarchyMatches`. Keeps the fix robust to .NET serializer config without littering every call.

* Add a regression test in [hierarchy-match.test.ts](/Users/jeffmartin/development/GeekContentCreator/src/lib/content-creator/hierarchy-match.test.ts:1): exact-heading keyword matches when `markdown: null` but `headings: ["AI Content Creation Workflow"]`; and mixed case where markdown match wins over headings fallback.

Estimated touch: ~35 lines + ~20 lines of tests. No new endpoints.

### 4.2 Binding: allow the project to follow the current analysis (addresses H3 if confirmed)

**Files:** [src/app/app/workflow/projects/[id]/page.tsx](/Users/jeffmartin/development/GeekContentCreator/src/app/app/workflow/projects/[id]/page.tsx:109), [src/components/content-writer/HierarchyContextPanel.tsx:115](/Users/jeffmartin/development/GeekContentCreator/src/components/content-writer/HierarchyContextPanel.tsx:115), [src/services/content-writer-api.ts:141](/Users/jeffmartin/development/GeekContentCreator/src/services/content-writer-api.ts:141)

If diagnosis shows stale ID binding, add a low-risk rebind affordance (not a full data migration):

* HierarchyContextPanel footer when `initialPath` is null and `matches` is `[]` but `readWorkflowClientHandoff().siteAnalysisId` differs from `siteAnalysisId` prop: show `Project is bound to analysis {shortId} · Site Analyzer is on {handoffId}. [Use current analysis]` button that calls `updateProjectHierarchyContext(..., { siteAnalysisId: handoffId, hierarchyPath: null })` and reloads. This is additive — does not auto-rebind, asks confirmation.
* Alternative (if backend owns binding): expose `POST /api/projects/{id}/site-analysis` rebind route the UI already calls via `updateProjectHierarchyContext`. Same UX, different verb — whichever the .NET controller already supports.

Do not implement this until the Network trace shows ID divergence; otherwise ship 4.1 alone.

### 4.3 Diagnostics that should be added regardless (10 lines)

* In `HierarchyContextPanel`’s fetch handler after `const pages = …` add a `console.info("[hierarchy] pages", pages.length, "markdownRows", pages.filter(p=>p.markdown?.trim()).length, "exampleKeys", pages[0] ? Object.keys(pages[0]) : [])` — or a small debug badge in the loading/error panel when `pages.length > 0 && matches.length === 0` that prints `loaded {n} pages · {m} with markdown · siteAnalysisId {shortId}`. This makes the next occurrence instantly triaged without requiring the user to capture the payload.

---

## 5) What the change would affect / not affect

* **Affects:** Workflow → Site hierarchy context (heading-match block + Generate gate `hierarchyOk`), and the persisted assignment (`hierarchyPath / hierarchyChildHeadings / hierarchyAssignmentMarkdown / hierarchySourcePageUrl`) sent at generation time. Downstream prompt builder receives a grounded path rather than the "outside site scope" sentinel. Diagnostics console line added.
* **Does not affect:** Site Analyzer crawling, `SiteHeadingHierarchy` display, Report 1/2 tables, `page-section-trees` proxy contract, Brief/SERP flows, any `src/lib/` → `src/services/` boundary (change stays in `src/lib/content-creator/hierarchy-match.ts`, a pure utility per `AGENTS.md`).
* **Gate invariant preserved:** `hierarchyOk = matched || allowOutsideSiteScope`. First time a real heading match is found, `allowOutside` is forced false (already in `persistSelection`), so Generate unblocks without requiring the user to toggle the checkbox again.
* **No regex-for-HTML regression:** Added code uses `slugifyHeading` + string includes, not `RegExp` against HTML. `parseMarkdownSections` stays in `src/lib/` as a Markdown line scanner, not an HTML parser; the headings fallback avoids AngleSharp entirely.

---

## 6) Verification (to run after the fix ships, not before approval)

* Capture the failing `page-section-trees` payload once and save as `fixtures/page-section-trees-ai-workflow.json` (sanitize domain). Add a unit test `findHierarchyMatches(fixture, "AI Content Creation Workflow")` expecting `matchedHeading === "AI Content Creation Workflow"` and `kind === "exact-heading"`, plus `assignmentMarkdown` empty-or-sentinel variant when headings-fallback triggered.
* Manual: reload the failing project after fix deployed, confirm banner flips from "No hierarchy match …" to "Matched path: AI Content Creation Workflow" (or site-prefixed path) with the correct `sourcePageUrl`. Generate button becomes enabled when Brief is complete. Toggle back to Site Analyzer → confirm Report 1 heading list and Workflow match agree.
* Also verify the revert case: a keyword genuinely absent still shows the "outside site scope" amber box and the checkbox still unblocks Generate via `allowOutsideSiteScope`.

---

## 7) Risks & non-goals

* **Risk:** PascalCase normalizer double-counts the same heading from both `headings` and markdown slice if both contain the keyword — mitigated by same dedup `byKey` already in matcher. Rank `exact-heading` is identical from both sources, so ordering stays stable.
* **Non-goal:** populating `toolsByHeading` / `assignmentMarkdown` from `headings`-only rows — that would hallucinate tool associations. Those fields remain empty in fallback; they’ll fill when the Markdown materializer starts populating again.
* **Non-goal:** auto-adopting the current Site Analyzer ID for every project on page load; that would be a breaking handoff change. Rebind stays behind an explicit "Use current analysis" action only if H3 is confirmed.

---

## 8) Decision needed from you

**Approve 4.1 (match-fallback + normalization + test) and the 4.3 diagnostic line?** That’s the single change that resolves the reported state if the trace shows `markdown` null/empty (the headline cause).

**If the trace instead shows ID drift, also approve 4.2 rebind affordance?** Say whether you want that in the same PR or queued as a follow-up.

Reply **Approve** / **Request changes** / **Cancel**. On approval the plan will be executed with no other scope expansion.

