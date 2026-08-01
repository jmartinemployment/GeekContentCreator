# Geek Content Creator

**Base:** Content Writer v2 (clients → projects → crawl → generate).  
**Additions:** Site Analyzer, revise/SEO/polish/approve/Mix (in progress).

**Plan:** [CONTENT_CREATOR_PLAN.md](./CONTENT_CREATOR_PLAN.md)  
**Architecture:** [architecture.md](./architecture.md) — Next → GeekOAuth + GeekAPI only (never GeekRepository directly).

## Stack

- Next.js 16 App Router + TypeScript + Tailwind
- GeekOAuth client: `geek-content-creator`
- Content Writer v2 via GeekAPI: `/api/clients`, `/api/projects/.../generate/*` (proxied at `/api/cw/*`)
- Local port: **3003**

## Dev

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3003](http://localhost:3003). Requires GeekOAuth and GeekAPI (often **:8080** on macOS) with Content Writer v2 controllers merged in.

## Smoke checklist (CWV2 path)

1. Sign in → **Projects** → select/create client → **New Project**
2. Open project → Crawl → upload keyword sources → Generate (pillar/blog/tools/…)
3. Confirm draft appears in Content Results

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

`/app/creates` is the earlier homemade create/generate surface — not the primary path.
