# Fix: Generate Tools h4→deeper harvest undercount

## Symptom

Generate Tools on **Ad Spend Optimization** returned ~1 tool (a category h5 title) instead of ~17 products. Railway `ExtractTools` showed `linksUnderMatch=0`, `headingsUnderMatch=2` (match + one child h5) while the live page has **four** h5s under that h4.

## Root causes

1. **Incomplete TreeJson under the match** — `data-gsv="desktop-only"` regions used `CollectLinksOnly`, which never created heading nodes. Sibling h5s inside desktop-only wrappers were missing from `Children`.
2. **Barren path wins** — same hierarchy text path on multiple trees; scoring preferred link count only, so a thin copy could win when all copies had zero links.
3. **Accept gate too weak** — a single deeper heading became one “tool,” and `ExtractToolsFromTrees` stopped the leaf→root ancestor walk after `Count > 0`.

Heading levels are **not** a fixed `h4→h6` contract: match any outline node; harvest links under it, or deeper headings relative to the match level.

## Fixes

| Area | Change |
|------|--------|
| Geek-SEO `PageSectionTreeBuilder` | Desktop-only: register h1–h6 + links; still skip paragraph text |
| GeekAPI `FindMatchedSection` | Prefer path/keyword hit with most deeper headings, then links |
| GeekAPI `ExtractToolsFromTrees` | Accept only `>= 2` unique tools; else widen hierarchy path |
| GeekAPI persist / `ResolveToolSlots` | `HierarchyToolsByHeading` only when a group (or slot list) has `>= 2` names |
| Diagnostics | Log `pageUrl`, `directChildren`, `deeperHeadings`, full heading list (no `Take(20)`) |

## Verify

1. Deploy Geek-SEO (tree builder), then GeekAPI.
2. Re-crawl or use a crawl built after the SEO deploy (old TreeJson still lacks desktop-only h5s).
3. Generate Tools on Ad Spend; Railway `ExtractTools` should show ~4 deeper h5s under the match and a multi-tool harvest (or honest empty if the crawl still has no links/headings).
4. Confirm AI Content Creation Workflow returns the full unique set under its match.

## Out of scope

Async tools jobs, empty-fail UI, image prompts, reverting bearer/async fixes.
