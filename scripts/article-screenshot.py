#!/usr/bin/env python3
"""
Capture a clean screenshot of a news article.

Requirements:
    pip install playwright
    playwright install chromium

Usage (auto path — today's date folder, outlet inferred from URL):
    python scripts/article-screenshot.py <URL>

Usage (explicit output):
    python scripts/article-screenshot.py <URL> <output.jpg>
    python scripts/article-screenshot.py <URL> <output.jpg> --width 460

Auto-path logic:
    briefings/YYYY-MM-DD/<outlet>_article_01.jpg
    briefings/YYYY-MM-DD/<outlet>_article_02.jpg  (if 01 already exists)
    ...

Supported sites (with precise cleanup):
    asasmedia.com  →  outlet: asasmedia
    almodon.com    →  outlet: almodon

All other URLs get generic popup/ad removal and use the hostname as the outlet name.
"""

import re
import argparse
import asyncio
from datetime import date
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

# ── Tracker domains to block ────────────────────────────────────────────────
BLOCKED_DOMAINS = [
    "googlesyndication.com",
    "doubleclick.net",
    "google-analytics.com",
    "googletagmanager.com",
    "facebook.net",
    "hotjar.com",
    "intercom.io",
    "crisp.chat",
    "taboola.com",
    "outbrain.com",
    "clarity.ms",
    "amplitude.com",
    "segment.io",
    "mixpanel.com",
    "sentry.io",
    "ads.yahoo.com",
]

# ── Generic cleanup CSS (applies to all sites) ───────────────────────────────
GENERIC_CSS = """
/* popups, overlays, modals */
[class*="popup"]:not(article):not([class*="article"]),
[class*="modal"],
[class*="cookie"],
[class*="consent"],
[class*="gdpr"],
[id*="cookie"],
[id*="consent"],
[id*="popup"],
/* newsletter / subscribe prompts */
[class*="newsletter"],
[class*="subscribe"],
/* ads */
ins.adsbygoogle,
[id*="google_ads"],
[id*="taboola"],
[id*="outbrain"],
[class*="sponsored"],
[class*="promoted"],
/* social floating */
[class*="social-float"],
[class*="share-float"],
[class*="sticky-social"],
/* chat */
[id*="intercom"],
[class*="chat-widget"],
/* back-to-top */
[id*="back-to-top"],
[class*="back-to-top"],
/* notifications */
[class*="push-notification"],
/* recaptcha badge */
.grecaptcha-badge {
    display: none !important;
}
"""

# ── Site-specific CSS ────────────────────────────────────────────────────────
SITE_CSS = {
    "asasmedia.com": """
        /* footer */
        footer, .td-footer-wrapper { display: none !important; }
        /* related posts – both mobile and desktop versions */
        .related-posts, .suggested-posts { display: none !important; }
        /* sidebar column */
        .left-section { display: none !important; }
        /* secondary nav block above article (the non-article container-fluid) */
        .container-fluid.px-asas:not(.px-asas-single) { display: none !important; }
        /* language switcher */
        .gtranslate_wrapper, .gt_switcher_wrapper, [id*="gt-wrapper"] { display: none !important; }
        /* social share buttons inside the article header */
        .share-buttons, .custom-share, [class*="share-btn"] { display: none !important; }
        /* audio player */
        audio, [class*="audio-player"], .wp-audio-shortcode { display: none !important; }
        /* reading time strip below the featured image */
        .duration, .under-image,
        [class*="reading-time"], [class*="read-time"], [class*="read-duration"] { display: none !important; }
    """,
    "almodon.com": """
        /* footer */
        .app-footer { display: none !important; }
        /* notification request bar */
        .app-notification-request { display: none !important; }
        /* ads: top leaderboard, mid-article leaderboard, bottom billboard */
        .app-ad-leaderboard, .app-ad-billboard { display: none !important; }
        /* author related articles + sidebar column */
        .author-articles, .app-sidebar { display: none !important; }
    """,
}

# ── Site-specific JS cleanup (for Tailwind colon classes etc.) ───────────────
# These run after CSS injection.
SITE_JS = {
    "almodon.com": """
        () => {
            // Remove the sidebar 1/3 column (Tailwind lg:w-1/3 class can't be CSS-selected)
            document.querySelectorAll('.app-sections-detail *').forEach(el => {
                if (el.className && typeof el.className === 'string' &&
                    el.className.includes('lg:w-1/3')) {
                    el.style.display = 'none';
                }
            });
            // Remove font-size controls + share bar (article's first child div)
            const artFirst = document.querySelector('article > div:first-child');
            if (artFirst) artFirst.style.display = 'none';
            // Remove fixed overlay backdrop and mobile drawer (but keep the fixed nav header)
            document.querySelectorAll('*').forEach(el => {
                const style = getComputedStyle(el);
                if (style.position === 'fixed' && el.offsetHeight > 200) {
                    // Keep the main nav header (bg-white border-b-2 border-blue1)
                    if (!el.className.includes('border-blue1')) {
                        el.style.display = 'none';
                    }
                }
            });
        }
    """,
    "asasmedia.com": """
        () => {
            // Remove fixed overlays and mobile sidenav
            document.querySelectorAll('.sidenav, .overlay, .mobile-header-socials').forEach(el => {
                el.style.display = 'none';
            });
        }
    """,
}

# ── Per-site navigation strategy ─────────────────────────────────────────────
# almodon is Angular with SSR — domcontentloaded gives SSR HTML before hydration fights it.
# asasmedia is WordPress — domcontentloaded is fine.
SITE_WAIT = {
    "almodon.com": {"until": "domcontentloaded", "extra_ms": 2000},
    "asasmedia.com": {"until": "domcontentloaded", "extra_ms": 1500},
}
DEFAULT_WAIT = {"until": "domcontentloaded", "extra_ms": 2000}


# ── Outlet name inference ─────────────────────────────────────────────────────
# Maps a domain substring to the outlet slug used in filenames.
OUTLET_MAP = {
    "asasmedia.com": "asasmedia",
    "almodon.com": "almodon",
}

# ─────────────────────────────────────────────────────────────────────────────

def _match_domain(url: str, domains: dict) -> str | None:
    for domain in domains:
        if domain in url:
            return domain
    return None


def _infer_outlet(url: str) -> str:
    """Return the outlet slug for a URL, falling back to the bare hostname."""
    for domain, slug in OUTLET_MAP.items():
        if domain in url:
            return slug
    host = urlparse(url).hostname or "outlet"
    # Strip www. and TLD, keep the middle part: www.example.com → example
    parts = host.lstrip("www.").split(".")
    return parts[0]


def _next_output_path(outlet: str, folder: Path) -> Path:
    """
    Return briefings/<today>/<outlet>_article_NN.jpg where NN is one higher
    than the highest existing sequence number (starting at 01).
    """
    pattern = re.compile(rf"^{re.escape(outlet)}_article_(\d+)\.(jpg|jpeg|png)$", re.IGNORECASE)
    highest = 0
    if folder.exists():
        for f in folder.iterdir():
            m = pattern.match(f.name)
            if m:
                highest = max(highest, int(m.group(1)))
    return folder / f"{outlet}_article_{highest + 1:02d}.jpg"


def resolve_output(url: str) -> Path:
    """Build the default output path from today's date and the inferred outlet."""
    today = date.today().strftime("%Y-%m-%d")
    outlet = _infer_outlet(url)
    folder = Path("briefings") / today
    return _next_output_path(outlet, folder)


# ── First-paragraph crop JS ──────────────────────────────────────────────────
# Finds the first direct child with substantial text, then hides ALL siblings
# that follow it — including image-only or empty elements.
# Returns the bottom Y of the last visible element (in document coords) so the
# caller can clip the screenshot tightly.
FIRST_PARA_JS = """
() => {
    const containerSelectors = [
        '.single-post-content',
        '.details-body',
        '.entry-content',
        '[itemprop="articleBody"]',
        'article .post-content',
    ];
    let container = null;
    for (const sel of containerSelectors) {
        try {
            const el = document.querySelector(sel);
            if (el && el.offsetHeight > 100) { container = el; break; }
        } catch(e) {}
    }
    if (!container) return null;
    const firstTextBlock = [...container.children].find(
        el => el.offsetHeight > 0 && el.textContent.trim().length > 20
    );
    if (!firstTextBlock) return null;
    let el = firstTextBlock.nextElementSibling;
    while (el) {
        el.style.display = 'none';
        el = el.nextElementSibling;
    }
    // Return the bottom edge of the first paragraph in document coordinates
    const rect = firstTextBlock.getBoundingClientRect();
    return Math.ceil(rect.bottom + window.scrollY) + 48;  // 48px bottom padding
}
"""


async def screenshot(url: str, output: str, width: int, first_para: bool = True) -> None:
    out = Path(output)
    out.parent.mkdir(parents=True, exist_ok=True)

    matched = _match_domain(url, SITE_CSS)
    extra_css = SITE_CSS.get(matched, "") if matched else ""
    extra_js = SITE_JS.get(matched, "") if matched else ""
    wait_cfg = SITE_WAIT.get(matched, DEFAULT_WAIT) if matched else DEFAULT_WAIT

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": width, "height": 900},
            device_scale_factor=2,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
                "Mobile/15E148 Safari/604.1"
            ),
        )
        page = await context.new_page()

        # Block trackers to speed up load and stop network-idle from never settling
        async def route_handler(route):
            if any(d in route.request.url for d in BLOCKED_DOMAINS):
                await route.abort()
            else:
                await route.continue_()

        await page.route("**/*", route_handler)

        print(f"  → Loading {url}")
        await page.goto(url, wait_until=wait_cfg["until"], timeout=60_000)
        await page.wait_for_timeout(wait_cfg["extra_ms"])

        # Dismiss any visible cookie/consent button
        for sel in (
            "button[class*='accept']",
            "button[class*='cookie']",
            "button[class*='consent']",
            "button[aria-label='Close']",
            "button[aria-label='إغلاق']",
        ):
            try:
                el = await page.query_selector(sel)
                if el and await el.is_visible():
                    await el.click()
                    await page.wait_for_timeout(300)
            except Exception:
                pass

        # Inject cleanup CSS
        await page.add_style_tag(content=GENERIC_CSS + extra_css)

        # Run site-specific JS cleanup
        if extra_js:
            await page.evaluate(extra_js)

        # Crop to first paragraph only (default)
        clip_height: int | None = None
        if first_para:
            clip_height = await page.evaluate(FIRST_PARA_JS)

        await page.wait_for_timeout(300)

        # Screenshot
        ext = out.suffix.lower()
        fmt = "jpeg" if ext in (".jpg", ".jpeg") else "png"
        kwargs = {"quality": 88} if fmt == "jpeg" else {}

        if clip_height:
            await page.screenshot(
                path=str(out), type=fmt,
                clip={"x": 0, "y": 0, "width": width, "height": clip_height},
                **kwargs,
            )
        else:
            await page.screenshot(path=str(out), full_page=True, type=fmt, **kwargs)
        await browser.close()

    size_kb = out.stat().st_size // 1024
    print(f"  ✓ Saved {out}  ({size_kb} KB)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Capture a clean article screenshot.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("url", help="Article URL")
    parser.add_argument(
        "output",
        nargs="?",
        default=None,
        help="Output path (.jpg/.png). Omit to auto-generate as briefings/YYYY-MM-DD/<outlet>_article_NN.jpg",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=460,
        help="Viewport width in CSS pixels (default: 460)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        default=False,
        help="Capture the full article instead of stopping after the first paragraph",
    )
    args = parser.parse_args()

    out = args.output if args.output else str(resolve_output(args.url))
    asyncio.run(screenshot(args.url, out, args.width, first_para=not args.full))


if __name__ == "__main__":
    main()
