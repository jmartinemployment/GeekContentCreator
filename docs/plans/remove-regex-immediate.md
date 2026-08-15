# Immediate Regex Removal — Heading Extractors (No Regex for HTML)

**Status:** Partially delivered (2026-08). `PageSectionTreeBuilder` is HtmlAgilityPack (not
AngleSharp as the table originally proposed) and no longer uses heading/`<a>`/`\s+` regex.
`HomepageHeadingsExtractor` and `PageContentExtractor` still have HTTP-path `GeneratedRegex` for
headings/`<li>` — remaining, not in the search-engine crawler Phase 1 cut.
**Motivation:** User hates regex (`h|p|li` swallowed `h5` inside `li`, 0 h5's on homepage despite `<li><h5>Automated Content Generation</h5>`). Correctness-over-expediency: headings are DOM, not regex.
**Policy:** No regex for HTML parsing — headings/links are DOM. Regex remains only for trivial string ops (slug `[^a-z0-9\s-]`) until full plan lands.

## Scope — 3 files, 6 GeneratedRegex (Geek-SEO)

| File | Current Regex | Replacement | Status |
|------|---------------|-------------|--------|
| `GeekSeoBackend/Services/SiteExtraction/PageSectionTreeBuilder.cs` | `"<h(?<hlevel>[1-6])…>"` + `TagRegex`/`WhitespaceRegex` | HtmlAgilityPack document walk + `VisibleTextExtractor` | **Done** (HAP, not AngleSharp) |
| `GeekSeoBackend/Services/SiteExtraction/HomepageHeadingsExtractor.cs:122` | `"<h([1-6])(?:\\s[^>]*)?>([\\s\\S]*?)</h\\1>"` | Playwright DOM path exists; HTTP regex path remains | Open |
| `GeekSeoBackend/Services/SiteExtraction/PageContentExtractor.cs:208,211` | heading + `<li>` regex | DOM `QuerySelectorAll` | Open (`ExtractFromHtml` still regex) |

**Excluded:** `TagRegex`/`WhitespaceRegex` (`<[^>]+>`, `\s+`) stay for now — trivial, not headinghide.

## Steps
1. Add `AngleSharp` NuGet to `GeekSeoBackend` (or `HtmlAgilityPack` — pick one; AngleSharp matches Playwright `querySelectorAll`).
2. Rewrite `PageSectionTreeBuilder.Build(html)` — parse once, iterate `h1…h6` in document order, `CleanText = WebUtility.HtmlDecode(el.TextContent).Trim()` + whitespace collapse, stack by `Level`, `p` paragraphs via `el.NextElementSibling` where `tagName=="P"` (or keep existing `p` DOM walk).
3. Rewrite `HomepageHeadingsExtractor.ExtractAsync` HTTP path similarly; keep Playwright path as-is (already DOM).
4. Fix `PageContentExtractor.OrderedHeadingRegex` to `h1-6` (was `h[234]`) via DOM — this was hiding h1/h5/h6 in phrase extraction (not `page-section-trees` but still weird).
5. `dotnet build GeekSeoBackend/GeekSeoBackend.csproj`, `dotnet test` (PageSectionTreeBuilderTests, SiteContentTreeGapTests — update expectations: h5 inside `li` now visible).

## Validation
- `curl` homepage no longer relevant — DOM sees `<li><h5>` as `h5`. Fresh Analyze for `geekatyourspot.com` shows 5 h5's under `AI Content Creation Workflow` in `page-section-trees` and `Site structure`.
- `grep -R GeneratedRegex` no longer lists those 3 heading regexes.

## Out of scope
Full 147-hit removal — see `remove-regex-full.md`.
