# Critique: "Durable HTML + honest Generate Tools" plan (rejected)

Status: critique / not implemented
Date: 2026-08-20

## Context

Critique of the rejected "Durable HTML + honest Generate Tools" plan. Its premise: *after finding
the keyword on the page, read all children from the crawl and parse the anchors/links for tool
names.*

After reading the code in all three repos, the headline finding is that **the premise is already
implemented, exactly as stated.** The plan therefore solves a problem one layer away from the one
it diagnoses, and leaves the real precision bugs untouched.

Repos referenced: `../GeekBackend/GeekAPI`, `../Geek-SEO`, this repo.

---

## 1. The premise already ships (load-bearing fact)

`GccGenerateService.ExtractToolsUnderMatch`
(`../GeekBackend/GeekAPI/Services/ContentCreator/GccGenerateService.cs:494-535`):

```csharp
var matched = FindMatchedSection(pageTrees, keyword, sourcePageUrl, hierarchyPath);
if (matched is null) return [];
foreach (var node in FlattenSections([matched]))      // :507 — recursive, unbounded depth
    foreach (var tool in UniqueToolLinks(node.Links)) // :509
        if (seen.Add(tool.Name)) tools.Add(tool);
```

`FlattenSections` is fully recursive with no depth limit. Links *are* in TreeJson per node:
`PageSection.Links : IReadOnlyList<PageSectionLink(Text, Href, Rel)>`
(`../Geek-SEO/GeekSeo.Application/Models/CrawlerModels.cs:23-50`), populated at
nearest-enclosing-heading granularity by `PageSectionTreeBuilder`
(`../Geek-SEO/GeekSeoBackend/Services/SiteExtraction/PageSectionTreeBuilder.cs:85-128`), including
anchors nested inside `<p>`/`<li>` (`:101-110`, `:244`) and inside `data-gsv="desktop-only"`
regions (`:152-222`).

So "find keyword → walk all descendants → harvest anchors" is the current primary path.
`linksUnderMatch=0` is a statement about the crawled DOM, not about the walk.
**The plan is right that the tree is honest here.**

---

## 2. VERIFIED 2026-08-20: the plan's core factual claim is false

Playwright probe of the live site, Pixel 7 mobile **and** desktop 1280×900, both after full
scroll + networkidle. The section is on the **homepage** (`https://www.geekatyourspot.com/`);
`ai-marketing-systems` 404s.

- Matched heading is **H4** "Automated Ad Spend Optimization" (not h3).
- **4 h5 children**, each paired with an h6 "Top AI … Tools:" (8 descendant headings total).
- **19 anchors / 17 unique**, every one a `/tools/marketing/…` link.
- Mobile and desktop renders are **identical**.
- The page emits the whole outline **twice** (133 headings; the h4 at index 52 and 108). Both
  copies carry all 8 descendant headings and all 17 links. One copy has width 0; neither is
  `data-gsv`-tagged or `hidden`.

The 17: meta-advantage, omneky, smartly-io, adcreative-ai, jasper, google-ads-smart-bidding,
hubspot, salesforce-einstein, madgicx, basis-technologies, adobe-mix-modeler, optimove,
tableau-ai, monte-carlo, anomalo, great-expectations, qualytics.

The plan's reported "h3 with one nested h4 *Predictive Analytics for Advertising*, no `/tools/`
links" does not exist in this page's outline at all. **The plan measured a different URL.**

Consequences:

- "Ad Spend is honestly empty" is **wrong**. `linksUnderMatch=0` is a real defect in
  crawl → tree → match, not an honest result.
- The "mobile-first crawl is lossy" worry (section 4 below) is **not** the cause here — the two
  renders agree exactly. Section 4 survives only as an unproven general risk.
- Section 6 (cross-page match ranking) is promoted from side note to **leading hypothesis**: the
  plan's barren h3-with-one-child subtree came from another page, which is exactly what
  `FindMatchedSectionHit` (`:696-700`) produces when it ranks link density above `sourcePageUrl`.
- Second candidate, cheap to check: real heading text is "**Automated** Ad Spend Optimization"
  with true path `… › Use Cases › Marketing › Automated Ad Spend Optimization`. Exact
  case-insensitive path equality at `:687` fails against a saved path of "Ad Spend Optimization".

Everything below this line was written **before** the probe. Section 3 (egress), 5 (no href
filter), 6 (match ranking) and 7 (collapsed errors) stand. The original section 2 — reproduced
next — is **retracted**: it accepted the plan's false premise.

## 2b. RETRACTED — original argument that the fix cannot change the symptom

The plan concludes "the parser matches the page; there are genuinely no tool links under Ad
Spend" — then spends items 1 and 2 (new `Html` column, EF migration, persistence plumbing, new
rebuild endpoint) on durable HTML + reparse.

Reparsing HTML that contains no anchors yields the same zero anchors. **Durable HTML changes
nothing about Ad Spend Optimization.** Reparse-without-recrawl is genuinely useful infrastructure,
but the plan is framed and scoped as though it were the fix for the motivating symptom. Two
different projects sharing one document.

It also concedes its own point in item 2: *"Fail rows with missing HTML (pre-migration crawls) …
those need one new crawl."* Every existing profile still needs a re-crawl. The thing it criticized
("operator must re-crawl and hope") stays true this round; payoff starts only at the *second*
future parser change.

---

## 3. Reverses a documented decision without arguing against it

`../Geek-SEO/GeekSeoBackend/Services/SiteAnalyzerStepRunners/SiteAnalysisStepArtifactStore.cs:41-61`
drops HTML on purpose, with the reason in a comment:

> "Crawl HTML is kept in memory for extractors but must not be written into `analysis_step_log` —
> SPA shells can be megabytes per page and explode Supabase egress."

→ `.Select(p => p with { Html = string.Empty })` (`:59`).

The plan proposes a text column holding exactly that payload and never mentions the tradeoff.
Missing: size estimates, compression, object storage vs. a Postgres text column,
retention/pruning, and whether trees × pages × profiles stays bounded. Also missing: a
`BuilderVersion` column — without one you cannot tell which parser produced which rows, which is
half the point of a rebuild endpoint.

Cheaper alternative worth pricing first: persist a **normalized DOM slice** (headings + anchors +
`data-gsv` labels) instead of full page HTML. Nearly all the reparse value at a fraction of the
bytes — and TreeJson is already most of the way there.

---

## 4. Enshrines a possibly-lossy artifact as source of truth

The crawl renders as **Pixel 7 mobile**
(`../Geek-SEO/GeekSeoBackend/Services/SiteExtraction/CrawlerIdentity.cs:12-26`), then resizes to a
1280×900 desktop probe purely to annotate elements with `data-gsv`
(`SitePageCrawler.cs:379-390`). There is no separate desktop fetch.

The plan declares stored HTML "the durable primary capture" while putting *"changing mobile-first
crawl policy"* out of scope. If the mobile render is where tool links get lost — accordion, tab
panel, lazy list, JS-gated section — you persist the deficient artifact forever and call it SOT.
Rule 1 cannot be locked in while the fidelity of that capture is explicitly not examined.

The plan cites checking live HTML under "desktop and mobile UA," but a raw UA fetch is not what
the crawler produces. That evidence does not settle the question it is used to settle.

---

## 5. Removes over-counting from the fallbacks, leaves it in the primary path

Biggest substantive miss. `UniqueToolLinks` (`GccGenerateService.cs:777-793`) applies **no href
filter, no domain filter, no rel filter**:

```csharp
var name = (link.Text ?? "").Replace('\n',' ').Trim();
if (name.Length == 0 || name.Length >= 80) continue;  // :786 — the ONLY gate
if (!seen.Add(name)) continue;                        // dedupe by TEXT, case-insensitive
```

Consequences on the "honest" path the plan keeps:

- Every breadcrumb, "Read more", inline citation, CTA, and related-post link under the matched
  subtree becomes a "tool".
- Dedupe is by anchor **text**: one product under two labels = two tools; two products both
  labelled "Learn more" = one tool.
- Rule 3 — "one real tool link is valid, drop the ≥2 gate" — makes precision *worse* in this
  state. The crude `MinAcceptedTools = 2` (`:461`) was papering over precisely this. Removing it
  without adding a link qualifier trades a known-crude filter for none.

Honest requires a definition of "tool link": an href predicate (`/tools/…`, off-domain product
links, `rel` handling — `Rel` exists on the Geek-SEO model and is **dropped** from the API DTO at
`GccJobsAndSeo.cs:602`) and dedupe by href-then-text. None of that is in the plan.

---

## 6. Preserves a cross-page fallback while banning the others

Rule 2 bans widening, but the plan keeps "richest-path scoring among identical path strings across
pages," calling it *"disambiguation, not a parent fallback."* What that scoring does
(`FindMatchedSectionHit`, `:696-700`):

```csharp
OrderByDescending(DeeperHeadings)
  .ThenByDescending(LinkCount)
  .ThenByDescending(matches sourcePageUrl)
```

`sourcePageUrl` is the **third** tiebreak, behind link density. A section on a page the operator
never selected can win — and preferentially will, because it has more links. From the operator's
seat that is indistinguishable from a fallback: tools arrive from somewhere else. If you are going
anti-fallback, this is the first thing to fix, not the one thing to keep.

---

## 7. Two distinct failures collapse into one silent result

`ExtractToolsUnderMatch` returns `[]` for both "no section matched" (`:506`) and "matched, zero
links" (`:517`). Removing ancestor widening removes the only thing absorbing exact-path mismatch —
`hierarchyPath` is a saved snapshot string compared with exact case-insensitive equality (`:687`),
so heading-text drift between crawls becomes `[]`. Post-change these must be different errors, or
every drift gets misreported to the operator as an honest empty.

---

## 8. What holds up

- The diagnosis that the tree matches the page and Ad Spend genuinely has no tool anchors.
- Killing the heading-as-tool-name fallback (`:519-532`) — that is what produced "6 tools" from a
  barren section.
- Killing leaf→root `HierarchyPathAttempts` widening (`:479-492`).
- Rebuild-from-stored-input as a capability, on its own merits.
- Correcting the docs: Ad Spend on `ai-marketing-systems` is not a tools section, and the
  "4 h5s / ~17 tools" expectation in `docs/plans/fix-generate-tools-h4-h5-harvest.md` came from a
  different URL.

---

## Recommended split

**A. Ground truth — DONE 2026-08-20.** Answer: the anchors **exist** in the crawler's own mobile
render (17 unique `/tools/` links under the h4) and are being lost somewhere in
crawl → TreeJson → match. See section 2 above. Remaining sub-question, now narrow: dump the stored
`TreeJson` for this profile and find which node the matcher actually returned — confirm whether it
came from a different page (ranking bug, `:696-700`) or whether the homepage tree itself is
missing the h4's subtree (builder/crawl bug). That single dump decides B vs. C priority.

**B. Precision on the honest path** (small, high value, no migration). Define "tool link" with an
href predicate; restore `Rel` to the API DTO (`GccJobsAndSeo.cs:602`); dedupe by href-then-text;
make `sourcePageUrl` a hard filter or the primary tiebreak (`:696-700`); split no-match from
empty-match errors; then drop the heading fallback and path widening.

**C. Durable reparse** (separate plan). Argue it against the egress comment, price a normalized
DOM slice vs. full HTML, add a builder-version column, define retention. Justify it as reparse
infrastructure — not as the Generate Tools fix, which it is not.

## Verification for B

1. Run Generate Tools against a section with known tool links; assert count equals unique
   qualifying hrefs under that node only.
2. Run against Ad Spend; assert distinct "no tools in this section" vs. "section not found".
3. Run against a section with exactly one qualifying link; assert 1 — not 0, not widened.
4. Confirm no result comes from a page other than the selected `sourcePageUrl`.
