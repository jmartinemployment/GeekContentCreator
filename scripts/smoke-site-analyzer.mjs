#!/usr/bin/env node
/**
 * Operator smoke: Analyze queues a crawl; wait for site_analysis_profiles.Id
 * on the crawl list, then load gaps by that id.
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

function profileId(row) {
  return String(row?.id ?? row?.Id ?? "").trim();
}

async function listProfileIds() {
  const res = await fetch(
    `${api}/api/geek-content-creator/site-analyzer/profiles/by-domain?domain=${encodeURIComponent(domain)}&limit=50`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const body = await res.json().catch(() => []);
  if (!res.ok) {
    throw new Error(`profiles/by-domain failed ${res.status} ${JSON.stringify(body)}`);
  }
  const list = Array.isArray(body) ? body : [];
  return new Set(list.map(profileId).filter(Boolean));
}

async function main() {
  const beforeIds = await listProfileIds();
  console.log(`POST analyze domain=${domain} knownCrawls=${beforeIds.size}`);
  const startRes = await fetch(`${api}/api/geek-content-creator/site-analyzer/analyze`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ domain, seedTopic: null, force: true }),
  });
  const startBody = await startRes.json().catch(() => ({}));
  if (!startRes.ok) {
    console.error("analyze failed", startRes.status, startBody);
    process.exit(1);
  }
  const status = String(startBody.status || "").toLowerCase();
  if (status === "ready") {
    console.error("FAIL V1: analyze returned ready immediately", startBody);
    process.exit(1);
  }
  if (status && status !== "queued") {
    console.error("FAIL: expected queued", startBody);
    process.exit(1);
  }
  console.log(`queued status=${startBody.status || "queued"}`);

  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const nowIds = await listProfileIds();
    const freshId = [...nowIds].find((id) => !beforeIds.has(id));
    if (!freshId) {
      console.log("waiting for site_analysis_profiles.Id on crawl list");
      continue;
    }
    console.log(`crawl id=${freshId}`);

    const snapRes = await fetch(
      `${api}/api/geek-content-creator/site-analyzer/${encodeURIComponent(freshId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const body = await snapRes.json().catch(() => ({}));
    if (!snapRes.ok) {
      console.error("snapshot failed", snapRes.status, body);
      process.exit(1);
    }
    const gaps = body.gaps || body.Gaps || [];
    if (!gaps.length) {
      console.error("FAIL V2: crawl with zero gaps", body);
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

    const ctxRes = await fetch(
      `${api}/api/geek-content-creator/site-analyzer/${encodeURIComponent(freshId)}/section-context?gapTopic=${encodeURIComponent(first.topic)}`,
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
  console.error("FAIL: timed out after 15m waiting for site_analysis_profiles.Id");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
