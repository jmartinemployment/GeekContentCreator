<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## `src/lib/` vs `src/services/` — no spaghetti

`src/lib/` is pure utilities only: types, config, validation, storage helpers, local data catalogs. **No `fetch()` calls and no API-client methods belong in `src/lib/`, ever.** Any file that talks to a backend (this app's own API, GeekAPI, or any other service) belongs in `src/services/`.

This is a hard rule, not a style preference. `src/lib/` previously accumulated fetch-based clients (`gcc-api.ts`, `content-writer/api.ts`, `auth/tokens.ts`) mixed in with pure utilities, and separately accumulated native GeekContentCreator code parked under a `content-writer/` folder that misattributed it to a different product (see `docs/plans/workflow-start-create-fix.md` for the full incident). Both are being unwound. Do not let it happen again — spaghetti is not to be tolerated:

- New fetch/API method → `src/services/`, never `src/lib/`.
- New file → name and place it for what it *does*, not what it's near or what it used to be part of.

**Backend boundary:** GeekAPI (the backend this app talks to) follows a parallel rule: it does not
reuse any content-writer repo's (v2, v3, or unversioned) backend methods — it owns its own
generation code. When you call `src/services/content-writer-api.ts` endpoints, you're calling
GeekAPI-owned code, never routed to content-writer repos. The contract is stable because GeekAPI
is the owner; content-writer repos are treated as legacy/deprecated for GeekAPI's purposes.
