#!/usr/bin/env python3
"""Headless smoke: Vercel landing → auth start with geek-content-creator client."""

from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("/tmp/gcc-vercel-smoke")
OUT.mkdir(parents=True, exist_ok=True)
APP = "https://geek-content-creator.vercel.app"


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(APP, wait_until="networkidle")
        page.screenshot(path=str(OUT / "01-landing.png"), full_page=True)
        title = page.title()
        body = page.inner_text("body")
        assert "Geek Content Creator" in body or "Content Creator" in body or "Geek" in body, body[:500]
        # Prefer Sign in CTA if present
        link = page.get_by_role("link", name="Sign in")
        if link.count() == 0:
            link = page.locator('a[href*="auth/start"], a[href*="/api/auth/start"]').first
        else:
            link = link.first
        link.click()
        page.wait_for_url("**/connect/authorize**", timeout=20000)
        page.screenshot(path=str(OUT / "02-authorize.png"), full_page=True)
        url = page.url
        assert "client_id=geek-content-creator" in url, url
        assert "geek-content-creator.vercel.app" in url, url
        assert "geek-content-workflow" not in url, url
        print("OK landing → authorize")
        print("  title:", title)
        print("  authorize:", url[:160], "...")
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
