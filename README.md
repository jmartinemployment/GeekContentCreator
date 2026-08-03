# Geek Content Creator

**Happy path:** Site Analyzer (optional) → **Start create** → Content Brief → generate → revise / on-page SEO / polish → content approval → Mix.

Creates own brief, research, and generate via GeekAPI `/api/geek-content-creator/...`. Content Writer v2 **projects** remain as a legacy surface only.

**Plan:** [CONTENT_CREATOR_PLAN.md](./CONTENT_CREATOR_PLAN.md)  
**Architecture:** [architecture.md](./architecture.md) — Next → GeekOAuth + GeekAPI only (never GeekRepository directly).  
**Site Analyzer sitemap step-1 (implemented, unverified live):** [docs/HANDOFF-site-analyzer-sitemap-step1.md](./docs/HANDOFF-site-analyzer-sitemap-step1.md) · [plan](./docs/plans/sitemap-generator-step1.plan.md)

## Stack

- Next.js App Router + TypeScript + Tailwind
- GeekOAuth client: `geek-content-creator`
- Content Creator API (proxied at `/api/cw/*`): `/api/geek-content-creator/creates`, brief-research, research/follow, generate, versions (revise / SEO / polish / approve / repurpose), Site Analyzer
- Legacy CWV2 project APIs still proxied for `/app` Projects
- Local port: **3003**
- Production (Railway): `https://geek-content-creator-production.up.railway.app`

## Dev

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3003](http://localhost:3003). Auth and API are **hosted**: GeekOAuth (`auth.geekatyourspot.com`) and GeekAPI (`api.geekatyourspot.com`).

**Site Analyzer:** Enter a domain → **Analyze** runs Geek-SEO ThroughCoverage behind GeekAPI (OAuth Bearer). Fail closed if Geek-SEO is unset, unauthorized, or analysis fails — never invent gaps or related pages. GeekAPI needs `GEEK_SEO_API_URL`.

**Sitemap step 1 (code complete, not yet live-verified):** Analyze step 1 now always regenerates a crawl-based sitemap inventory + downloadable `sitemap.xml` (unlimited discovery; inventory-complete crawl; fail-closed throw on empty/incomplete). Download sitemap button added to Site Analyzer UI. Unit-tested (191/191 in Geek-SEO) and compiles clean in all three repos (Geek-SEO, GeekAPI, GeekContentCreator); **not yet run end-to-end against a live domain**, not committed/pushed. See [docs/HANDOFF-site-analyzer-sitemap-step1.md](./docs/HANDOFF-site-analyzer-sitemap-step1.md).

## Operator smoke (day one)

1. Sign in → **Creates** → client → **Start a create** (blog) → fill Content Brief → **Save brief** → **Generate**
2. Site Analyzer → pick gap → **Start create** (site section with related pages required) → brief → Generate (not keyword-only)
3. Image prompt: **Start create** with type Image prompt (topic + notes required) → brief → Generate
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
