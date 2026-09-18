#!/usr/bin/env python3
"""COMPLIANCE gate — sitewide technical/policy checks, independent of the
per-review content-quality lifecycle logic in content_quality.py.

v1 of this script (still preserved, unmodified, as the external Freetools
check_adsense.py — see that file's own docstring) checked exactly one
thing: every page carries the AdSense <head> tag. v2 keeps that check
(check_adsense_loader, run over every page via rglob, same as before) and
adds seven more, each independently real and runnable:

  - AdSense loader        (per page, unchanged logic from check_adsense.py)
  - ads.txt               (IAB authorized-sellers line present and correct)
  - robots directives     (crawlable, no blanket block, correct Sitemap ref)
  - privacy-policy page   (exists, discloses cookies/AdSense/analytics)
  - editorial-policy page (exists, states the independence/no-affiliate policy)
  - contact page          (exists, has a real way to make contact)
  - dormant affiliate state (no affiliate-shaped links actually live anywhere,
                              regardless of what the policy page promises)
  - conflicting indexability directives (robots meta / sitemap / robots.txt
                              don't contradict each other, sitewide — distinct
                              from content_quality.py's per-review check,
                              which asks whether exposure matches computed
                              content quality; this asks whether a page's own
                              technical signals are self-consistent)
  - ad placement integrity (every <ins class="adsbygoogle"> has a matching
                              push() call, min-height reservation, at most 2
                              units per page, >=400 visible words between
                              units on two-unit pages, and no placeholder
                              slot IDs anywhere in the deployable repo)

Any finding from any check fails the job (exit 1) — compliance is binary,
not tiered like content quality's lifecycle warnings.
"""
from __future__ import annotations
import html
import re
import sys
from pathlib import Path
from html.parser import HTMLParser

from content_quality import run_lifecycle_gate

PUB = "ca-pub-9640734919758311"
DOMAIN = "https://www.qutaifan.com"

ADSENSE_SCRIPT_PAT = re.compile(
    r'<script\b([^>]*)src="https://pagead2\.googlesyndication\.com/pagead/js/adsbygoogle\.js\?client=' + re.escape(PUB) + r'"([^>]*)>',
    re.I,
)
ROBOTS_META_PAT = re.compile(r'<meta\s+name="robots"\s+content="([^"]*)"', re.I)
AFFILIATE_QUERY_PAT = re.compile(r'[?&](ref|aff|affiliate|tag)=', re.I)
INS_PAT = re.compile(r'<ins\b[^>]*class=["\']adsbygoogle["\'][^>]*>', re.I)
PUSH_PAT = re.compile(r'\(\s*adsbygoogle\s*=\s*window\.adsbygoogle\s*\|\|\s*\[\]\s*\)\s*\.push\s*\(\s*\{\s*\}\s*\)')
SLOT_PAT = re.compile(r'data-ad-slot\s*=\s*["\']([^"\']+)["\']', re.I)
MIN_HEIGHT_PAT = re.compile(r'min-height\s*:', re.I)
PLACEHOLDER_SLOTS = {"1234567890", "0987654321", "auto", "your_real_slot_id"}
MAX_UNITS_PER_PAGE = 2
MIN_WORDS_BETWEEN_UNITS = 400


class AdInventoryParser(HTMLParser):
    """Detect advertising independently of attribute order and quote style."""

    def __init__(self):
        super().__init__()
        self.inventory = []
        self.in_script = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.in_script = tag == "script" or self.in_script
        if tag == "script" and "googlesyndication.com/pagead/js/adsbygoogle.js" in attrs.get("src", "").lower():
            self.inventory.append("AdSense loader")
        if tag == "ins" and "adsbygoogle" in attrs.get("class", "").split():
            self.inventory.append("manual ad unit")

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = False

    def handle_data(self, data):
        if self.in_script and "adsbygoogle" in data:
            self.inventory.append("ad initialization")


def check_ad_free_inventory(document: str) -> list[str]:
    parser = AdInventoryParser()
    parser.feed(document)
    return [f"advertising forbidden on held-back content: {item}" for item in parser.inventory]


def check_adsense_loader(html: str) -> list[str]:
    """Unchanged logic from the original check_adsense.py's head_ok(), split
    into specific reasons: the meta tag and the loader script are two
    separate, independently-checkable requirements."""
    if "</head>" not in html:
        return ["no </head> found"]
    head = html.split("</head>")[0]
    problems = []
    if f'name="google-adsense-account" content="{PUB}"' not in head:
        problems.append('missing <meta name="google-adsense-account"> tag in <head>')
    m = ADSENSE_SCRIPT_PAT.search(head)
    if not m:
        problems.append("missing AdSense loader <script src=...adsbygoogle.js?client=...> tag in <head>")
    elif "async" not in (m.group(1) + m.group(2)):
        problems.append("AdSense loader <script> tag present but missing the async attribute")
    return problems


def check_ads_txt(site_root: Path) -> list[str]:
    path = site_root / "ads.txt"
    if not path.exists():
        return ["ads.txt is missing"]
    text = path.read_text(errors="ignore")
    expected = f"google.com, pub-9640734919758311, DIRECT, f08c47fec0942fa0"
    if expected not in text:
        return [f"ads.txt does not contain the expected IAB authorized-sellers line: {expected!r}"]
    return []


def check_robots_directives(site_root: Path) -> list[str]:
    path = site_root / "robots.txt"
    if not path.exists():
        return ["robots.txt is missing"]
    text = path.read_text(errors="ignore")
    problems = []
    if not re.search(r"(?im)^Allow:\s*/\s*$", text):
        problems.append("robots.txt has no blanket 'Allow: /' — crawlers may be unable to reach pages to see their noindex tags")
    if re.search(r"(?im)^Disallow:\s*/\s*$", text):
        problems.append("robots.txt contains a blanket 'Disallow: /', which would block all crawling")
    if f"Sitemap: {DOMAIN}/sitemap.xml" not in text:
        problems.append(f"robots.txt does not reference the expected Sitemap URL ({DOMAIN}/sitemap.xml)")
    return problems


def check_privacy_policy_page(site_root: Path) -> list[str]:
    path = site_root / "privacy-policy.html"
    if not path.exists():
        return ["privacy-policy.html is missing"]
    lower = path.read_text(errors="ignore").lower()
    required_terms = ["cookie", "adsense", "google analytics"]
    missing = [t for t in required_terms if t not in lower]
    if missing:
        return [f"privacy-policy.html is missing required disclosure terms: {missing}"]
    return []


def check_editorial_policy_page(site_root: Path) -> list[str]:
    path = site_root / "editorial-policy.html"
    if not path.exists():
        return ["editorial-policy.html is missing"]
    lower = path.read_text(errors="ignore").lower()
    required_terms = ["affiliate", "independent", "adsense"]
    missing = [t for t in required_terms if t not in lower]
    if missing:
        return [f"editorial-policy.html is missing required policy terms: {missing}"]
    return []


def check_contact_page(site_root: Path) -> list[str]:
    path = site_root / "contact.html"
    if not path.exists():
        return ["contact.html is missing"]
    html = path.read_text(errors="ignore")
    if "mailto:" not in html and "<form" not in html.lower():
        return ["contact.html has no mailto: link and no <form> — no actual way to make contact"]
    return []


def check_dormant_affiliate_state(site_root: Path) -> list[str]:
    """Confirms the site's own stated no-affiliate-links policy (see
    editorial-policy.html: "We do not add affiliate parameters, referral
    codes, sponsored attributes, or hidden tracking links") is currently
    true in practice, not just written down. A regression guard: the
    Freetools-root affiliate-links.json / inject-affiliate-links.py tooling
    exists but is not run against this site today — this check fails loudly
    if that ever changes without an explicit policy update."""
    problems = []
    for p in iter_site_files(site_root):
        html = p.read_text(errors="ignore")
        for m in re.finditer(r'(?:href|src)=["\']([^"\']+)["\']', html):
            url = m.group(1)
            if "affiliate" in url.lower() or AFFILIATE_QUERY_PAT.search(url):
                problems.append(f"{p.relative_to(site_root)}: affiliate-shaped link — {url}")
    return problems


# Directories present in the working tree but absent from the deployed site.
#
#   MY-NOTES/   -- the Obsidian vault. It is gitignored, so it is not in the
#                  actions/checkout that `wrangler pages deploy .` publishes.
#                  Verified: https://www.qutaifan.com/MY-NOTES/ returns 404.
#                  Without this exclusion a half-finished draft in the vault
#                  fails CI on a completely unrelated pull request.
#   node_modules/, .git/ -- never deployed, and expensive to walk.
#
# Deliberately NOT excluded: _next/ and .github/scripts/. Compiled chunks and
# tooling do ship, and check_ad_placement_integrity scans them on purpose for
# placeholder slot IDs.
NON_DEPLOYED_DIRS = {"MY-NOTES", "node_modules", ".git"}


def iter_site_files(site_root: Path, pattern: str = "*.html"):
    """Every file matching `pattern` that is actually part of the deployed site."""
    for path in sorted(site_root.rglob(pattern)):
        if set(path.relative_to(site_root).parts) & NON_DEPLOYED_DIRS:
            continue
        yield path

def _parse_sitemap_urls(site_root: Path) -> set[str]:
    sitemap = site_root / "sitemap.xml"
    if not sitemap.exists():
        return set()
    return set(re.findall(r"<loc>([^<]+)</loc>", sitemap.read_text(errors="ignore")))


def _page_has_noindex(html: str) -> bool:
    return any("noindex" in tag.lower() for tag in ROBOTS_META_PAT.findall(html))


def check_conflicting_indexability_directives(site_root: Path, domain: str = DOMAIN) -> list[str]:
    """Sitewide, mechanical self-consistency — distinct from content_quality.
    py's per-review check, which cross-references CONTENT-derived lifecycle
    against exposure. This one only asks whether a page's own technical
    signals (robots meta, sitemap membership, robots.txt) agree with each
    other, independent of why."""
    problems = []
    sitemap_urls = _parse_sitemap_urls(site_root)

    for p in iter_site_files(site_root):
        html = p.read_text(errors="ignore")
        tags = ROBOTS_META_PAT.findall(html)
        rel = p.relative_to(site_root)
        if len(tags) > 1:
            problems.append(f'{rel}: {len(tags)} <meta name="robots"> tags found, expected at most 1')
        if _page_has_noindex(html):
            slug_url = f"{domain}/{rel.with_suffix('')}"
            if slug_url in sitemap_urls:
                problems.append(f"{rel}: page is noindex but {slug_url} is present in sitemap.xml")

    robots_path = site_root / "robots.txt"
    if robots_path.exists():
        for rule in re.findall(r"(?im)^Disallow:\s*(\S+)\s*$", robots_path.read_text(errors="ignore")):
            if rule in ("", "/"):
                continue
            for u in sitemap_urls:
                if u.startswith(domain + rule):
                    problems.append(f"robots.txt 'Disallow: {rule}' blocks sitemap URL {u}")

    return problems


def _visible_words(html_fragment: str) -> int:
    """Rendered visible word count for a fragment — same method the project's
    hard-rule-4 counter uses (scripts/archive/fix_review_truthfulness.py body_words),
    so the 400-word spacing rule is measured the way the 2026-08-16 audit
    measured it."""
    s = re.sub(r"(?is)<script.*?</script>", " ", html_fragment)
    s = re.sub(r"(?is)<style.*?</style>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return len(html.unescape(s).split())


def check_ad_placement_integrity(site_root: Path) -> list[str]:
    """AdSense placement rules from PROJECT-BRIEF §6, now enforced by the gate:
    every unit has a push() call and a min-height reservation, no page carries
    more than two units, two-unit pages keep >=400 visible words between them,
    and no placeholder slot ID appears anywhere in the deployable repo."""
    problems: list[str] = []

    # Placeholder slot IDs anywhere that can emit or carry a unit. Compiled
    # chunks in _next/ are included on purpose: they deploy and would serve
    # a dead unit just like a hand-edited page.
    for p in iter_site_files(site_root, "*"):
        if not p.is_file() or p.suffix.lower() not in (".html", ".js", ".py"):
            continue
        if "node_modules" in p.parts or "freeapps-components" in p.parts:
            continue
        text = p.read_text(errors="ignore")
        for m in SLOT_PAT.finditer(text):
            if m.group(1).strip().lower() in PLACEHOLDER_SLOTS:
                problems.append(f"{p.relative_to(site_root)}: placeholder data-ad-slot={m.group(1)!r}")

    for p in iter_site_files(site_root):
        rel = p.relative_to(site_root)
        if rel.as_posix() == "404.html" or "freeapps-components" in rel.parts:
            continue
        html_src = p.read_text(errors="ignore")
        units = list(INS_PAT.finditer(html_src))
        if not units:
            continue
        if len(units) > MAX_UNITS_PER_PAGE:
            problems.append(f"{rel}: {len(units)} ad units, project maximum is {MAX_UNITS_PER_PAGE}")
        for m in units:
            if not MIN_HEIGHT_PAT.search(m.group(0)):
                problems.append(f"{rel}: ad unit without min-height reservation (CLS guard)")
        if not PUSH_PAT.search(html_src):
            problems.append(f"{rel}: {len(units)} ad unit(s) but no adsbygoogle.push() call")
        if len(units) == 2:
            between = html_src[units[0].end():units[1].start()]
            words = _visible_words(between)
            if words < MIN_WORDS_BETWEEN_UNITS:
                problems.append(
                    f"{rel}: only {words} visible words between two ad units "
                    f"(project minimum {MIN_WORDS_BETWEEN_UNITS})"
                )
    return problems


CHECKS = [
    ("ads_txt", check_ads_txt),
    ("robots_directives", check_robots_directives),
    ("privacy_policy_page", check_privacy_policy_page),
    ("editorial_policy_page", check_editorial_policy_page),
    ("contact_page", check_contact_page),
    ("dormant_affiliate_state", check_dormant_affiliate_state),
    ("conflicting_indexability_directives", check_conflicting_indexability_directives),
    ("ad_placement_integrity", check_ad_placement_integrity),
]


def main() -> int:
    site_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    all_problems: list[str] = []

    # The adsense_loader check asks "does this page carry the AdSense account
    # meta and loader script". Two classes of file must be exempt:
    #
    #   404.html                -- a noindex error page with no article body.
    #                              The loader enables Auto Ads, so requiring it
    #                              here would let Google inject ads onto a page
    #                              with no publisher content, which is a policy
    #                              violation rather than a compliance win.
    #   freeapps-components/**  -- a Vite dev scaffold that is never deployed
    #                              and is not reachable from any live page.
    #
    # Everything else on the site is still checked.
    ADSENSE_EXEMPT_FILES = {"404.html"}
    ADSENSE_EXEMPT_DIRS = {"freeapps-components"}

    def _adsense_exempt(rel: Path) -> bool:
        return rel.as_posix() in ADSENSE_EXEMPT_FILES or bool(
            set(rel.parts) & ADSENSE_EXEMPT_DIRS
        )

    all_pages = list(iter_site_files(site_root))
    # A noindex tag does not disable ads. Compute eligibility from the unchanged
    # editorial gate, so deleting noindex cannot restore ads on low-value pages.
    reviews = run_lifecycle_gate(site_root)
    ad_free_reviews = {f"reviews/{slug}.html" for slug, result in reviews.items()
                       if result["computed_lifecycle"] != "INDEXABLE"}
    for p in all_pages:
        rel = p.relative_to(site_root)
        if _adsense_exempt(rel):
            continue
        if rel.as_posix() in ad_free_reviews:
            # Ownership verification remains required even without ad serving.
            if f'name="google-adsense-account" content="{PUB}"' not in p.read_text(encoding="utf-8").split('</head>')[0]:
                all_problems.append(f"[adsense_loader] {rel}: missing AdSense account meta")
            for reason in check_ad_free_inventory(p.read_text(encoding="utf-8")):
                all_problems.append(f"[ad_free_inventory] {rel}: {reason}")
            continue
        for reason in check_adsense_loader(p.read_text(errors="ignore")):
            all_problems.append(f"[adsense_loader] {rel}: {reason}")

    for name, fn in CHECKS:
        for reason in fn(site_root):
            all_problems.append(f"[{name}] {reason}")

    if all_problems:
        print("COMPLIANCE CHECK FAILED:")
        for p in all_problems:
            print(f"  - {p}")
        print(f"\n{len(all_problems)} problem(s) across {len(CHECKS) + 1} checks, {len(all_pages)} pages scanned.")
        return 1

    print(f"compliance OK — {len(CHECKS) + 1} checks clean across {len(all_pages)} pages; {len(ad_free_reviews)} held-back reviews checked for zero advertising")
    return 0


if __name__ == "__main__":
    sys.exit(main())
