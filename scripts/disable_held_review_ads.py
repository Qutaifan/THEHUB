#!/usr/bin/env python
"""Remove advertising from reviews below the unchanged editorial quality bar.

Dry-run by default; --apply writes. This is ad containment, not an editorial
rewrite or an assertion of AdSense approval. Source HTML is patched at whole
element boundaries; HTMLParser checks visible content before anything is saved.
"""
import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.github' / 'scripts'))
from content_quality import run_lifecycle_gate
from compliance import check_ad_free_inventory

LOADER = re.compile(r'<script\b[^>]*src=["\']https://pagead2\.googlesyndication\.com/pagead/js/adsbygoogle\.js[^"\']*["\'][^>]*>\s*</script>', re.I)
UNIT = re.compile(r'<div class="ad-slot-container">\s*<span\b[^>]*>SPONSORED ADVERTISEMENT</span>\s*<ins\b[^>]*class="adsbygoogle"[^>]*>\s*</ins>\s*<script>\(adsbygoogle = window.adsbygoogle \|\| \[\]\)\.push\(\{\}\);</script>\s*</div>')
NOTICE = '<p class="editorial-status">This entry is awaiting further editorial work. Advertising is disabled on this review while that work remains incomplete.</p>'


class BodyText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.body = False
        self.hidden = 0
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag == 'body':
            self.body = True
        if tag in ('script', 'style'):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag == 'body':
            self.body = False
        if tag in ('script', 'style'):
            self.hidden -= 1

    def handle_data(self, data):
        if self.body and not self.hidden:
            self.text.extend(data.split())


def words(document):
    parsed = BodyText()
    parsed.feed(document)
    parsed.close()
    return parsed.text


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    results = run_lifecycle_gate(ROOT)
    changes = []
    before_total = after_total = 0
    for slug, result in sorted(results.items()):
        path = ROOT / 'reviews' / f'{slug}.html'
        before = path.read_text(encoding='utf-8')
        after = before
        if result['computed_lifecycle'] != 'INDEXABLE':
            after = LOADER.sub('', after)
            after = after.replace('  <!-- Google AdSense Official Script -->\n  \n', '')
            after = UNIT.sub(NOTICE, after)
            if check_ad_free_inventory(after):
                raise ValueError(f'{path.name}: unrecognized advertising markup; no files written')
            # Prove the exact visible editorial text is preserved, not just its length.
            original = words(before.replace('SPONSORED ADVERTISEMENT', '').replace(NOTICE, ''))
            amended = words(after.replace(NOTICE, ''))
            if original != amended:
                raise ValueError(f'{path.name}: editorial text changed; no files written')
        old_words, new_words = len(words(before)), len(words(after))
        if new_words < old_words:
            raise ValueError(f'{path.name}: body word count dropped; no files written')
        before_total += old_words
        after_total += new_words
        if before != after:
            changes.append((path, after))
            print(f'{path.relative_to(ROOT)}: remove ad loader/unit, add editorial status; body words {old_words} -> {new_words}')
    if args.apply:
        for path, after in changes:
            path.write_text(after, encoding='utf-8', newline='\n')
    remaining = sum(bool(check_ad_free_inventory((ROOT / 'reviews' / f'{slug}.html').read_text(encoding='utf-8')))
                    for slug, r in results.items() if r['computed_lifecycle'] != 'INDEXABLE')
    print(f'{"Applied" if args.apply else "Proposed"}: {len(changes)} files; corpus body words {before_total} -> {after_total}; held reviews still carrying ads={remaining}')
    return 1 if args.apply and remaining else 0


if __name__ == '__main__':
    sys.exit(main())
