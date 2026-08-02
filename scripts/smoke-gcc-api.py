#!/usr/bin/env python3
"""API smoke for Geek Content Creator (fail-closed — no soft success).

Requires GeekAPI with Content Creator routes deployed.

  GEEK_API_URL=https://api.geekatyourspot.com \\
  GEEK_BEARER=<access-token-or-user-uuid> \\
  python3 scripts/smoke-gcc-api.py

Or service auth:

  GEEK_BACKEND_API_KEY=<key> X-Geek-User-Id=<uuid> python3 scripts/smoke-gcc-api.py

Optional live Site Analyzer path (domain must exist in Geek-SEO for that user):

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
TOKEN = (os.environ.get("GEEK_BEARER") or "").strip()
API_KEY = (os.environ.get("GEEK_BACKEND_API_KEY") or "").strip()
# Prefer bearer smoke user; API key path needs an explicit user id (no anonymous fallback).
USER_ID = (
    os.environ.get("GEEK_USER_ID")
    or os.environ.get("X_GEEK_USER_ID")
    or ""
).strip() or str(uuid.uuid4())
GCC = f"{API}/api/geek-content-creator"
AUTH_MODE = "bearer" if TOKEN else ("api-key" if API_KEY else "bearer-uuid")

COMPLETE_BRIEF = {
    "intent": "informational",
    "buyingStage": "awareness",
    "audiencePrimary": "cold_prospect",
    "audienceModifiers": [],
    "audienceDetail": "ops managers evaluating tooling",
    "audienceExclude": "",
    "angle": "howto_workflow",
    "ctaType": "subscribe",
    "ctaLabel": "",
    "lengthBand": "blog",
    "toneOfVoice": {
        "formalCasual": 3,
        "seriousPlayful": 3,
        "matterEnthusiastic": 3,
        "technicalPlain": 3,
        "authoritativePeer": 3,
    },
    "serpTitles": "",
    "serpUrls": "",
    "paaQuestions": "",
    "relatedSearches": "",
    "writingNotes": "smoke",
}


def req(method: str, path: str, body: dict | None = None) -> tuple[int, dict | list | str]:
    data = None if body is None else json.dumps(body).encode()
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    elif API_KEY:
        headers["X-API-Key"] = API_KEY
        headers["X-Geek-User-Id"] = USER_ID
    else:
        # GeekAPI accepts UUID bearer as user id for smoke (not a product fallback).
        headers["Authorization"] = f"Bearer {USER_ID}"

    r = urllib.request.Request(path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
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


def err_text(payload: dict | list | str) -> str:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, dict):
        for key in ("error", "title", "detail", "message"):
            if payload.get(key):
                return str(payload[key])
        return json.dumps(payload)
    return str(payload)


def main() -> int:
    print(f"API {API} auth={AUTH_MODE}")

    # Fail-closed: must not invent gaps. Soft pass = demo/empty invent; hard pass = error.
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
    if isinstance(analysis, dict) and analysis.get("gaps"):
        print("FAIL analyze invented gaps for unknown domain", analysis)
        return 1
    print(f"OK analyze fail-closed status={status} error={err_text(analysis)}")

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
    if "brief required" not in err_text(gen).lower():
        print("FAIL expected 'brief required'", status, gen)
        return 1
    print("OK generate fail-closed without BriefJson")

    # Incomplete brief still fails closed.
    status, patched = req(
        "PATCH",
        f"{GCC}/creates/{cid}/brief-research",
        {"briefJson": json.dumps({"intent": "informational"}), "researchJson": None},
    )
    if status >= 400 or not isinstance(patched, dict):
        print("FAIL patch incomplete brief", status, patched)
        return 1
    status, gen = req("POST", f"{GCC}/creates/{cid}/generate", {"provider": "OpenAi"})
    if status < 400 or "brief required" not in err_text(gen).lower():
        print("FAIL incomplete brief must still block generate", status, gen)
        return 1
    print("OK generate fail-closed with incomplete BriefJson")

    research_status, research = req(
        "POST",
        f"{GCC}/creates/{cid}/research/follow",
        {
            "urls": ["https://this-host-does-not-exist.invalid/page"],
            "serpIndex": None,
        },
    )
    if research_status < 400:
        print(
            "FAIL research should fail closed on bad URL",
            research_status,
            research,
        )
        return 1
    # Ensure failed research did not persist quoteables.
    get_status, after = req("GET", f"{GCC}/creates/{cid}")
    if get_status >= 400 or not isinstance(after, dict):
        print("FAIL get create after research failure", get_status, after)
        return 1
    if after.get("researchJson"):
        print("FAIL researchJson persisted after failed follow", after.get("researchJson"))
        return 1
    print(
        f"OK research fail-closed on URL failure status={research_status} "
        "(no ResearchJson saved)"
    )

    status, patched = req(
        "PATCH",
        f"{GCC}/creates/{cid}/brief-research",
        {"briefJson": json.dumps(COMPLETE_BRIEF), "researchJson": None},
    )
    if status >= 400 or not isinstance(patched, dict) or not patched.get("briefJson"):
        print("FAIL patch complete brief", status, patched)
        return 1
    print("OK complete BriefJson persisted")

    # Generate must clear the brief gate. LLM/provider errors are allowed; brief required is not.
    status, gen = req("POST", f"{GCC}/creates/{cid}/generate", {"provider": "OpenAi"})
    gen_s = err_text(gen).lower()
    if status >= 400 and "brief required" in gen_s:
        print("FAIL generate still brief-required after complete brief", status, gen)
        return 1
    if status < 400:
        print("OK generate cleared brief gate (artifact created)")
    else:
        print(f"OK generate cleared brief gate (provider/runtime status={status})")

    live_domain = (os.environ.get("GEEK_SA_DOMAIN") or "").strip()
    if not live_domain:
        print("SKIP live Site Analyzer (set GEEK_SA_DOMAIN)")
        print("SMOKE PASS (fail-closed brief/research/generate; no soft analyze)")
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
