#!/usr/bin/env python3
"""API smoke for Geek Content Creator Site Analyzer (fail-closed).

Requires GeekAPI with Content Creator routes deployed.

  GEEK_API_URL=https://api.geekatyourspot.com \\
  GEEK_BEARER=<access-token> \\
  python3 scripts/smoke-gcc-api.py

Optional live path (domain must match a Geek-SEO project for that user):

  GEEK_SA_DOMAIN=example.com GEEK_BEARER=<token> python3 scripts/smoke-gcc-api.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = os.environ.get("GEEK_API_URL", "https://api.geekatyourspot.com").rstrip("/")
TOKEN = os.environ.get("GEEK_BEARER") or str(uuid.uuid4())
GCC = f"{API}/api/geek-content-creator"


def req(method: str, path: str, body: dict | None = None) -> tuple[int, dict | list | str]:
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(
        path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            parsed: dict | list | str = json.loads(raw) if raw else {}
            return resp.status, parsed
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = raw
        return e.code, parsed


def main() -> int:
    print(f"API {API}")
    # Fail-closed: unknown domain must not invent demo gaps.
    status, analysis = req(
        "POST",
        f"{GCC}/site-analyzer/analyze",
        {"domain": "example.com", "seedTopic": "payroll automation"},
    )
    if status < 400:
        print(
            "FAIL analyze expected error for example.com without Geek-SEO project;",
            "got",
            status,
            analysis,
        )
        return 1
    err = analysis.get("error") if isinstance(analysis, dict) else analysis
    print(f"OK analyze fail-closed status={status} error={err}")

    # Image prompt create still requires notes (independent of Site Analyzer).
    status, blocked_img = req(
        "POST",
        f"{GCC}/creates",
        {
            "clientId": str(uuid.uuid4()),
            "startingContentType": "imagePrompt",
            "topic": "Hero scene",
            "notes": None,
        },
    )
    if status < 400:
        print("FAIL expected imagePrompt notes gate", status, blocked_img)
        return 1
    print("OK imagePrompt create requires notes")

    # Content Brief / research / generate — no fallbacks.
    status, create = req(
        "POST",
        f"{GCC}/creates",
        {
            "clientId": str(uuid.uuid4()),
            "startingContentType": "blog",
            "topic": "smoke brief gate",
            "notes": None,
            "siteAnalysisId": None,
            "siteSection": None,
        },
    )
    if status >= 400 or not isinstance(create, dict) or not create.get("id"):
        print("FAIL create blog for brief gate", status, create)
        return 1
    cid = create["id"]
    print(f"OK create {cid} without brief")

    status, gen = req("POST", f"{GCC}/creates/{cid}/generate", {"provider": "OpenAi"})
    if status < 400:
        print("FAIL generate without brief should be blocked", status, gen)
        return 1
    gen_text = gen if isinstance(gen, str) else json.dumps(gen)
    if "brief required" not in gen_text.lower():
        print("FAIL expected 'brief required'", status, gen_text)
        return 1
    print("OK generate fail-closed without BriefJson")

    status, research = req(
        "POST",
        f"{GCC}/creates/{cid}/research/follow",
        {
            "urls": ["https://this-host-does-not-exist.invalid/page"],
            "serpIndex": None,
        },
    )
    if status < 400:
        print("FAIL research should fail closed on bad URL", status, research)
        return 1
    print(f"OK research fail-closed on URL failure status={status}")

    live_domain = (os.environ.get("GEEK_SA_DOMAIN") or "").strip()
    if not live_domain:
        print("SKIP live Site Analyzer (set GEEK_SA_DOMAIN for signed-in user with Geek-SEO analysis)")
        print("SMOKE PASS (fail-closed analyze + brief/research/generate gates)")
        return 0

    status, analysis = req(
        "POST",
        f"{GCC}/site-analyzer/analyze",
        {"domain": live_domain, "seedTopic": None},
    )
    if status >= 400:
        print("FAIL live analyze", status, analysis)
        return 1
    assert isinstance(analysis, dict)
    aid = analysis.get("id")
    gaps = analysis.get("gaps") or []
    if not aid:
        print("FAIL live analyze missing id", analysis)
        return 1
    print(f"OK live analyze id={aid} gaps={len(gaps)}")

    if not gaps:
        print("OK live analyze returned zero gaps (valid if site has none)")
        print("SMOKE PASS")
        return 0

    gap = gaps[0]
    if not isinstance(gap, dict):
        print("FAIL gap shape", gap)
        return 1
    topic = gap["topic"]
    q = urllib.parse.urlencode({"gapTopic": topic})
    status, section = req("GET", f"{GCC}/site-analyzer/{aid}/section-context?{q}")
    if status >= 400 or not isinstance(section, dict):
        print("FAIL section-context", status, section)
        return 1
    related = section.get("relatedPages") or []
    if len(related) == 0:
        print("FAIL empty relatedPages — Site Analyzer Generate would be keyword-only")
        return 1
    print(f"OK section-context relatedPages={len(related)}")

    status, blocked = req(
        "POST",
        f"{GCC}/creates",
        {
            "clientId": str(uuid.uuid4()),
            "startingContentType": "blog",
            "topic": topic,
            "siteAnalysisId": aid,
            "siteSection": {
                "siteAnalysisId": aid,
                "gapTopic": topic,
                "gapSectionPath": gap.get("sectionPath"),
                "relatedPages": [],
                "topicalNeighbors": [],
            },
        },
    )
    if status < 400:
        print("FAIL expected gate on empty relatedPages", status, blocked)
        return 1
    print("OK create gate rejects empty relatedPages")

    status, created = req(
        "POST",
        f"{GCC}/creates",
        {
            "clientId": str(uuid.uuid4()),
            "startingContentType": "blog",
            "topic": topic,
            "siteAnalysisId": aid,
            "siteSection": section,
        },
    )
    if status >= 400 or not isinstance(created, dict) or not created.get("id"):
        print("FAIL create with site section", status, created)
        return 1
    print(f"OK create {created['id']} with site section")
    print("SMOKE PASS (fail-closed + live Site Analyzer path)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
