# Async Generate Tools (end the HTTP timeout)

**Status:** Implemented — POST tools / tools-from-names return 202 + jobId; UI polls GET tools/jobs/{jobId}.

## What failed

Regenerate tools returned **Vercel** `FUNCTION_INVOCATION_TIMEOUT` / browser **504**. The Next `/api/cw` proxy waits for GeekAPI to finish every tool LLM call in one request. N is not fixed — it is however many unique names the crawl or paste yields. Mid-run `SaveAsync` only reduces how much paid work is lost; it does not stop the proxy from dying.

Tools Only succeeded once with 18 documents; same sync shape still risks 504 on a slower run.

## Design (shipped)

GeekAPI (not Node):

1. **POST** `…/generate/tools` and `…/generate/tools-from-names` → **202** `{ jobId, status, completed, total, … }`.
2. Background `Task.Run` + DI scope runs existing generate + skip-if-body-has-words + SaveAsync-after-each.
3. **GET** `…/generate/tools/jobs/{jobId}` → status / progress / `contentSet` when ready.
4. UI polls every 2.5s; Export still works with no pillar.

In-memory job store (one GeekAPI instance). Postgres/Redis jobs = later ship.

```mermaid
flowchart TD
  click[UI Generate tools]
  click --> enqueue[POST start job 202]
  enqueue --> worker[GeekAPI background work]
  worker --> each[LLM one tool then SaveAsync]
  each --> poll[UI polls job status]
  poll --> done[Export zip or commit]
```

## Design (GeekAPI, not Node)

Do **not** use Bull / `setImmediate` in Next. Reuse the idea behind `GccJobStore` (in-memory job id + status), but for workflow projects:

1. **POST** `…/generate/tools` and `…/generate/tools-from-names` return **202** `{ jobId }` immediately (or a dedicated `…/generate/tools/jobs` if sync routes stay during transition).
2. **Hosted worker** (or `Task.Run` + store, matching GCC jobs) runs the existing sequential generate + skip-if-body-has-words + SaveAsync-after-each logic already in `ContentGenerationOrchestrator` / `ToolPageGenerator`.
3. **GET** `…/generate/tools/jobs/{jobId}` → `{ status, completed, total, error?, contentSet? }`.
4. **UI** (`ContentResults`, `ToolsFromNamesPanel`): start job, poll every few seconds, show progress, on success call `onGenerated` and keep **Export** (tools-only gate already shipped).
5. Proxy stays short-lived: only start + poll. No Vercel maxDuration hope.

In-memory job store is enough for one GeekAPI instance (same as `GccJobStore`). Multi-instance / restart-safe jobs (Postgres or Redis) = second ship.

## Explicitly not this plan

- Raising Vercel `maxDuration` as the fix
- Node BullMQ / cron
- Requiring a pillar again
- Re-capping tool count
- Treating mid-run save as the durable design (it is a temporary mitigation only)

## After Tools Only results

Recorded: Tools Only wrote **18** documents (hub included) and pointed at Export. Step 6 still 504. Polling UX can show `completed/total` with total from the name list or crawl slot count; no change to enqueue/worker shape.

## Done when

Click Generate tools or names-only returns quickly; progress updates; all unique names + hub land without a 504; Export still works with no pillar.
