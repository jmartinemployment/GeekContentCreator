# Geek Content Creator

Day-one writing loop: Site Analyzer gaps + site section context into create, generate, revise, on-page SEO, polish, content approval, Repurpose (Mix).

**Plan:** [CONTENT_CREATOR_PLAN.md](./CONTENT_CREATOR_PLAN.md)  
**Architecture:** [architecture.md](./architecture.md) — Next → GeekOAuth + GeekAPI only (never GeekRepository directly).

## Stack

- Next.js 16 App Router + TypeScript + Tailwind
- GeekOAuth client: `geek-content-creator`
- GeekAPI namespace: `/api/geek-content-creator/*`
- Local port: **3003**

## Dev

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3003](http://localhost:3003). Requires GeekOAuth (:5001) and GeekAPI (often **:8080** on macOS if :5000 is taken by AirPlay) with Content Creator facades, plus GeekRepository (:5050).

Local GeekRepository against a shared DB may need `SKIP_AUTH_SQL_MIGRATIONS=1` if auth SQL scripts lack ownership.

## Status

Day-one surfaces implemented: GeekOAuth client, GeekAPI `/api/geek-content-creator/*` (via GeekRepository), Next UI on **:3003**.

## Smoke checklist

1. Sign in → **New create** → Blog (no pillar) → Generate  
2. Create with Pillar when wanted  
3. **Site Analyzer** → Analyze domain → pick gap → create prefilled with site section banner  
4. Generate with Site Analyzer create → prompt includes related pages (banner shows N pages)  
5. Standalone **Image prompt** blocked without notes; succeeds with topic+notes  
6. **AI Tools** from human names + brief; pick-from-artifact when candidates exist  
7. Revise Full/Section → new version  
8. On-page SEO + Apply via revise; Polish + Apply  
9. Content approval → **Repurpose** Mix (types+counts, no auto suite)  
10. Pillar / multi-tool Generate returns job and completes (poll)

Optional: set `GEEK_SEO_API_URL` and pass a Niche profile id for live gaps.

## API smoke (no LLM)

With GeekAPI + GeekRepository running Content Creator routes:

```bash
GEEK_API_URL=http://localhost:5000 GEEK_BEARER="$(uuidgen)" python3 scripts/smoke-gcc-api.py
```

Covers Site Analyzer analyze → section context (non-empty related pages) → create gate → persist.

## Deploy (Vercel)

Production host: **https://geek-content-creator.vercel.app** (GitHub → Vercel, same pattern as Geek Content Workflow).

Required project env (Production + Preview):

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_APP_URL` | `https://geek-content-creator.vercel.app` (preview: use Vercel URL) |
| `NEXT_PUBLIC_AUTH_URL` | `https://auth.geekatyourspot.com` |
| `NEXT_PUBLIC_GEEK_API_URL` | `https://api.geekatyourspot.com` |
| `NEXT_PUBLIC_OAUTH_CLIENT_ID` | `geek-content-creator` |
| `NEXT_PUBLIC_OAUTH_REDIRECT_URI` | `{APP_URL}/auth/callback` |

OAuth client already allows `geek-content-creator.vercel.app` (+ preview hosts). GeekAPI CORS already allows those Vercel hosts.

Optional: `Dockerfile` remains for container experiments only (`DOCKER_BUILD=1` enables `output: "standalone"`).
