# Planned Regex Removal — All Remaining Occurrences (147 Total)

**Status:** Planned — after immediate heading fix ships. Covers all remaining `GeneratedRegex` / `Regex.` in `Geek-SEO` + `GeekBackend` (147 hits at `grep -R GeneratedRegex|new Regex|Regex.`).

**Policy:** No regex for HTML/DOM or content structure. Regex remains only for pure string ops where a DOM/parser is overkill (`\s+`, slug `[^a-z0-9\s-]`, `\W+` tokenization) — but even those are listed for review.

## Inventory (by repo)

### Geek-SEO — GeekSeoBackend (heading/link/content — priority)
- `PageSectionTreeBuilder` — done in immediate plan.
- `HomepageHeadingsExtractor`, `PageContentExtractor` — done in immediate plan.
- `PublicSiteScanService.cs:266-279` — `TitleRegex`, `MetaDescriptionRegex`, `H1Regex`, `CanonicalRegex` — 5 regexes scraping `<title><meta><h1><link>` — replace with `AngleSharp` `QuerySelector("title")`, `QuerySelector("meta[name=description]")`, etc.
- `SitePageCrawler.cs:367` `<a href>`, `InternalLinkExtractor.cs:115` `<a href>`, `SchemaOrgExtractor.cs:488` `<script ld+json>` — replace with `AngleSharp` `QuerySelectorAll("a[href]")`, `QuerySelectorAll("script[type='application/ld+json']")`.
- `NormalizedTopicalityCalculator.cs:188-195` `<script>`, `<style>`, `<[^>]+>` — DOM `QuerySelectorAll("script,style")` removal, then `TextContent`.
- `CompetitorPageFetcher.cs:155-156` `Regex.Replace("<script…")`, `NavMenuExtractor.cs:170`, `SiteAnalyzerService.cs:517` — same — DOM.
- `SiteAnalysisStepRelationalLoader.cs:547-553` `<script>`, `<style>`, `<[^>]+>` — same.

### Geek-SEO.Application / content-writer (content pipeline — lower priority, still regex-heavy)
- `ArticleMethodology*`, `ScoreSuggestionApplicator`, `ArticleClosingFaqEnricher` — 15+ `"<h2.*faq"`, `"<h3.*>"`, `"<h2\\b"`, `"<p.*>"` — replace with `AngleSharp` section walk.
- `HtmlTextUtility`, `ContentAutoEnricher`, `ContentBlogSpokePromptBuilder`, `ContentSocialPostService`, `FaqAnswerValidator` (`<a href>`), `BusinessVoice*`, `UrlPageKeywordResolver`, `SourceDiscoveryService` (```json```), `SerpCaptureTextSanitizer`, `HtmlTextUtility` — mostly `<[^>]+>` strip / `\s+` collapse — keep or replace with `TextContent`.
- `InternalKeywordDiscoveryProvider` `Regex.Split(@"\W+")`, `EntityGapAnalyzer` same, `SerpSearchKeywordNormalizer` `\s+`, `ArticleClosingFaqEnricher` `\s+` — pure string, can stay (`\s+`, `\W+`).

### GeekBackend — GeekAPI (slug/guardrail — lowest priority)
- `GccGenerateService.cs:873`, `SlugHelper.cs:10-11`, `GccArticleHtmlExtractor.cs:66`, `KeywordHtmlParserService.cs:95` — `[^a-z0-9\s-]`, `[\s-]+`, `\s+` — slug/whitespace — keep or use `SlugHelper` helper.
- `ContentGuardrail.cs:37-38` `\bBannedPhrase\b` — keep (phrase matching, not HTML).
- `GccSavedSerpParser` `\b\d+\s+(best|ways…)`, `GcwPolishAnalyzer` `[a-z0-9']+`, `SiteCrawlerService` `<loc>`, etc. — keep.

## Steps (phase 2)
1. For each `GeneratedRegex` that matches HTML tags (`<h…>`, `<a>`, `<title>`, `<meta>`, `<script>`, `<style>`, `<p>`, `<li>`, `<link>`), replace with `AngleSharp` `ParseDocument` + `QuerySelector[All]`.
2. For `<[^>]+>` tag strip + `\s+` collapse, replace with `element.TextContent` + `Regex.Replace(@"\s+", " ")` **or** keep `\s+` as allowed string regex (document as exception).
3. For slug/keyword `\W+`, `\s+`, `[^a-z0-9…]` — document as allowed, no change unless desired.
4. After each file, `dotnet build` + relevant tests.

## Validation
- `grep -R GeneratedRegex.*"<(h|a|title|meta|script|style|link|p|li)` → 0 hits (only `\s+`, `<[^>]+>`, slug patterns remain, explicitly listed).
- `grep -R "Regex\." → < 30 hits (only `\s+`, `\W+`, slug, guardrail) — down from 147.
- Same `geekatyourspot.com` re-Analyze still shows 5 h5's (no regression).

## Reference
Full grep dump (147 hits) archived from `grep -R GeneratedRegex|new Regex|Regex. Geek-SEO GeekBackend` — see audit in session 2026-08-11.
