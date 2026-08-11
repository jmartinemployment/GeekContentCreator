# Geek Content Creator

**Happy path:** Site Analyzer → **Workflow** (the create form, formerly "Start create") → Content Brief → generate → revise / on-page SEO / polish → content approval → Mix.

Creates own brief, research, and generate via GeekAPI `/api/geek-content-creator/...`. The legacy Content Writer v2 `Project`-backed `/app` screens were retired (2026-08-06) — `/app/create` → `/app/creates` is the sole create path now.

**Plan:** [CONTENT_CREATOR_PLAN.md](./CONTENT_CREATOR_PLAN.md)  
**Architecture:** [architecture.md](./architecture.md) — Next → GeekOAuth + GeekAPI only (never GeekRepository directly).  
**Site Analyzer sitemap step-1:** implemented, deployed, live in production — not yet verified end-to-end against a real domain. Planning docs removed post-merge; see commit history (Geek-SEO `281ec37`, GeekBackend `7ef3c61`, GeekContentCreator `efc2f23`).  
**Fallback elimination (implemented, plan doc removed post-completion):** [inventory](./docs/FALLBACK_INVENTORY.md) — replaced Site Analyzer's fabricated content-gap fallback with real heading-based detection (later replaced again with a real h1–h6 + paragraph tree, see `CONTENT_CREATOR_PLAN.md` §14), eliminated silent provider auto-switching and swallowed exceptions across Geek-SEO/GeekAPI. CWV2's `.html`/`.txt` git export turned out to already be fully implemented, no change needed. Not yet live-verified against a real domain.

## Stack

- Next.js App Router + TypeScript + Tailwind
- GeekOAuth client: `geek-content-creator`
- Content Creator API (proxied at `/api/cw/*`): `/api/geek-content-creator/creates`, brief-research, research/follow, generate, versions (revise / SEO / polish / approve / repurpose), Site Analyzer
- Local port: **3003**
- Production (Vercel): `https://geek-content-creator.vercel.app` — GitHub → Vercel, same pattern as sibling frontend apps.

**Resolved incident (2026-08-04):** a redundant `geek-content-creator` **Railway** service had been mistakenly treated as production for several days. It was never supposed to host this UI — Vercel was the deliberate choice (commit `eea8a04`, which removed `railway.toml` and repointed all config at Vercel). A later, unrelated commit (`c5fdd3e`) accidentally reintroduced a "Production (Railway)" doc line while rewriting the README for other reasons, and every session since treated that accident as ground truth. **Resolution:** the redundant Railway UI service was decommissioned, and the now-vestigial container-build artifacts (`Dockerfile`, `.dockerignore`, the `DOCKER_BUILD` standalone branch in `next.config.ts`) were removed — nothing used them (Vercel builds natively; the Railway service had used Railpack, not the Dockerfile). **Vercel is the sole UI host.**

**On "services": nothing was migrated, because there was nothing to migrate.** An inventory of this app's server-side code found only (a) OAuth/session BFF (`src/app/api/auth/*`, `src/lib/auth/*` — PKCE + server-side token exchange + httpOnly cookies; must stay with the frontend so the access token never reaches the browser) and (b) a thin proxy layer (`src/app/api/cw/[...path]`, `src/app/api/site-analyzer/*`) that forwards the user's Bearer to GeekAPI. **The actual Content Creator backend already lives natively in GeekAPI** (`Controllers/ContentCreator/GccController.cs` at `api/geek-content-creator/*`, `Services/ContentCreator/Gcc*`, persistence via `HttpGccRepository` → GeekRepository). The backend (GeekAPI, GeekRepository, GeekOAuth, Geek-SEO) correctly lives on Railway as shared platform infrastructure — that was never wrong; only the UI's own Railway deployment was. See `GeekBackend/AGENTS.md` § "Service topology & trust boundaries".

## Dev

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3003](http://localhost:3003). Auth and API are **hosted**: GeekOAuth (`auth.geekatyourspot.com`) and GeekAPI (`api.geekatyourspot.com`).

**Site Analyzer:** Enter a domain → **Analyze** runs Geek-SEO ThroughCoverage behind GeekAPI (OAuth Bearer). Fail closed if Geek-SEO is unset, unauthorized, or analysis fails — never invent gaps or related pages. GeekAPI needs `GEEK_SEO_API_URL`. Every Analyze starts a **new crawl** (no cached ready reuse).

**Missing pages (gaps):** Site Analyzer lists headings that need their own page. Rules:

1. A candidate is only considered if Analyze saw that phrase as an HTML heading (`h1`–`h6`).
2. A page is **not** missing if its slug is found on a crawled/sitemap URL. Slugs are always lowercase and use hyphens between words (e.g. `Automated Content Generation` → `automated-content-generation`).
3. Short headings still count (e.g. heading `AI` with no `/ai` page is a missing page).

The UI shows the **heading** on its own line and the **pillar** on the line below — not a single concatenated string.

**Sitemap step 1 (deployed, not yet live-verified):** Analyze step 1 now always regenerates a crawl-based sitemap inventory + downloadable `sitemap.xml` (unlimited discovery; inventory-complete crawl; fail-closed throw on empty/incomplete). Download sitemap button added to Site Analyzer UI. Unit-tested (191/191 in Geek-SEO), pushed to `main`, and deployed live in the backend (Geek-SEO, GeekAPI on Railway) and the UI (GeekContentCreator on Vercel — see the Railway-incident note above); **not yet run end-to-end against a live domain** (requires a real OAuth session to exercise — see `scripts/smoke-site-analyzer.mjs`).

**Fixed:** Site Analyzer's content-gap detection previously fabricated gaps — when a pillar had fewer than 3 real crawled child pages, it filled in 5 hardcoded generic subtopics instead of finding real ones. Replaced with real heading-based detection (heading → missing page when no matching URL slug). See `CONTENT_CREATOR_PLAN.md` §14 for related fallback/soft-success eliminations.

**Lede taxonomy (2026-08-11):** GeekAPI `LedeType` is now 12 values (Summary, ImmediateIdentification, DelayedIdentification, SingleItem, Anecdotal, Narrative, SceneSetting, StartlingStatement, DirectAddress, Question, Quote, Wordplay) — pure enum, no `Creative` fallback. Legacy `Creative` rows deserialize as `null` via `TolerantNullableLedeTypeConverter` and require edit before next generate. The **Content Brief** (`src/lib/content-creator/brief-catalog.ts` + `ContentBriefPanel` — now one-page Workflow at `projects/[id]`) is the single source of truth and drives `ledeType` selection + all content types (`BuildLedeTypeGuidance`/`BuildBriefBodyGuidance` in `ContentPromptBuilder`). See [`docs/plans/fix-lede-heading-regression-and-lede-taxonomy.md`](./docs/plans/fix-lede-heading-regression-and-lede-taxonomy.md).

**Site Analyzer heading rule (2026-08-11):** `NoisePaths`, `H2Noise`, `IsDuplicateHeading`, `Length 4..80` filters deleted — if heading its valid (h1–h6, including h5, duplicates kept), pillars are headings. `HeadingPillarBuilder` kept (only item kept per product direction); `PageSectionTreeBuilder` restored after `b46ac3f` empty-tree regression (`e18ac3d`/`e8b7b05`).

## Operator smoke (day one)

1. Sign in → **Workflow** → client → (blog) → fill Content Brief → **Save brief** → **Generate**
2. Site Analyzer → pick gap → **Open Workflow** (site section with related pages required) → brief → Generate (not keyword-only)
3. Image prompt: **Workflow** with type Image prompt (topic + notes required) → brief → Generate
4. Draft workspace: SEO / polish → Revise (Full or Section) → Content approval → Mix
5. Fail-closed checks: generate without brief → `brief required`; research follow with a bad URL → whole op fails; SA create with empty `relatedPages` → rejected

API smoke:

```bash
GEEK_API_URL=https://api.geekatyourspot.com python3 scripts/smoke-gcc-api.py
```

## Env

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | App origin |
| `NEXT_PUBLIC_AUTH_URL` | `https://auth.geekatyourspot.com` |
| `NEXT_PUBLIC_GEEK_API_URL` | `https://api.geekatyourspot.com` |
| `NEXT_PUBLIC_OAUTH_CLIENT_ID` | `geek-content-creator` |
| `NEXT_PUBLIC_OAUTH_REDIRECT_URI` | `{APP_URL}/auth/callback` |

UI proxies use the signed-in OAuth Bearer only (no API-key fallback).

## Legacy

`/app` **Projects** = Content Writer v2 clients/projects/crawl. Prefer **Creates** for writing. Do not edit the Content Writer v2 repo for product features — copy into GeekAPI `Services/ContentCreator/` when needed.
