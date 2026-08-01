#!/usr/bin/env python3
"""API smoke for Geek Content Creator day-one Site Analyzer path (no LLM).

Requires GeekAPI (+ GeekRepository) with Content Creator routes deployed.
Auth: Bearer UUID (GeekAPI dev path) or a real access token.

  GEEK_API_URL=http://localhost:5000 \\
  GEEK_BEARER=<uuid-or-jwt> \\
  python3 scripts/smoke-gcc-api.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = os.environ.get("GEEK_API_URL", "http://localhost:5000").rstrip("/")
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
    status, analysis = req(
        "POST",
        f"{GCC}/site-analyzer/analyze",
        {"domain": "example.com", "seedTopic": "payroll automation"},
    )
    if status >= 400:
        print("FAIL analyze", status, analysis)
        return 1
    assert isinstance(analysis, dict)
    aid = analysis.get("id")
    gaps = analysis.get("gaps") or []
    if not aid or not gaps:
        # older API: fetch gaps
        status, gaps = req("GET", f"{GCC}/site-analyzer/{aid}/gaps")
        if status >= 400 or not gaps:
            print("FAIL gaps", status, gaps)
            return 1
    print(f"OK analyze id={aid} gaps={len(gaps)} demo={analysis.get('isDemo')}")

    gap = gaps[0] if isinstance(gaps, list) else None
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

    # Gate: create without related pages must 400 when siteAnalysisId set
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

    # Persist round-trip: gaps still load after "restart" (repo, not memory)
    status, gaps2 = req("GET", f"{GCC}/site-analyzer/{aid}/gaps")
    if status >= 400 or not gaps2:
        print("FAIL persisted gaps", status, gaps2)
        return 1
    print("OK site analysis persisted (gaps reload)")

    # Image prompt create gate
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

    # Generate with site-context create — may 502/503 without LLM keys; still must not 400 on gate
    create_id = created["id"]
    status, gen = req(
        "POST",
        f"{GCC}/creates/{create_id}/generate",
        {"provider": "OpenAi"},
    )
    if status == 400:
        print("FAIL generate blocked by site-context gate unexpectedly", gen)
        return 1
    if status in (200, 202):
        print(f"OK generate started/completed status={status}")
    elif status in (502, 503):
        print(f"OK generate reached LLM path (provider unavailable status={status})")
    else:
        print(f"WARN generate status={status} body={gen}")

    print("SMOKE PASS (analyze → section context → gate → create → imagePrompt gate; generate if keys allow)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
