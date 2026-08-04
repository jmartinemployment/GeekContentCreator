#!/usr/bin/env node
/**
 * Operator smoke: Site Analyzer Analyze → poll → content gaps (plan V1–V2).
 *
 * Requires a real OAuth access token (API key cannot forward SEO Bearer).
 *
 *   ACCESS_TOKEN=... node scripts/smoke-site-analyzer.mjs [domain]
 *
 * Domain defaults to geekatyourspot.com. Hits production GeekAPI.
 */
const token = process.env.ACCESS_TOKEN?.trim();
const domain = (process.argv[2] || "geekatyourspot.com").trim();
const api = (process.env.GEEK_API_URL || "https://api.geekatyourspot.com").replace(/\/$/, "");

if (!token) {
  console.error("ACCESS_TOKEN required (OAuth Bearer). API key path is fail-closed for Analyze.");
  process.exit(2);
}

const POLL_MS = 2500;
const MAX_WAIT_MS = 15 * 60 * 1000;

async function main() {
  console.log(`POST analyze domain=${domain}`);
  const startRes = await fetch(`${api}/api/geek-content-creator/site-analyzer/analyze`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ domain, seedTopic: null }),
  });
  const startBody = await startRes.json().catch(() => ({}));
  if (!startRes.ok) {
    console.error("analyze failed", startRes.status, startBody);
    process.exit(1);
  }
  if (!startBody.id) {
    console.error("analyze missing id", startBody);
    process.exit(1);
  }
  if (String(startBody.status || "").toLowerCase() === "ready") {
    console.error("FAIL V1: analyze returned ready immediately", startBody);
    process.exit(1);
  }
  console.log(`queued id=${startBody.id} status=${startBody.status}`);

  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const pollRes = await fetch(
      `${api}/api/geek-content-creator/site-analyzer/${encodeURIComponent(startBody.id)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const body = await pollRes.json().catch(() => ({}));
    if (!pollRes.ok) {
      console.error("poll failed", pollRes.status, body);
      process.exit(1);
    }
    const status = String(body.status || body.Status || "").toLowerCase();
    const step = body.step ? ` step=${body.stepNumber}/${body.totalSteps} ${body.step}` : "";
    console.log(`poll status=${status}${step}`);

    if (status === "failed") {
      console.error("FAIL V6:", body.error || body);
      process.exit(1);
    }
    if (status === "ready") {
      const gaps = body.gaps || [];
      if (!gaps.length) {
        console.error("FAIL V2: ready with zero gaps", body);
        process.exit(1);
      }
      const first = gaps[0];
      if (!first.topic || !first.reason) {
        console.error("FAIL handoff fields: gap missing topic/reason", first);
        process.exit(1);
      }
      console.log(
        `PASS V1/V2: ready with ${gaps.length} gap(s). first=${first.topic} reason=${first.reason?.slice?.(0, 60) || first.reason}`,
      );

      // Section context + Information Gain (partial)
      const ctxRes = await fetch(
        `${api}/api/geek-content-creator/site-analyzer/${encodeURIComponent(startBody.id)}/section-context?gapTopic=${encodeURIComponent(first.topic)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const ctx = await ctxRes.json().catch(() => ({}));
      if (!ctxRes.ok || !ctx.relatedPages?.length) {
        console.error("FAIL section-context", ctxRes.status, ctx);
        process.exit(1);
      }
      if (!ctx.informationGain?.summary) {
        console.error("FAIL informationGain missing on section-context", ctx);
        process.exit(1);
      }
      console.log(`PASS section-context: pages=${ctx.informationGain.thisSiteCovers?.length ?? 0} summary ok`);

      // SERP parse (plain-text fixture — no live Google)
      const parseRes = await fetch(`${api}/api/geek-content-creator/serp/parse`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetKeyword: first.topic,
          content: [
            `${first.topic} Guide`,
            "https://example.com/guide",
            "How does this topic work in practice?",
            "Related searches",
            "related query one",
          ].join("\n"),
        }),
      });
      const parsed = await parseRes.json().catch(() => ({}));
      if (!parseRes.ok || !parsed.organics?.length) {
        console.error("FAIL serp/parse", parseRes.status, parsed);
        process.exit(1);
      }
      console.log(
        `PASS serp/parse: organics=${parsed.organics.length} paa=${parsed.peopleAlsoAsk?.length ?? 0} formats=${(parsed.shape?.dominantFormats || []).join(",")}`,
      );
      process.exit(0);
    }
  }
  console.error("FAIL: timed out after 15m");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
