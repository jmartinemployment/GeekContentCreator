# Geek Content Creator

**Base:** Content Writer v2 (clients → projects → crawl → generate).  
**Additions:** Site Analyzer, standalone blog (pillar optional), AI Tools from names, revise / SEO / polish / content approval / Mix, standalone image prompts.

**Plan:** [CONTENT_CREATOR_PLAN.md](./CONTENT_CREATOR_PLAN.md)  
**Architecture:** [architecture.md](./architecture.md) — Next → GeekOAuth + GeekAPI only (never GeekRepository directly).

## Stack

- Next.js 16 App Router + TypeScript + Tailwind
- GeekOAuth client: `geek-content-creator`
- Content Writer v2 via GeekAPI: `/api/clients`, `/api/projects/.../generate/*` (proxied at `/api/cw/*`)
- CC facades: `/api/geek-content-creator/*` (tools-from-names, project revise, Site Analyzer)
- Local port: **3003**

## Dev

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3003](http://localhost:3003). Auth and API are **hosted only**: GeekOAuth (`auth.geekatyourspot.com`) and GeekAPI (`api.geekatyourspot.com`). Do not run a local GeekAPI.

**Site Analyzer:** Enter a domain you already have analyzed in Geek-SEO (same signed-in user). Content Creator loads real gaps and existing page URLs from that site model. If Geek-SEO is unset, unauthorized, or has no project/analysis for the domain, Analyze returns an error — it does not invent gaps or related pages. GeekAPI needs `GEEK_SEO_API_URL=https://seo-api.geekatyourspot.com`.

## Smoke checklist (day one)

1. Sign in → **Projects** → client → **New Project** → Crawl + research → **Generate blog** (no pillar)
2. Site Analyzer → pick gap → project with related-page research → Generate
3. Standalone image prompt on dashboard (topic + notes)
4. AI Tools: pick from drafts or names + brief (no Tools section required)
5. SEO/polish → Revise (pillar / blog / tool / image prompt) → Content approval → Mix

## Deploy (Vercel)

Production host: **https://geek-content-creator.vercel.app**

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_APP_URL` | `https://geek-content-creator.vercel.app` |
| `NEXT_PUBLIC_AUTH_URL` | `https://auth.geekatyourspot.com` |
| `NEXT_PUBLIC_GEEK_API_URL` | `https://api.geekatyourspot.com` |
| `NEXT_PUBLIC_OAUTH_CLIENT_ID` | `geek-content-creator` |
| `NEXT_PUBLIC_OAUTH_REDIRECT_URI` | `{APP_URL}/auth/callback` |
| `GEEK_BACKEND_API_KEY` | optional server-only fallback for `/api/cw` |

## Legacy

`/app/creates` redirects to Projects. Prefer CWV2 projects on `/app`.
