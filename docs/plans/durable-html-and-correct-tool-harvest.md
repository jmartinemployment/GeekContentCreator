# Durable crawl capture + correct Generate Tools harvest

Status: planned (all-or-none scope)
Date: 2026-08-20
Supersedes the diagnosis in `fix-generate-tools-h4-h5-harvest.md`.
Critique that led here: `critique-durable-html-generate-tools.md`.

## Context

Generate Tools returns ~6 invented tools (job total 7) for the "Ad Spend Optimization" section
instead of the real list. Two prior diagnoses concluded the section was *honestly empty* and the
tree was faithful. **Both were wrong** — they profiled `ai-marketing-systems`, which 404s.

Verified 2026-08-20 by live Playwright probe (Pixel 7 mobile **and** desktop 1280×900, identical):
the section is on the **homepage** `https://www.geekatyourspot.com/`, is an **H4** "Automated Ad
Spend Optimization" under `… › Use Cases › Marketing`, has **4 h5 children** (each paired with an
h6 "Top AI … Tools:"), and contains **19 anchors / 17 unique**, every one a `/tools/marketing/…`
link. The page emits its whole outline twice (133 headings; h4 at index 52 and 108) and **both
copies carry all 17 links**; one copy has width 0, neither is `data-gsv`-tagged.

So `linksUnderMatch=0` is a **real defect** in crawl → TreeJson → match. The mobile-first-crawl
theory is ruled out: the renders agree exactly.

Two separate problems, fixed together per the correctness-over-expediency rule:

1. **We cannot replay a crawl, and TreeJson is not a capture.** `TreeJson` is persisted without
   truncation, but it is written *after* lossy processing — it is a derived projection, not source
   of truth. Confirmed losses, all before persistence:
   - A heading whose extracted text is empty is **dropped and never pushed onto the stack**
     (`PageSectionTreeBuilder.cs:49-51`, and `:172-174` in the desktop-only path). Its h5/h6/anchor
     descendants then attach to the previous *surviving* heading — the outline silently reparents.
   - Desktop-only regions lose all paragraph text (`:143-150`).
   - `script` / `style` / `template` / `noscript` dropped (`:41`).
   - Anchors with empty `href` **or** empty text dropped (`:119-120`).
   - Any element that is not h1–h6 / p / li / a has no representation at all — tables, divs,
     images, buttons.
   - Every attribute except `href` and `rel`, including the `data-gsv` labels themselves.
   - Document-order interleaving of paragraphs against links (separate lists per node).

   None of this is recoverable from `TreeJson`: you cannot query the tree to learn that a heading
   vanished or that children reparented. **The step that corrupts the outline is the step that
   erases the evidence.** This is the architectural case for durable HTML, and it is independent of
   any single bug.

   The HTML the tree was built from is deliberately discarded
   (`SiteAnalysisStepArtifactStore.cs:41-61` → `p with { Html = string.Empty }`, rationale: "SPA
   shells can be megabytes per page and explode Supabase egress"). Every parser change therefore
   requires a fresh crawl. Measured: homepage is **1.485 MB raw but 79.5 KB gzipped (18.7×)** — the
   egress objection is answered by compression, which the original decision did not consider.
2. **The harvest is wrong in both directions.** It can match a section on a page the operator never
   chose, it accepts any anchor as a "tool", and it invents tools from headings when it finds none.

Intended outcome: a crawl is replayable offline forever; Generate Tools on this section returns
exactly the 17 real tools; and when a section truly has no tools, the operator gets a clear,
distinguishable error rather than invented names.

## Services touched

| Service | Role |
|---|---|
| `../Geek-SEO` | crawls, builds trees, sends to repo over HTTP |
| `../GeekBackend/GeekRepository` | **owns the DB**, EF entities, migrations, PUT/GET endpoints |
| `../GeekBackend/GeekAPI` | consumes trees, extracts tools (Generate Tools) |
| `GeekContentCreator` (this repo) | docs |

---

## 1. GeekRepository — storage (owner of the schema)

`Entities/…/SiteAnalysisEntities.cs`, entity `SiteAnalysisPageSectionTree`
(mirrored in `../Geek-SEO/GeekSeo.Persistence/Entities/SiteAnalysisEntities.cs:161-171`; keep both
definitions in sync):

Add:
- `byte[]? HtmlGzip` — gzipped **rendered** DOM (post-JS, `data-gsv` already applied). `bytea`,
  nullable so pre-migration rows stay valid.
- `int? HtmlBytes` — uncompressed length, for diagnostics without decompressing.
- `string? BuilderVersion` — which `PageSectionTreeBuilder` produced this `TreeJson`. Without it a
  rebuild endpoint cannot tell stale rows from current ones.

EF migration in `GeekRepository/Migrations`. Extend
`SiteAnalysisPageSectionTreeWrite` / `SiteAnalysisPageSectionTreeRow`
(`../Geek-SEO/GeekSeo.Application/Models/Seo/SiteAnalysisPersistenceModels.cs:148-159`) with the
three fields, and the PUT/GET at
`GeekRepository/Controllers/Seo/SiteAnalysisProfilesController.cs:479,493` plus
`Repositories/Seo/SiteAnalysisProfileRepository.cs:834-860`.

`GetPageSectionTreesAsync` must **not** select `HtmlGzip` by default — add an explicit
`includeHtml` flag so normal reads stay cheap. This is the egress guard.

## 2. Geek-SEO — capture and replay

**Capture.** `page.Html` is already in scope at both `Build` call sites:
- `Services/SiteAnalyzerStepRunners/SiteAnalysisStepExecutionService.cs:293-300`
- `Services/SiteAnalyzerStepRunners/ThroughCoverageMemoryRunner.cs:98-102`

Gzip it there and pass it through on the write. Do **not** relax
`SiteAnalysisStepArtifactStore.cs:59` — the step log stays HTML-free; this is a different sink with
compression and a deliberate opt-in read.

**Replay.** New authenticated endpoint on `Controllers/Seo/SiteAnalyzerController.cs`:

```
POST /api/seo/site-analyzer/{siteAnalysisProfileId}/rebuild-page-section-trees
```

For each row with `HtmlGzip`: decompress → `PageSectionTreeBuilder.Build(html)` → serialize →
update `TreeJson` + `BuilderVersion`. Preserve `PageUrl` and profile id. No Playwright re-fetch.
Return `{ rebuilt, skippedMissingHtml, pageUrls[] }` so a partial capture is visible, not silent.

**2c. DISPROVEN as root cause (2026-08-20). Fixed anyway; the real cause is §3a.**

Tested empirically against a crawler-annotated fixture of the real page
(`GeekSeoBackend.Tests/Fixtures/geekatyourspot-use-cases-desktop.annotated.html`):

- The desktop copy yields **17 unique `/tools/` links on both old and new code.** The builder was
  never losing them.
- **Only 1 element in the whole article carries `data-gsv="desktop-only"`** — the `<article>`
  itself. All 314 descendants are labelled `visible`, because `getComputedStyle` returns a child's
  *own* display value even inside a `display:none` parent, so the classifier can only ever mark
  the outermost hidden element.
- Therefore the `<h4>` never carried the attribute, `ExtractHeadingText` never returned empty, and
  no heading was ever dropped in this region. The hypothesised mechanism does not occur.

This also means §2d's "annotate only outermost boundaries" is **already the actual behaviour** —
the 2,997-element annotation is ~99% `visible` labels that nothing reads, but the desktop-only
marking was never per-element to begin with.

Root cause therefore falls to **§3a (match selection in GeekAPI)** — restored to primary suspect.

*What was still fixed here* (verified failing on old code, passing on new):
- Silent heading drop → empty-text headings now keep their place, so children cannot reparent.
- Desktop-only paragraph text is now indexed (search-engine parity); old code discarded it.
- ~70 lines of dead special-case walk deleted.

*Original hypothesis, retained for the record:*


Framed mobile-first, because mobile is the source of truth. `data-gsv` is assigned at
`SitePageCrawler.cs:370-393` (hidden-at-mobile vs hidden-at-desktop snapshots →
`VisibilityClassifier`), so `desktop-only` (`PageSectionTreeBuilder.cs:238-239`) means **hidden at
mobile, visible at desktop** — content the mobile user never sees.

Established: **the 17 tool links are mobile-visible.** At Pixel 7 the h4 measured `display:block`,
`visibility:visible`, width 332, with all 17 `/tools/` links beneath it. They are not a desktop
artifact and the crawler must capture them.

The defect is therefore not about desktop content being wanted — it is that the desktop-only branch
**shares mutable state with the mobile outline.** `ProcessDesktopOnlyOutline(node, roots, stack)`
receives the same `roots` and `stack` the mobile tree is being built into (`:36`, `:146-150`) and
pops/pushes it (`:178-185`). Mishandling inside a desktop-only region leaves the stack at the wrong
depth, so the **mobile** headings and links that follow reparent.


`ProcessDesktopOnlyChild:172-174` derives heading text with
`VisibleTextExtractor.ExtractHeadingText`, but that extractor is documented as *"skipping
`data-gsv="desktop-only"` subtrees"* (`VisibleTextExtractor.cs:7-9`) and its `Walk`/`WalkHeading`
return early on `IsDesktopOnly(node)`. So the branch that exists **specifically to register
headings inside desktop-only regions** reads their text with an extractor that refuses to read
desktop-only content → empty string → early `return` **before `stack.Add(newNode)`**.

Two failures, not one: the heading is lost, *and* every following h5/h6/anchor attaches to the last
surviving heading. A node then reports 1 child and 0 links while its real 17 links sit under the
wrong parent — exactly the observed symptom, and a better fit for it than the match-ranking bug in
§3a.

Fix: in the desktop-only path, extract heading text with a desktop-only-aware call (or `Extract`
with the skip disabled). Separately, **never drop a heading silently** — if text is still empty,
push a placeholder node so nesting is preserved and the gap is visible, in either path
(`:49-51`, `:172-174`).

**DECIDED 2026-08-20 (revised) — the crawler mirrors a search engine; the *site* has no
hidden-at-mobile content.**

Two rules, in this order:

1. **Site rule (owner: `geekatyourspot`): there must be no hidden-at-mobile content, period.**
   Responsive `hidden lg:block` / `lg:hidden` twinning is banned — one DOM, responsive styling.
2. **Crawler rule: behave like Googlebot, not a scraper.** Googlebot renders mobile, executes JS,
   and **indexes `display:none` / `visibility:hidden` text** rather than discarding it. So the
   builder must **not** prune hidden content — pruning would make the crawler *more* selective than
   the engine it models and would under-report what Google actually indexes.

Consequences for the builder:

- Delete `ProcessDesktopOnlyOutline` / `ProcessDesktopOnlyChild` / `CollectLinksOnly`. Not because
  desktop-only content is pruned, but because under rule 1 it should not exist, and under rule 2 it
  would be walked by the normal path anyway. This removes the shared-stack vector in §2c and the
  internal contradiction with `VisibleTextExtractor` (`:7-9`).
- `data-gsv` flips from a **pruning input** to an **assertion**. Keep both viewport snapshots and
  `VisibilityClassifier`; report any hidden-at-mobile element as a **violation finding**. The
  crawler then catches this regression class on every crawl instead of absorbing it silently.
- Duplicate hierarchy paths (two copies of a section) are resolved downstream by href dedupe (§3c)
  and page-first match ordering (§3a), not by pruning.

**Site defects this rule exposes (all currently visible to Google), `geekatyourspot`:**

- 40 occurrences of responsive hide/show across 18 `.tsx` files.
- `src/components/home/use-cases.tsx` is **2,362 lines** — the same section written twice by hand
  (`:25` `lg:hidden`, `:1166` `hidden lg:block`), ~1,140 lines each. Source of the 119 orphaned
  `/tools/` link references.
- **Duplicate DOM `id="use-cases-section"`** on both copies — invalid HTML; `getElementById` and
  `#use-cases-section` anchors resolve to the first only.
- **The copies have drifted**: copy 1's h3 is `"Accounting"`, copy 2's is `"Accounting Systems"`.
  Google sees inconsistent headings for the same section.
- `typewriter.tsx` (`:45`, `:63`) and `hero-section.tsx` (`:16`, `:46`) → four copies of
  `["Efficiency", "Automation", "Revenue", "Growth"]` in one H1.

Independently, **never drop a heading silently** in the remaining mobile path (`:49-51`): if
extracted text is empty, push a placeholder node so nesting is preserved and the gap is auditable.

Note the homepage renders its outline twice; `data-gsv` is applied by the crawler, so a plain
browser fetch shows none of it. Confirm against crawler-annotated HTML, which §1 makes durable.

**2d. Annotate only desktop-only boundaries, not every element.**

`SitePageCrawler.cs:384-393` writes `data-gsv` onto **every** element. Measured on the homepage:
2,997 elements annotated, **57,386 bytes** added to the HTML — to encode **9** decision-relevant
facts (11 `desktop-only` elements, 9 of them outermost). Pruning is subtree-wide, so once the walk
cuts at an outermost `desktop-only` node its descendants are unreachable and their labels are never
read. 2,988 of the 2,997 annotations are dead weight, and they land inside the HTML §1 now stores.

**Measured composition (homepage, 2026-08-20) — `collapsed` is not content.** The 189 `collapsed`
elements are `<head>` machinery: 90 `SCRIPT`, 62 `META`, 18 `LINK`, plus `HEAD` / `TITLE` / `STYLE`
= 174; then 7 divs, a nav toggle, one `ARTICLE#consultationAppointmentlg`, and 4 `SPAN`s.
**`collapsed` contains 0 `/tools/` links.** There are no accordions on this site — a deliberate
choice — so the "collapsed = reachable accordion content" rationale does not apply here.

**The 11 `desktop-only` elements contain 119 `/tools/` link references**, including
`ARTICLE#use-cases-section [hidden lg:block]` — the **entire desktop duplicate of the Use Cases
section**. This is the corruption source in §2c, at full scale: that duplicate is currently walked
by `ProcessDesktopOnlyChild`, its headings come back empty from a desktop-only-skipping extractor,
they are dropped without being stacked, and 119 link references land on whatever heading is on top
of the shared stack.

**Keep the probe, shrink the annotation, change its purpose.** Under Google parity the probe is no
longer a pruning input, so it does not get deleted — it becomes the mechanism that enforces the
site's no-hidden-at-mobile rule. Still annotate only **outermost** hidden-at-mobile boundaries
(~9 per page, ~200 bytes) rather than every element (~3,000, ~57 KB): pruning is subtree-wide and
so is reporting, so the inner 2,988 labels are never read either way.

**Typewriter sizer — not a blocker, but fixture it.** Measured inside the mobile H1: six spans, of
which only two are hidden — one-word `aria-hidden="true"` + `visibility:hidden` sizers containing
"Efficiency". The typewriter **text itself is visible at mobile** (`EfficiencyAutomation`,
`Automation`). So pruning hidden-at-mobile removes a layout spacer, not content;
`VisibleTextExtractor.FindSizer` (`:63-76`) then returns null and `ExtractHeadingText` falls through
to plain `Extract` over the visible spans. Cover with a fixture; do not treat as blocking.

**Separate pre-existing bug — mangled H1, affects every hierarchy path.** That H1's text is already
`"Redefine Your BusinessEfficiencyAutomationEfficiencyAutomation"`: both responsive variants sit
inside the *same* H1 and no word boundary separates them. This string is the **root of every
hierarchy path** for this site, so it is a live suspect for exact-path match failure at
`GccGenerateService.cs:687` — independent of everything else in this plan. Decide whether the
builder should de-duplicate sibling responsive variants within a single heading, and pin the
expected H1 text in a fixture.

**Builder note.** `PageSectionTreeBuilder.cs` uses HtmlAgilityPack (`node.SelectNodes(".//a[@href]")`
at `:135`). AGENTS.md forbids regex for HTML but this is a real DOM parser, so it is compliant;
leave it. Add a `BuilderVersion` const here and bump it on every behavioural change.

**Duplicate-outline handling.** The homepage emits the outline twice. Both copies are complete, so
either is correct — but they must not both be harvested into one list. Dedupe is handled in §3 by
href, and match selection by §3's page-first ordering.

## 3. GeekAPI — make the harvest correct

`Services/ContentCreator/GccGenerateService.cs`.

**3a. Match the page the operator chose.** `FindMatchedSectionHit:696-700` currently orders by
`DeeperHeadings` → `LinkCount` → *then* `sourcePageUrl`. A barren subtree on an unrelated page can
outrank the right one. (Secondary suspect now — §2c fits the symptom better — but wrong either
way.) Make `sourcePageUrl` a hard filter when
supplied; only fall back to other pages if it yields no match at all, and say so in diagnostics.

**3b. Define "tool link".** `UniqueToolLinks:777-793` accepts any anchor with text length 0<n<80 —
no href, domain, or rel filter. Add a predicate: same-origin path starting `/tools/`, **or**
off-domain product links, configurable. Restore `Rel` to `PageSectionLinkDto`
(`GccJobsAndSeo.cs:602`) — Geek-SEO captures it (`PageSectionTreeBuilder.cs:126`) and the API drops
it — and exclude `nofollow`/`sponsored` if that proves noisy.

**3c. Dedupe by href, then text.** Today two labels for one product = two tools; two products both
labelled "Learn more" = one tool. On the verified section this is the difference between 19 and 17.

**3d. Delete the fallbacks.**
- Heading-as-tool-name (`:519-532`) — this is what produced 6 fake tools.
- Leaf→root `HierarchyPathAttempts` widening (`:479-492`).
- `MinAcceptedTools = 2` (`:461`) — with 3b in place, **1 qualifying link is a valid result**.

**3e. Separate the two empty cases.** `:501` (no section matched) and `:517` (matched, no links)
both return `[]`. They must be distinct errors: *"hierarchy section not found — re-match"* vs
*"this section contains no tool links"*. Note the real heading is "**Automated** Ad Spend
Optimization" while a saved path may read "Ad Spend Optimization"; exact case-insensitive equality
at `:687` fails on that drift, and after 3d nothing absorbs it — so this error split is required,
not optional.

**3f. Downstream gate.** `Services/Workflow/Services/ToolPageGenerator.cs:250-274` prefers
`project.HierarchyToolsByHeading` only when `Count >= 2`; align with the new single-tool rule.
Leave the hub `+1` at `:116-117,:161` alone — it is a progress total, not a tool count.

## 4. Docs

Correct `fix-generate-tools-h4-h5-harvest.md` (its "4 h5s / ~17 tools on ai-marketing-systems"
premise is wrong on URL and h5 count) and mark
`critique-durable-html-generate-tools.md` resolved by this plan.

---

## Verification

1. **Unit** — `PageSectionTreeBuilder` against a saved, **crawler-annotated** copy of the homepage:
   assert the h4 "Automated Ad Spend Optimization" node yields 4 h5 descendants and 17 unique
   `/tools/` hrefs. This is the regression guard; it needs no network.
1b. **Unit — heading drop.** A fixture with a `data-gsv="desktop-only"` heading must produce that
   heading as a node with its children nested *under it*, never reparented to the previous heading.
   This is the §2c guard and it fails on today's code.
2. **Round-trip** — run one Through Coverage crawl; assert `HtmlGzip` is non-null, `HtmlBytes`
   ≈1.4 MB with stored size ≈80 KB, and `BuilderVersion` set.
3. **Replay** — call `rebuild-page-section-trees`; assert `TreeJson` is byte-identical to the crawl
   output and `skippedMissingHtml` counts only pre-migration rows.
4. **The real case** — Workflow on Ad Spend → Generate Tools → **exactly 17 tools**, all
   `/tools/marketing/…`, matching the verified list (meta-advantage, omneky, smartly-io,
   adcreative-ai, jasper, google-ads-smart-bidding, hubspot, salesforce-einstein, madgicx,
   basis-technologies, adobe-mix-modeler, optimove, tableau-ai, monte-carlo, anomalo,
   great-expectations, qualytics). No duplicates from the twice-rendered outline.
5. **Honest empty** — a section with no tool links returns the "no tool links" error, never
   invented heading names.
6. **Page fidelity** — assert no returned tool originates from a page other than the selected
   `sourcePageUrl`.
7. **Egress** — assert the normal tree read path does not transfer `HtmlGzip`.

## Out of scope

- Changing the mobile-first crawl policy — the probe shows mobile is not lossy here.
- Writing tools onto the Workflow project as a catalog.
- Re-capping tool counts elsewhere in the job pipeline.
