#!/usr/bin/env python
"""Install fail-closed analytics and replace the ineffective Accept-only banner.

Dry-run by default. --apply writes only after every page passes preservation
checks. Google CMP is configured separately in the existing AdSense account.
"""
import argparse
import re
import subprocess
from pathlib import Path
from disable_held_review_ads import words
from remove_cookie_banner import BANNER_DIV_PAT, BANNER_CSS_LINE_PAT

# Alternative guides use an inline style on the paragraph in the same block.
BANNER_DIV_PAT = re.compile(BANNER_DIV_PAT.pattern.replace('<p>', r'<p\b[^>]*>'), re.S | re.I)

ROOT = Path(__file__).resolve().parents[1]
TAG = '<script src="/js/privacy.js"></script>'
NOTICE = ('<aside class="privacy-notice" aria-label="Privacy information">'
          '<p>We use cookies and similar technologies for advertising and optional analytics. '
          'Optional Google Analytics loads only after a usable signal from Google\'s consent service. '
          'You can review available choices or read our <a href="/privacy-policy">privacy policy</a>.</p>'
          '<button type="button" data-privacy-settings>Privacy choices</button> '
          '<span role="status" data-privacy-status></span></aside>')
ANALYTICS = re.compile(r'<script\b[^>]*src=["\']https://www\.googletagmanager\.com/gtag/js\?[^"\']+["\'][^>]*>\s*</script>', re.I)


def transform(source):
    updated = ANALYTICS.sub('', source)
    updated = BANNER_CSS_LINE_PAT.sub('', updated)
    updated = BANNER_DIV_PAT.sub(NOTICE, updated)
    if NOTICE not in updated:
        updated, inserted = re.subn(r'</body>', NOTICE + '\n</body>', updated, count=1, flags=re.I)
        if inserted != 1:
            raise ValueError('missing body for privacy controls')
    head, separator, body = updated.partition('</head>')
    updated = re.sub(r'(?m)^[ \t]+$', '', head) + separator + body
    if TAG not in updated:
        # Synchronous local script runs before every third-party tag.
        updated, n = re.subn(r'(<head\b[^>]*>)', r'\1\n  ' + TAG, updated, count=1, flags=re.I)
        if n != 1:
            raise ValueError('missing head')
    original_text = words(BANNER_DIV_PAT.sub('', source).replace(NOTICE, ''))
    new_text = words(updated.replace(NOTICE, ''))
    if original_text != new_text or len(words(updated)) < len(words(source)):
        raise ValueError('editorial text changed or body words dropped')
    if ANALYTICS.search(updated) or 'id="cookie-banner"' in updated:
        raise ValueError('unconditional analytics or fake consent remains')
    return updated


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    paths = subprocess.check_output(['git', 'ls-files', '*.html'], cwd=ROOT, text=True).splitlines()
    changes = []
    total_before = total_after = 0
    for name in paths:
        if name.startswith(('freeapps-components/', '_next/')) or name == '404.html':
            continue
        path = ROOT / name
        source = path.read_text(encoding='utf-8')
        updated = transform(source)
        total_before += len(words(source))
        total_after += len(words(updated))
        if source != updated:
            changes.append((path, updated))
            print(f'{name}: gate Analytics via Google CMP; replace misleading banner; words {len(words(source))} -> {len(words(updated))}')
    if args.apply:
        for path, updated in changes:
            path.write_text(updated, encoding='utf-8', newline='\n')
    remaining = sum(bool(ANALYTICS.search((ROOT / p).read_text(encoding='utf-8')))
                    for p in paths if not p.startswith(('freeapps-components/', '_next/')))
    print(f'{"Applied" if args.apply else "Proposed"} {len(changes)} pages; body words {total_before} -> {total_after}; unconditional Analytics loaders remaining={remaining}')
    return int(args.apply and remaining > 0)


if __name__ == '__main__':
    raise SystemExit(main())
