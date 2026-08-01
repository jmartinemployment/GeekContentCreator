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
        page.goto(APP, wait_until="domcontentloaded")
        page.screenshot(path=str(OUT / "01-landing.png"), full_page=True)
        title = page.title()
        body = page.inner_text("body")
        assert "Geek Content Creator" in body, body[:500]
        assert page.locator('a[href="/api/auth/start"]').count() >= 1

        page.goto(f"{APP}/api/auth/start", wait_until="domcontentloaded")
        page.screenshot(path=str(OUT / "02-authorize.png"), full_page=True)
        url = page.url
        # Unauthenticated users land on /Account/Login?ReturnUrl=/connect/authorize?...
        assert "auth.geekatyourspot.com" in url, url
        assert "client_id%3Dgeek-content-creator" in url or "client_id=geek-content-creator" in url, url
        assert "geek-content-creator.vercel.app" in url, url
        assert "geek-content-workflow" not in url, url
        print("OK landing → GeekOAuth login for geek-content-creator")
        print("  title:", title)
        print("  login:", url[:180], "...")
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
