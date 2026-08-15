# Part 3 (rewritten): Crawl Like a Search Engine

*Replaces `docs/plans/mobile-first-crawl-part-3-render-always.md` in full. On execution, write the
final version to that path (Parts 4 and 5 below carry over largely unchanged).*

## Program goal — this document is Phase 1, not the destination

**The objective, stated by the user directly:** Site Analyzer should perform **exactly as a search
engine**, end-to-end, built in phases — not merely fetch pages the way one does. Everything in this
document — robots.txt, status codes, canonical/directives, the visibility model, quiescence — is the
**fetch and extraction layer** of that objective. It is Phase 1. A real search engine is also an
index, a ranking function, a query-serving path, and crawl-budget/scheduling infrastructure across
many pages and runs — none of that exists yet and none of it is in this document. The "Not in this
document" section at the end of this plan is not a set of permanent exclusions; it is the reading
list for Phase 2 and beyond, and should be treated and documented as such, not as scope this project
has decided against.

**This is shared infrastructure, not a Site Analyzer-only feature.** Fetch-layer fidelity is the
immediate goal; most of what a search engine does beyond that is intended to eventually benefit
multiple of the user's apps, not just this one. Treat the crawler as infrastructure being built
once for reuse, not a component scoped to Site Analyzer's current feature set.

**Google is the explicit reference implementation, by deliberate choice, not by default.** Google is
the largest player and the de facto standard for "how a search engine behaves," so its published
behavior (robots.txt/REP, mobile-first indexing, rendering behavior) is what this document mirrors
throughout. This is a considered choice, confirmed with the user — not an unstated assumption.

**Second, separate strand — GeekContentCreator.** GeekContentCreator (this repo) currently depends
on Site Analyzer's crawl output — the child-heading tree and the tool lists pulled from crawled
pages, via `hierarchy-match.ts` and the `PageSection` pipeline. The user's direction: branch the
repo (or the architecture) so this handoff — child headings and tools, supplied to Content
Creator — keeps being served as Site Analyzer's architecture grows toward the full objective above.

**This is not "don't break a working integration."** The user has stated GeekContentCreator is
currently in a **non-working order state**. There is no stable baseline to preserve. What
specifically is broken has not yet been established — it needs its own diagnosis before the
GeekContentCreator branch can be scoped with the same rigor as Phase 1 above. Treat this as an
**open item**, not a solved one: the shape of "a branch that supplies child headings and tools to
Content Creator" depends on what state GeekContentCreator's consuming code is actually in, which is
not yet known.

## Context

**The fetch layer exists in code today; it does not work correctly.** It is not a working baseline
being extended for fidelity — it is broken in the specific ways this document exists to fix:
duplicate headings from an undifferentiated visibility strip, silent degradation to unrendered HTML
when Chromium is unavailable, no robots.txt, no redirect or status tracking, hardcoded exclusion
lists standing in for real crawl logic. "Fetch layer" names what this document builds, not what
already runs correctly.

The previous Part 3 diagnosed three real bugs (silent HTTP fallback, `InnerText` losing `<br>` and
block boundaries, the tool-list regex) and those diagnoses still hold. But its central
justification was wrong.

§3.3 argued the hidden-element strip was how we mirror Googlebot. **It is the opposite.** Googlebot
renders at a mobile viewport and then *fetches, renders, and indexes* `display:none` and
`visibility:hidden` content — it discounts hidden text at ranking time, it does not delete it at
fetch time. Our crawler runs `el.remove()` on every computed-hidden node
(`SitePageCrawler.cs:275-284`) before it has read a single link, so anchors inside collapsed mobile
nav, accordions, and tab panels are invisible to BFS. That is a crawler that sees *less* than a
browser, not one that sees what Google sees.

The audit turned up that the strip is one item on a long list. `SitePageCrawler` today:

- never fetches `robots.txt` (`PlaywrightCrawlerProvider.cs:73-121` has a parser; the main crawler
  bypasses `ICrawlerProvider` entirely and never sees it);
- discards every HTTP status — non-2xx pages just vanish (`:269-273`), so there is no 404/500/301
  inventory;
- stores the *requested* URL, never `response.Url`, so a redirect target is filed under its source
  and the real final URL never enters `seen` — the same page gets crawled twice under two spellings;
- never reads `rel=canonical`, `rel=nofollow`, `X-Robots-Tag`, or `hreflang` (zero occurrences of
  the last three anywhere in the repo);
- conflates `noindex` with soft-404 via a substring hack (`IsSoft404`, `:319-337`) and *drops* the
  page — where Google crawls it, follows its links, and merely withholds it from the index;
- keeps `?utm_source=` variants as distinct URLs and treats `www.`/apex and `http`/`https` as
  different sites (`:214-215`, `:339-347`);
- hits one origin with 6 unthrottled concurrent requests, with no `Retry-After`, 429, or 503
  handling;
- snapshots at a flat 400 ms after `DOMContentLoaded` (`:29`, `:274`) — no quiescence, so slower JS
  sites are captured mid-render;
- discovers links with a regex over raw HTML (`:381-384`) — an outright `AGENTS.md` violation;
- runs `queue.Contains(url)` per discovered link (`:149`) — an O(n) scan making wide crawls O(n²).

**Decisions taken with the user:**

1. **Stop stripping entirely.** Nothing is removed from the DOM.
2. **Mirror search engines, period** — all four fidelity areas (robots, status/redirects,
   canonical/meta-robots, URL canonicalization + politeness).
3. **Quiescence with a hard cap** replaces the flat 400 ms.

Standing goal, out of scope but shaping the design: this crawler should eventually be reusable as
the fetch layer of the user's own search engine. So the crawl output must become a proper crawl
*record* — URL, final URL, status, headers, directives, rendered DOM — not a bare HTML string.

**The reframe that organizes everything below:** separate the **fetch/render layer** (mirrors
Googlebot; faithful, lossless, opinion-free) from the **extraction layer** (our product's content
model; opinionated). Every past confusion in this plan came from doing extraction work inside the
fetch layer.

---

# Part 3A — Fetch layer: mirror the protocol

### 3A.1 Fail closed when there is no browser (unchanged, still highest impact)

Part 1 only modified `FetchWithPlaywrightAsync`. `FetchWithHttpAsync` (`:306-317`) is a bare
`GetStringAsync`, and mode is chosen solely by `browser is not null` (`:78-80`), so a Chromium
launch failure silently degrades the whole crawl to raw HTML. Google has no non-rendering mode.

- `browser is null` → **fail the crawl step** with a named error ("crawl requires a rendering
  browser; Playwright/Chromium unavailable"), matching the fail-closed precedent of `281ec37`. The
  frontend already renders `body.error` (`site-analyzer-client.tsx:212-214`).
- Delete `FetchWithHttpAsync`, `BuildClient`, the `IHttpClientFactory` ctor dependency, and
  `HttpFetchTimeoutSeconds`.
- `PlaywrightBrowserHolder.InitializeAsync` — log loudly on launch failure; retry on first use so a
  transient startup failure doesn't poison the process lifetime.
- Confirm the re-run entry points (`SiteAnalysisStepRerunService.cs:251,296`,
  `SiteAnalysisStepExecutionService.cs:262-273`) surface the error rather than producing an empty
  crawl. HTTP mode *was* the manual-re-run mode; removing it is intended.
- Note (do not necessarily fix) the other `IBrowser?` consumers that can still inject un-rendered
  content into the same analysis: `PageContentExtractor.cs:17`, `HomepageHeadingsExtractor.cs:20`,
  `SchemaOrgExtractor.cs:19` (which deliberately falls back to an HTTP+regex JSON-LD read).

### 3A.2 A real crawl record

`CrawledPage(string Url, string Html, string FetchMethod = "http")`
(`GeekSeo.Application/Models/Seo/SiteAnalysisModels.cs:337`) is too thin to hold what a search
engine needs. Extend it — additively, with defaults, so the ~15 existing `page.Html` consumers keep
compiling:

```csharp
public sealed record CrawledPage(
    string Url,                 // as requested
    string Html,                // rendered DOM (now annotated, never stripped)
    string FetchMethod = "http")
{
    public string FinalUrl { get; init; } = "";      // response.Url after redirects
    public int StatusCode { get; init; }
    public IReadOnlyList<string> RedirectChain { get; init; } = [];
    public string? Canonical { get; init; }
    public bool NoIndex { get; init; }
    public bool NoFollow { get; init; }
    public bool SoftNotFound { get; init; }
    public DateTimeOffset FetchedAt { get; init; }
}
```

This record is the forward-compatible seam: a search-engine indexer later consumes exactly this.

### 3A.3 robots.txt

Fetch `/robots.txt` **once per origin** at crawl start, cache for the run, and gate every URL.

Reuse `PlaywrightCrawlerProvider.IsAllowedByRobotsTxtAsync` / `IsPathDisallowed`
(`:73-122`) — but it is naive and must be hardened before it becomes the site-wide gate. It does
prefix `StartsWith` only: no `*` wildcard, no `$` anchor, **no `Allow:` handling at all** (so an
`Allow:` carve-out inside a `Disallow:` is ignored), and no most-specific-group selection. Bring it
to RFC 9309 / Google's REP:

- most-specific matching user-agent group wins; fall back to `*`;
- `*` wildcard and `$` end-anchor in paths;
- **longest match wins** between a matching `Allow` and `Disallow`; ties go to `Allow`;
- robots.txt 4xx → allow all; 5xx or unreachable → **disallow all** (Google's behavior; today it
  fails open at `:82-83, :89-91`);
- also parse `Sitemap:` lines here and feed them to the frontier — `SitemapExtractor.cs:41-63`
  already does this but discards all but the first hit.

Extract the parser into its own testable class (`Services/SiteExtraction/RobotsTxt.cs`) so both
`SitePageCrawler` and `PlaywrightCrawlerProvider` share one implementation.

**Note:** hardening this parser changes behavior for `PlaywrightCrawlerProvider`'s existing callers
too (e.g., flipping unreachable-robots.txt from fail-open to fail-closed), not just the new call
site — verify its current consumers tolerate the stricter behavior.

### 3A.4 Status codes, redirects, and identity

- Record `response.Status` and `response.Url` on every fetch. Non-2xx pages are **kept as records**
  with their status, not silently dropped — that inventory is the point of a crawl.
- Add the **final URL** to `seen` as well as the requested one, and record the redirect chain. This
  is what stops the same page being crawled under two spellings.
- 3xx: Playwright follows natively; capture the chain from `response.Request.RedirectedFrom`.
- 4xx: record, do not follow links. 5xx / 429: see politeness below.

### 3A.5 Directives — replace the `IsSoft404` hack

Delete the substring check at `:319-337`. Read directives from the rendered DOM and the response
headers:

- `<meta name="robots">` and `<meta name="googlebot">` — parse the comma-separated token list, so
  `noindex,nofollow` finally matches (today's exact-string check misses it).
- `X-Robots-Tag` response header — currently headers are discarded entirely.
- `rel=canonical` — record it. Do **not** drop non-canonical pages; Google treats canonical as a
  hint and consolidates at index time. This gives us a real duplicate report instead of the
  page-level duplicates currently papered over.
- `rel=nofollow` / `rel=ugc` / `rel=sponsored` on anchors — record on the link; Google has treated
  these as hints since 2019, so keep discovering by default but carry the flag.
- **`noindex` means crawl it, render it, follow its links, exclude it from the index** — set
  `NoIndex = true` and let downstream decide. Today we throw the page away. **Open gap:** no
  downstream consumer of `NoIndex` is named yet in "Files to change" below — until Phase 2 has an
  actual index to exclude pages from, this field has no reader. Land it anyway (the record shape is
  the point), but don't consider this directive "handled" until something reads it.
- Keep a soft-404 *heuristic* (title/h1 patterns) but run it over the DOM, set `SoftNotFound`, and
  do not delete the page.

### 3A.6 URL canonicalization and site identity

New `CrawlUrl` helper (extend `SiteUrlNormalizer.cs`, today only 8 lines):

- strip fragment (already done at `:366-369`);
- lowercase scheme and host, drop default ports;
- **keep path case** — `seen` is currently `OrdinalIgnoreCase` (`:53`), which wrongly merges
  distinct paths on case-sensitive servers. Host-insensitive, path-sensitive.
- strip known tracking params (`utm_*`, `gclid`, `fbclid`, `msclkid`, `mc_cid`), sort remaining
  query params;
- treat `www.`/apex and `http`/`https` as the **same site**. A plain "strip leading `www.`, ignore
  scheme" comparison is almost certainly sufficient here — do not pull in a public-suffix-list
  dependency for full registrable-domain comparison unless a concrete case demands it; that would be
  solving a harder problem than this crawler (same-origin BFS on one site per run) actually has.
  Applies in `TryResolveUrl` (`:214-215`) and `TryNormalizeSameOrigin` (`:339-347`). Today's
  exact-authority `StartsWith` silently discards sitemap entries and internal links that differ only
  by `www` or scheme — pure crawl loss.
- Replace the O(n) `queue.Contains` (`:149`) with a `HashSet`-backed frontier.

### 3A.6b Delete the hand-rolled exclusion lists — robots.txt is the mechanism

Search engines have no hardcoded opinion about which of a site's URLs deserve crawling. Google
crawls `/cart`, `/login`, `/search`, and `/feed` unless robots.txt says otherwise; that is precisely
what robots.txt is *for*, and it is the site owner's call, not the crawler's. We currently override
the site owner with two hardcoded lists:

- **`HardJunkPaths.cs:12-23`** — skips `cart, checkout, account, login, register, signup, logout,
  wp-admin, wp-login, wp-json, feed, rss, search, cdn-cgi`. Delete it as a *crawl* filter. Once
  3A.3 lands, robots.txt covers the real cases (nearly every site already disallows `wp-admin` and
  `/cart`), and anything a site chooses to leave crawlable, we crawl — like Google.
- **`SkipExtensions` (`SitePageCrawler.cs:31-35`)** — skips `.pdf`, images, and `.xml`. Google
  **indexes PDFs** as first-class documents and crawls images for Image Search. Narrow this to
  genuine non-documents (`.css`, `.js`, `.woff`, `.woff2`, `.zip`) and record the rest in the crawl
  inventory with their content type. Full PDF text extraction is out of scope for this plan, but
  the URLs must stop silently vanishing. Drop the `.xml` skip so nested sitemap indexes are followed.

Note both lists are also used for *topic/pillar selection* (`NoisePaths`, and the doc at `:227-231`
is explicit that hard-junk is crawl-side while noise is selection-side). Selection is the extraction
layer, where product opinion is legitimate — keep `NoisePaths` there. This change removes the
opinion from the **fetch** layer only, which is exactly the two-layer rule.

**Compounding risk, not just an individual one:** this removal, §3A.8's slower per-page render, and
the wider URL space from §3A.6's `www`/scheme merging all move in the same direction — more pages,
each slower to fetch — on a crawler that is explicitly uncapped by design (no page cap, no
attempt-budget soft-stop). A site with a crawler trap (faceted nav, calendar widget, endless
pagination) and a permissive or absent robots.txt could turn an "inventory-complete" crawl into an
effectively unbounded one. Verification 12 and 14 measure URL-count growth and timing separately;
neither catches a site where both compound. This plan does not add crawl-budget protection (that's
Phase 2 — see "Not in this document"), so at minimum this risk needs to be watched for during
verification against a real site with these patterns, not just `geekatyourspot.com`.

### 3A.7 Politeness and adaptive rate

Googlebot has no fixed rate; it backs off on host distress. Minimum viable version:

- honor `Retry-After` on 429 and 503, with exponential backoff and a bounded retry count;
- reduce concurrency for the run after repeated 5xx/429 from the origin, restore on sustained
  success (the crawler is same-origin per run, so this is effectively per-run, not truly per-host);
- small inter-request delay so 6 concurrent hits aren't continuous.
- `Crawl-delay` is officially unsupported by Google; parse it and honor it as courtesy if present,
  but adaptive backoff is the primary mechanism.

### 3A.8 Render fidelity: quiescence with a cap, plus resource policy

Replace `WaitUntilState.DOMContentLoaded` + flat `WaitForTimeoutAsync(400)` (`:266`, `:274`):

- navigate with `WaitUntil = Load`, nav timeout 15 s (unchanged);
- then a bounded quiescence wait: no in-flight network requests for ~500 ms, capped at a
  configurable `RenderQuiescenceCapMs`. **Set this to ~5000 ms, not 2500.** Google's renderer has no
  short fixed timeout; a page that needs 4 s to render is a page Google renders. Most pages hit
  quiescence far earlier, so the cap is a ceiling, not a cost.
- **Resource policy: abort only ads, analytics, and beacons.** An earlier draft blocked images,
  media, and fonts to buy latency. That is wrong on this principle twice over: Googlebot fetches
  images, and — decisively — missing images and fonts shift layout, which changes computed
  visibility, which corrupts the very `data-gsv` signal 3B depends on. Trackers are safe to drop
  because they affect no layout and Google gains nothing from them either. The tracker blocklist
  must stay conservative for the same reason — a wrong entry that blocks something with real
  layout/content impact reintroduces exactly the corruption this section exists to avoid.
- **Consequence, stated plainly:** removing the resource blocking removes the thing that was paying
  for the longer render wait. Per-page cost goes *up*, and Part 3B's dual-viewport probe (below)
  adds a further cost on top of that. The 15-minute job budget (`4564782`, `:25-29`) becomes the
  binding constraint on an uncapped crawl. That is a scheduling problem to solve at the job layer —
  a per-run page budget with resumable continuation, which is how a real search engine handles it
  anyway — **not** a reason to snapshot pages earlier than Google would. Measure first
  (verification 14); if it binds, bound crawl breadth, never per-page fidelity.
- **Identify honestly — that is the mirrored behavior.** Search engines announce themselves;
  Googlebot says it is Googlebot and publishes reverse-DNS verification so sites can confirm it. A
  crawler impersonating Googlebot mirrors nothing and defeats the mechanism. Keep today's pattern
  (`:69-70`) — real-device prefix + `(compatible; GeekSEO/1.0; +url)` —
  and **unify all five UA strings** in the backend (`SitePageCrawler.cs:69,376`,
  `HomepageHeadingsExtractor.cs:32`, `SchemaOrgExtractor.cs:136`, `PlaywrightCrawlerProvider.cs:29`,
  `SeoBackendExtensions.cs:145,154`) onto one shared constant. Note `PageContentExtractor.cs:30`
  sets no UA at all and leaks "HeadlessChrome", which WAFs block.
- Verify the mobile emulation (`:71-74`, currently 412×823 @ DSR 1.75) against Google's published
  Googlebot Smartphone profile and align height/DSR; the 412 width is right.

---

# Part 3B — Annotate visibility, never delete

Nothing is ever removed from the DOM. Instead the crawler records *why* something is hidden, because
mobile-first indexing treats two kinds of hidden completely differently:

| Kind | Example | Googlebot | `data-gsv` |
|---|---|---|---|
| Visible at 412 px | normal content | indexed | `visible` |
| Hidden at 412 px **and** at desktop | accordion, tab panel, hamburger drawer | **indexed at full weight** — reachable by tapping | `collapsed` |
| Hidden at 412 px, **visible** at desktop | `class="hidden lg:block"` | **not in the mobile index** — it is the desktop site, and no tap on a phone reveals it | `desktop-only` |

The third row is the duplicate hero, and it is the reason no dedupe is needed: Google renders the
mobile layout, so it only ever sees *one* hero. Dropping `desktop-only` from the content tree is
mirroring mobile-first indexing, not diverging from it. The second row is the content the old strip
destroyed — accordion answers and nav drawers that Google indexes in full.

The two cases are separable without guessing, by probing both widths in the same already-loaded page
(a reflow, not a second navigation):

```js
() => {
  const hidden = el => { const s = getComputedStyle(el);
    return s.display === 'none' || s.visibility === 'hidden'; };
  const all = [...document.querySelectorAll('*')];
  const atMobile = new Map(all.map(el => [el, hidden(el)]));   // viewport already 412
  // caller resizes the viewport to desktop width, then:
  all.forEach(el => el.setAttribute('data-gsv',
    !atMobile.get(el) ? 'visible' : (hidden(el) ? 'collapsed' : 'desktop-only')));
  return document.documentElement.outerHTML;
}
```

Driven from C# as: read mobile map → `page.SetViewportSizeAsync(1280, 900)` → read desktop map →
annotate → restore. Annotating *every* element (not only hidden ones) makes the nearest annotation
authoritative, so a `visibility:visible` child inside a `visibility:hidden` parent needs no ancestor
walk.

**Risk in the probe itself:** resizing the viewport is not guaranteed to be layout-only. Sites that
bind JS to `resize` or `matchMedia` (not just CSS) — swapping mobile-menu markup rather than toggling
its CSS, for instance — can mutate the DOM between the mobile read and the desktop read, so the two
`querySelectorAll('*')` passes may not describe the same set of nodes. Watch for this during
verification 5's viewport-classification tests on real, JS-heavy markup, not just static fixtures.
This also has a real cost not netted out in 3A.8's "consequence" paragraph: a full computed-style
pass over every element, twice, plus a resize round-trip, on every single page.

Consumers then split cleanly:

- **link discovery, canonical, JSON-LD, inventory read the full DOM** — Google's view. Anchors in
  collapsed nav drawers become discoverable for the first time.
- **the content tree reads `visible` + `collapsed`, and skips `desktop-only`** — full weight for
  collapsed content exactly as Google gives it, and the duplicate hero gone by construction.

**Consumers that must learn to respect `data-gsv`, or they will silently regress.** They currently
receive pre-stripped HTML and assume all text is visible; once hidden text is retained they will
inflate. Each must count `visible` + `collapsed` and exclude `desktop-only` — which is also what
makes their word counts match what Google weighs:

- `NormalizedTopicalityCalculator.VisibleText` / `EstimateWordCount` (`:40`, `:63`, `:142`)
- `SiteAnalysisStepRelationalLoader.ExtractVisibleText` (`:437`, `:442`, `:544`)
- `CompetitorAnalysisService.cs:130`, `CompetitorPageFetcher.cs:54-58`
- `SiteAnalysisContentCoverageMatcher.cs:232`
- `PageSectionTreeBuilder` (Part 3C)

Give them one shared `VisibleTextExtractor` rather than five ad-hoc strippers.

**Storage:** retained hidden DOM plus per-element attributes grows the persisted HTML. Measure on
`geekatyourspot.com` before and after; if it matters, persist the visible projection alongside a
compressed full DOM rather than reverting the decision.

**Still not stripping `opacity: 0`** (rationale unchanged and now doubly consistent): scroll-reveal
libraries set `opacity:0` as the initial state on real below-the-fold content, the crawler never
scrolls, and Google doesn't drop it either.

---

# Part 3C — Extraction layer: Google-like text from the DOM

### 3C.1 Fix `InnerText`

`PageSectionTreeBuilder.cs:45` uses `WebUtility.HtmlDecode(node.InnerText)`. HtmlAgilityPack
concatenates descendant text with no separator and treats `<br/>` as contributing nothing:

```html
<h2>Clone Yourself<br/><span class="text-[#C83803]">Work 24/7</span></h2>
```

→ `Clone YourselfWork 24/7`. Google treats `<br>` and block boundaries as word separators. **This
survives a perfect render** — it is not a duplicate problem. `CleanAndExtractLinks` (`:88-112`) has
the identical defect on the paragraph path.

One shared DOM-walking extractor, applied at both `:45-46` and `:108-110`, which:

- appends a space at `<br>` and on entering/leaving block-level elements (`div`, `p`, `li`,
  `section`, `h1`–`h6`, `td`, …);
- skips `<script>`, `<style>`, `<template>`, `<noscript>`;
- **skips `data-gsv="desktop-only"` subtrees, keeps `collapsed` and `visible`** (3B), except per the
  aria-hidden rule below;
- HTML-decodes, collapses whitespace, trims.

Stays DOM-based per `AGENTS.md` — collapsing whitespace on already-extracted text is string work,
not parsing.

### 3C.2 Animated headings — keep the aria-hidden sizer

The H1 typewriter has two spans: an `aria-hidden="true"` + Tailwind-`invisible` **sizer** holding
the full word `Efficiency`, and an absolutely-positioned visible span that JS types into. A
*rotating* typewriter never settles, so no wait duration fixes it — quiescence included. Reading the
visible span yields a different partial word every crawl (`…EfficiencyE` today, `…Effici`
tomorrow), which breaks slug matching in `hierarchy-match.ts`.

**Keep the sizer text.** This is an *extraction-layer* choice, not a crawl divergence: the fetch
layer captures both spans faithfully and annotates them, and the tree builder then picks the stable
one because hierarchy slug matching breaks when the value churns between crawls. Product opinion
belongs at this layer by design.

With 3B this is purely a tree-builder rule, no crawler-side special case: within a heading, an
element that is `data-gsv="collapsed"` **and** `aria-hidden="true"` is a stable text carrier and is
kept; when its text and a sibling's overlap (sibling empty, or a prefix of the sizer text) the sizer
wins and the sibling is dropped. Attribute-only, no CSS knowledge.

**This heuristic is fit to one observed pattern.** It works for the specific typewriter component on
`geekatyourspot.com` — "sizer wins when the sibling is a prefix of it." A differently-built animated
heading (different rotation timing, a trailing cursor character, multiple rotating phrases) may not
satisfy "prefix." Define the fallback explicitly rather than leaving it implicit: when the overlap
condition doesn't hold, keep the `aria-hidden`/`collapsed` sizer text and drop the visible sibling
anyway (same outcome, weaker justification) rather than falling through to concatenating both —
silently reintroducing a variant of the exact bug this section fixes, just on a different site.

Net: `Redefine Your Business Efficiency`, once, stable across crawls.

### 3C.3 Widen link harvesting

`CleanAndExtractLinks` only inspects `<p>` (`:65-78`), so anchors in `<li>`, `<div>`, and tables are
never collected — and Part 4 depends on anchors. Harvest anchors from all content elements under a
heading, carrying `rel` alongside text and href.

### 3C.4 Cache invalidation

Already-`ready` analyses replay stored JSON (`GeekBackend GccController.cs:1144` →
`GccGenerateService.DeserializeSitePages`), so nothing is visible until re-analysis. The frontend
sends `force: true` on every Analyze (`site-analyzer-client.tsx:242`) — confirm that genuinely
re-crawls rather than only re-deriving from stored rows.

**No dedupe.** Standing since `f302fbc`: `IsDuplicateHeading` and text-based sibling dedupe stay
dead. Every duplicate is explained by a capture bug.

---

# Part 4 — Delete the tool-list regex, detect structurally

*Carried over unchanged; frontend-only, no backend deploy.*

The homepage tool markup was restructured to:

```html
<h6>Top 5 Automated Data Entry Processing Tools:</h6>
<p><a href="/tools/accounting/zapier">Zapier</a>, <a …>QuickBooks</a>, …</p>
```

`parseHierarchyToolNames` (`hierarchy-match.ts:85`) matches `^Top\s+.+?\s+Tools?\s*:\s*(.+)$` against
paragraph text, requiring label and names in one paragraph. The paragraph now reads
`"Zapier, QuickBooks, Lido, Jotform, UiPath."` — no match, `allTools.Count == 0`, and
`AppendKnownToolsBrief` returns early (`ResearchBriefBuilder.cs:281`), dropping the whole KNOWN
TOOLS block. The contract itself is fine: `HierarchyToolsByHeading` is fully wired
(`ProjectsController.cs:128-149`, `ResearchBriefBuilder.cs:272-315`).

**4.1** Delete the regex entirely. Detect structurally over anchors the crawler already captures: a
paragraph carrying **2+ anchors** is a tool list; each tool's name is the anchor text, its href the
anchor href. No plumbing needed — `PageSectionTreeBuilder.CleanAndExtractLinks` → `PageSection.Links`
(`CrawlerModels.cs:23,41`) → `PageSectionDto.Links` (`GccJobsAndSeo.cs:513-523`) →
`PageSectionNode.links` (`hierarchy-match.ts:8`) already flows end to end.

*False-positive guard:* require the anchors to account for most of the paragraph's non-whitespace
text (a comma-separated run of links) rather than links embedded in prose. Tune against the live
homepage, which has both shapes.

*Bonus fix:* `collectToolsByHeading` (`:110`) maps `{ name }` with no href, so every `Href` is null
downstream — which is why `hasUrls` at `ResearchBriefBuilder.cs:293` never fires. Harvesting anchors
populates hrefs for free.

**4.2** `collectToolsByHeading` already groups by nearest heading, so the H6 becomes the group
heading naturally. Verify the H6-inside-`<li>` case survives tree building (the `74e737d`
h5-inside-`li` test covers the analogous shape).

---

# Part 5 — Leave the touched files regex-free

Standing user preference. `remove-regex-immediate.md` scoped only the 3 heading extractors; the full
147-hit sweep (`remove-regex-full.md`) stays out of scope. But we are rewriting these files anyway.

- **`SitePageCrawler.cs:381-384` `LinkHrefRegex`** — a genuine `AGENTS.md` violation: it parses
  anchors with regex to drive BFS (`ExtractSameOriginLinks`, `:177-193`) and silently misses
  unquoted/single-quoted hrefs. Now subsumed by 3A: extract links from the rendered DOM inside the
  page (`document.querySelectorAll('a[href]')`, returning href + rel + text), which is both correct
  and free — the page is already open. Expect BFS to discover *more* URLs; an increase is the fix.
- **`PageSectionTreeBuilder.cs:134` `WhitespaceRegex`** — parked as trivial in
  `remove-regex-immediate.md`, but 3C.1 rewrites its only callers. Replace with
  `string.Join(" ", text.Split(default(char[]), StringSplitOptions.RemoveEmptyEntries))`.
- **Also now in scope, same reason:** `InternalLinkExtractor.cs:41-43` regexes anchors out of
  crawled HTML and ignores `rel=nofollow`; once 3A returns structured links, it should consume those
  instead of re-parsing.
- **Deliberately keeping:** `slugifyHeading` (`hierarchy-match.ts:41-49`). String normalization, not
  HTML parsing, and it must stay byte-for-byte equivalent to `GccGenerateService.Slugify` — the two
  sides disagreeing breaks hierarchy matching.

---

# Part 6 — Documentation

This work reverses a premise that is written down in several places as settled. Leaving those in
place is how the §3.3 confusion happened in the first place, so the docs are part of the change, not
an afterthought.

### 6.1 New: `Geek-SEO/docs/crawler-architecture.md` (the durable reference)

The one doc that stops this recurring, and the seed for the eventual own-search-engine work. Not a
plan — a standing description of what the crawler *is*:

- **The two layers.** Fetch/render (mirrors Googlebot; faithful, lossless, opinion-free) vs.
  extraction (our content model; opinionated). The rule: no extraction decisions inside the fetch
  layer. Ever.
- **This is Phase 1 of a larger objective.** State plainly that "mirror the crawler" is not the
  finish line — Site Analyzer performing "exactly as a search engine" additionally requires an
  index, a ranking function, a query-serving path, and crawl-budget/scheduling infrastructure, none
  of which exist yet. Point at "Not in this document" in the plan as the Phase 2+ reading list.
- **What we mirror and how** — rendering (mobile viewport, quiescence), REP/robots, status and
  redirect semantics, directive handling, URL canonicalization, adaptive politeness.
- **Where we diverge, and why.** The governing principle is *mirror search-engine functionality and
  results*; a divergence is therefore an exception that must be argued, dated, and listed here — not
  a default. The list is deliberately short:
  | Divergence | Why | Cost |
  |---|---|---|
  | Abort ads/analytics/beacon requests | No layout effect; no indexing value to Google either | Effectively none |
  | No conditional-GET / recrawl scheduling yet | Deferred, not rejected — see the crawl record seam | Re-crawls refetch unchanged pages |
  | PDFs and images recorded in inventory but not text-extracted | Google indexes PDF text; we capture the URL and content type only | PDF *content* absent from analysis |

  That is the whole list, and two items are "not yet," not "no."

  **Not divergences, though they look like ones** — both resolve under the two-layer rule rather
  than needing an exception:
  - *Honest `GeekSEO/1.0` UA.* Search engines identify themselves honestly — that IS the mirrored
    behavior. Googlebot announces itself and publishes reverse-DNS verification; a crawler
    impersonating Googlebot is mirroring nothing. Residual cost: sites that cloak specifically for
    Googlebot serve us something different.
  - *Preferring the `aria-hidden` sizer's complete word.* The fetch layer captures both spans
    faithfully and annotates them; the choice between them happens in the **extraction** layer,
    where product decisions are legitimate by design. Nothing about the crawl diverges.

  **Rejected outright** (recorded so they are not reintroduced): blocking images/fonts — corrupts
  computed visibility; shortening the render budget below Google's — snapshots pages mid-render;
  dropping `collapsed` content from the content tree — Google gives it full weight; hardcoded
  path/extension skip lists — robots.txt is the site owner's mechanism, not ours.
- **The `data-gsv` contract** — what it means, who sets it, the rule that the nearest annotation
  wins, and the standing requirement that any new HTML consumer must respect it.
- **The three kinds of "hidden," stated explicitly** — collapsing these is what produced both the
  superseded plan's wrong conclusion and a wrong turn in this one:
  | | Googlebot | Us |
  |---|---|---|
  | CSS-hidden at mobile **and** desktop (accordion, tab, nav drawer) | Renders, indexes at **full weight** under mobile-first, follows the links | Same — `collapsed`, kept in the content tree |
  | CSS-hidden at mobile, **shown** at desktop (`hidden lg:block`) | Not in the mobile index at all — Google renders the mobile layout, so it never sees this copy | Same — `desktop-only`, kept in the DOM for links, excluded from the content tree |
  | Not in the DOM until interaction (JS injects on tap) | Never sees it — Googlebot does not click, tap, or scroll | Same — a limit we deliberately share |

  Only the third row makes a crawl legitimately incomplete. Row two is why **no dedupe is needed**:
  Google renders one hero, so there is never a duplicate to consolidate — the standing no-dedupe
  rule and full search-engine fidelity agree here rather than conflicting. Verified Aug 2026 against
  Google Search Central and Illyes/Mueller guidance; cite the sources in the doc.
- **The `CrawledPage` crawl record** as the indexer seam.

### 6.2 Amend, do not overwrite: `Geek-SEO/docs/plans/mobile-first-crawl-and-tool-extraction.md`

Part 1's Context (`:13-26`) records as *confirmed with the user* two things this plan reverses:
"only capturing what's actually visible there," and the "**Explicitly accepted tradeoff:** this makes
the crawl intentionally incomplete… user confirmed this is fine." Its Design §2 (`:77-98`) then
prints the `el.remove()` snippet as the intended implementation.

Add a dated **Superseded** note at the top of Part 1 and inline at §2. Be precise about what was
right, because most of it was: the mobile viewport (§1, `:53-76`) stands, and "duplicates stop
occurring by construction" (`:18-20`) was **correct** — mobile-first indexing means Google renders
one hero. What fails is only §2's mechanism: deleting *all* computed-hidden nodes also deleted
accordion, tab, and nav-drawer content that Google indexes at full weight, and did so before link
discovery ran. Hence the "intentionally incomplete crawl" tradeoff (`:22-26`) is withdrawn — the
incompleteness was not, as stated, "how Google sees these pages."

Its own verification step 6 (`:149-152`) predicted this and reasoned itself out of it: it worried
about hamburger nav, then reassured on the grounds that the markup is "just visually hidden until
toggled" — precisely what the strip removes. Note that too; a check that contradicts its own
mechanism is the failure mode worth remembering.

Keep all original text visible. The reasoning trail is how the error was caught.

Part 2 (`:158-253`) stands as-is; Part 4 above is its unfinished half.

### 6.3 `Geek-SEO/AGENTS.md` — new standing rule

The repo-level rules file has "Correctness over expediency" and "No regex for HTML" but nothing
about crawling, which is now the subsystem with the most load-bearing invariants. Add a
**"Crawl like a search engine"** section, short and absolute, linking to 6.1:

> **Every crawler decision is grounded in mirroring search-engine functionality and results.**
> Performance, convenience, and product preference are not reasons to diverge. A divergence is an
> exception: it must be argued, dated, and listed in the divergence table in
> `docs/crawler-architecture.md`. If it is not in that table, it is a bug.

- render always — there is no non-rendering crawl mode, and no silent degradation when Chromium is
  unavailable;
- **never delete nodes from a captured DOM** — annotate visibility, let consumers decide;
- know the difference between *collapsed* (indexed at full weight) and *desktop-only* (not in the
  mobile index) before writing anything that treats "hidden" as one thing;
- fetch-layer code makes no product/extraction decisions;
- robots.txt is obeyed; the bot identifies itself honestly and never impersonates another crawler;
- every fetch produces a crawl record (URL, final URL, status, directives), never a bare HTML string;
- never trade render fidelity for latency — bound crawl breadth instead;
- "mirror the crawler" is Phase 1 of "perform exactly as a search engine" — an index, ranking,
  query-serving, and crawl-budget infrastructure are still to come, not decided against.

Also update its "No regex for HTML" section: it currently cites `\s+` and `<a …href>` as tolerated
trivia, but `LinkHrefRegex` is a genuine violation being removed here, and `WhitespaceRegex` goes
with it.

### 6.4 Regex-plan status updates (GeekContentCreator `docs/plans/`)

- `remove-regex-immediate.md` — its 3-file / 6-regex scope table is now partly historical
  (`PageSectionTreeBuilder` was rewritten to HtmlAgilityPack in Part 1, not AngleSharp as the table
  proposes). Mark the delivered rows done and correct the parser mismatch, so the next reader isn't
  planning against a state that no longer exists.
- `remove-regex-full.md` — decrement the 147-hit inventory for what Part 5 clears
  (`LinkHrefRegex`, `WhitespaceRegex`, the `InternalLinkExtractor` anchor regexes) and note
  `slugifyHeading` as a permanent, deliberate keep.

### 6.5 Stale in-code documentation

These read as authoritative and are or will be false:

- `SitePageCrawler.cs:8-13` — "Fetches a **bounded** set of same-origin pages" (it is uncapped) and
  "HTTP-only runs (manual step re-run) crawl seeds only" (that mode is being deleted). Rewrite the
  class doc around the two-layer model.
- `SitePageCrawler.cs:25-29` — the `RenderSettleMs` comment explains a constant that quiescence
  replaces; keep the `4564782` 15-minute-timeout lesson, re-point it at the new cap.
- `SitePageCrawler.cs:37-41`, `:227-231` — the uncapped-crawl and hard-junk-filter docs are correct
  today; re-check after the robots gate lands, since robots now also excludes URLs.
- `CompetitorPageFetcher.cs:8-9` — claims "max 50 pages each"; already false today (no cap exists at
  `:18`, `:37`). Fix while adjacent.
- `PageSectionTreeBuilder.cs:8-13` — describe it as the extraction layer and state the `data-gsv`
  dependency.
- `SiteAnalysisModels.cs:337` — document each new `CrawledPage` field, especially that `NoIndex`
  means *indexed: no, crawled and followed: yes*.
- `PlaywrightCrawlerProvider.cs:73-122` — once the parser moves to `RobotsTxt.cs`, its doc should
  say the two crawlers now share one REP implementation.

### 6.6 `Geek-SEO/README.md:99`

The status paragraph ends "HTTP fetch timeout aligned to Playwright (15s)" — describing a mode being
deleted. Replace with the render-always + robots-obeyed description.

### 6.7 Memory

Save a `project` memory: the standing goal is that Site Analyzer should perform **exactly as a
search engine**, not just crawl like one — this document (the crawler rewrite) is Phase 1 of that
objective, not the objective itself. Separately, GeekContentCreator depends on Site Analyzer's
crawl output (child headings, tools) and is currently in a non-working state, so a repo/architecture
branch is needed to keep serving that handoff as Site Analyzer's architecture grows — scoping that
branch is blocked on diagnosing what in GeekContentCreator is actually broken. Neither fact is
derivable from the code.

---

## Files to change

**Geek-SEO — fetch layer:**
- `GeekSeoBackend/Services/SiteExtraction/SitePageCrawler.cs` — the bulk of Part 3A/3B: fail-closed
  (`:78-80`), delete HTTP path (`:154-175`, `:306-317`, `:372-379`), crawl record, robots gate,
  status/redirect capture (`:264-273`), directives replacing `IsSoft404` (`:319-337`), URL
  canonicalization (`:53`, `:214-215`, `:339-347`, `:366-369`), frontier `HashSet` (`:149`),
  politeness, quiescence + resource policy (`:264-274`), visibility annotation (`:275-284`), DOM
  link extraction (`:177-193`, `:381-384`).
- **New** `Services/SiteExtraction/RobotsTxt.cs` — REP-compliant parser, shared with
  `Providers/Seo/PlaywrightCrawlerProvider.cs:73-122`.
- `Services/SiteExtraction/HardJunkPaths.cs:12-23` — remove from the crawl path per §3A.6b; verify
  every caller and keep the selection-side `NoisePaths` equivalent intact.
- **New** `Services/SiteExtraction/VisibleTextExtractor.cs` — one `data-gsv`-aware text extractor.
- `GeekSeo.Application/Models/Seo/SiteAnalysisModels.cs:337` — extend `CrawledPage`.
- `GeekSeoBackend/Infrastructure/PlaywrightBrowserHolder.cs` — loud failure / retry.
- `Services/SiteExtraction/SiteUrlNormalizer.cs` — URL canonicalization.
- `Services/SiteExtraction/SitemapExtractor.cs:38,41-63,87-101` — stop first-hit-wins, add the
  sitemap-index cycle guard (`depth` is passed but never checked).

**Geek-SEO — extraction layer:**
- `Services/SiteExtraction/PageSectionTreeBuilder.cs` — 3C.1/3C.2/3C.3 at `:45-46`, `:65-78`,
  `:88-112`; drop `WhitespaceRegex` (`:134`).
- `data-gsv`-aware updates to `NormalizedTopicalityCalculator.cs:40,63,142`,
  `SiteAnalysisStepRelationalLoader.cs:437,442,544`, `CompetitorAnalysisService.cs:130`,
  `CompetitorPageFetcher.cs:54-58`, `SiteAnalysisContentCoverageMatcher.cs:232`,
  `InternalLinkExtractor.cs:41-43`.
- `Services/SiteAnalyzerStepRunners/SiteAnalysisStepExecutionService.cs:262-273,301`,
  `Services/SiteAnalysisStepRerunService.cs:251,296` — propagate the fail-closed error.
- `GeekSeoBackend.Tests/PageSectionTreeBuilderTests.cs`, `SiteContentTreeGapTests.cs`, plus new
  `RobotsTxtTests`, `CrawlUrlTests`.

**GeekContentCreator (Part 4, frontend-only):**
- `src/lib/content-creator/hierarchy-match.ts` — `parseHierarchyToolNames` (delete regex, anchor
  detection), `collectToolsByHeading` (`:110`, carry hrefs).

**Documentation (Part 6):**
- **New** `Geek-SEO/docs/crawler-architecture.md` — the durable two-layer reference.
- `Geek-SEO/docs/plans/mobile-first-crawl-and-tool-extraction.md:13-26,77-98` — dated superseded
  notes; original text preserved.
- `GeekContentCreator/docs/plans/mobile-first-crawl-part-3-render-always.md` — replaced by this
  plan's final version.
- `Geek-SEO/AGENTS.md` — new "Crawl like a search engine" section; amend "No regex for HTML".
- `Geek-SEO/README.md:99` — drop the HTTP-fetch-mode description.
- `GeekContentCreator/docs/plans/remove-regex-immediate.md`, `remove-regex-full.md` — status/count
  updates.
- In-code docs per §6.5: `SitePageCrawler.cs:8-13,25-29`, `CompetitorPageFetcher.cs:8-9`,
  `PageSectionTreeBuilder.cs:8-13`, `SiteAnalysisModels.cs:337`, `PlaywrightCrawlerProvider.cs:73-122`.
- Memory: `project` note per §6.7.

## Verification

1. `dotnet build` (Geek-SEO) and `npm run build` (GeekContentCreator) — 0 errors.
2. `dotnet test` — existing `PageSectionTreeBuilderTests` / `SiteContentTreeGapTests` pass; the
   h5-inside-`<li>` case from `74e737d` must not regress.
3. New `RobotsTxt` unit tests: `Allow` beats a shorter `Disallow` (longest-match); `*` and `$`
   patterns; most-specific UA group wins; 4xx → allow-all; 5xx → disallow-all. Also confirm
   `PlaywrightCrawlerProvider`'s existing callers still pass under the stricter (fail-closed)
   behavior.
4. New `CrawlUrl` tests: `utm_*` stripped; `www`/apex and `http`/`https` resolve same-site; host
   case-insensitive but path case-sensitive.
5. New `PageSectionTreeBuilder` tests on real captured markup:
   - `<h2>Clone Yourself<br/><span>Work 24/7</span></h2>` → `Clone Yourself Work 24/7`;
   - `<h1>Redefine Your Business<br/><span aria-hidden="true" data-gsv="collapsed">Efficiency</span><span data-gsv="visible">Effici</span></h1>`
     → `Redefine Your Business Efficiency` (sizer wins);
   - a `data-gsv="desktop-only"` subtree contributes no text, but its anchors are still discoverable;
   - a `data-gsv="collapsed"` subtree (accordion answer) **does** contribute text — the regression
     guard for the full-weight rule;
   - `<script>`/`<style>` inside a heading contributes no text.
   Plus a viewport-classification test: `class="hidden lg:block"` → `desktop-only`;
   an accordion panel hidden at both widths → `collapsed`; and at least one JS-heavy fixture where a
   `resize`/`matchMedia` listener mutates the DOM, to catch the probe-reliability risk in Part 3B.
6. New `hierarchy-match` tests: 5 comma-separated anchors → 5 tools with hrefs; prose with 2 inline
   links → none.
7. Fail-closed: run with Chromium unavailable → the run fails with a named rendering error in the
   UI, **not** a silently degraded result.
8. Robots gate: point at a host with a `Disallow:` and confirm those URLs are skipped and reported —
   and that an `Allow:` carve-out under it is still crawled.
9. Re-crawl `geekatyourspot.com` (`force: true`). In Site structure:
   `H1: Redefine Your Business Efficiency` **once**, correctly spaced; `H2: Clone Yourself Work 24/7`
   **once** — with no dedupe logic anywhere. All 5 h5s under "AI Content Creation Workflow" still
   present (the Part 1 guard).
10. Re-apply hierarchy match, then Generate Plan: child headings reappear, and KNOWN TOOLS lists
    Zapier/QuickBooks/Lido/Jotform/UiPath grouped under their H6 with hrefs present (`hasUrls` fires
    at `ResearchBriefBuilder.cs:293`).
11. Crawl-record spot check: pick a known redirect and a known 404 on the site; confirm both appear
    with correct `StatusCode`, `FinalUrl`, and `RedirectChain`, and that the redirect target is not
    also crawled separately.
12. Discovered-URL count before/after. A **substantial increase** is expected and correct on five
    counts (DOM links, retained hidden nav, `www`/scheme same-site, `HardJunkPaths` removal, PDFs
    and images entering inventory). A decrease means the DOM walk or the robots gate is scoped wrong.
    Cross-check that the URLs newly appearing are ones robots.txt genuinely permits — the robots
    gate is now the *only* thing standing between the frontier and a site's whole URL space, so a
    parser bug here is no longer contained.
13. Word-count sanity: counts should *rise* by roughly the accordion/tab/FAQ text that Google
    weighs and the old strip discarded, and should **not** include the desktop hero. A jump matching
    duplicated hero copy means a `data-gsv` consumer in Part 3B was missed.
14. Timing, and the decision it forces: total crawl wall-time on `geekatyourspot.com` before/after.
    Per-page cost is **expected to rise** (5 s cap, no resource blocking, dual-viewport probe). If an
    uncapped crawl now exceeds the 15-minute job budget, the fix is a per-run page budget with
    resumable continuation at the job layer — not a shorter render wait. Record the measured numbers
    in `crawler-architecture.md` so the next person doesn't re-litigate it from guesswork. Also test
    against at least one site with a real crawl-trap shape (calendar, faceted nav, or deep
    pagination) per the compounding-risk note in §3A.6b — `geekatyourspot.com` alone won't surface it.
15. `grep -n "InnerText" …/PageSectionTreeBuilder.cs` → none.
    `grep -n "GeneratedRegex" …/SitePageCrawler.cs …/PageSectionTreeBuilder.cs` → zero.
    `grep -n "Top.*Tools" …/hierarchy-match.ts` → none.
16. Docs: `grep -rn "el.remove()\|intentionally incomplete\|HTTP fetch timeout\|max 50 pages\|bounded set"`
    across `Geek-SEO/{AGENTS.md,README.md,docs/}` and `GeekSeoBackend/**/*.cs` → every hit is either
    corrected or sits under an explicit "Superseded" note. No doc still presents the strip or the
    HTTP fallback as current design.

## Not in this document

Two different kinds of "not doing" follow. The first is permanent — decided against on the merits,
independent of scope. The second is **Phase 2+ of the full objective** (see "Program goal" above):
real search-engine requirements this document does not attempt, listed here so they are named
rather than silently absent.

**Decided against, not just deferred:**
- Any dedupe, sibling filter, or `IsDuplicateHeading` revival.
- `opacity: 0` handling (Part 3B rationale).
- Spoofing Googlebot's user-agent.

**Phase 2+ — the majority of "perform exactly as a search engine," not built here:**
- An index. This document produces crawl records and a content tree per page; nothing aggregates,
  stores, or makes them queryable across pages or runs.
- A ranking function. Nothing here scores or orders pages by relevance to anything.
- A query-serving path. There is no search interface consuming this data.
- Crawl-budget and scheduling infrastructure across pages/runs — continuous priority frontier
  (replacing wave-synchronous BFS), conditional-GET (`ETag`/`If-Modified-Since`) caching, recrawl
  scheduling, and the crawl-trap/circuit-breaker protection flagged as a real risk once
  `HardJunkPaths` is removed (§3A.6b). The crawl record in 3A.2 is the seam these attach to.
- `hreflang` and international clustering.
- Microdata / RDFa (`SchemaOrgExtractor` is JSON-LD only).
- `SchemaOrgExtractor`'s redundant second Playwright fetch of the homepage — flagged since Part 1,
  unrelated to the phasing above but still unresolved.

**Separate, open item — not scoped, not scheduled:** the GeekContentCreator branch (see "Program
goal"). Blocked on establishing what in GeekContentCreator's current state is actually broken.
