#!/usr/bin/env python
"""Stage the public site without publishing unfinished review manuscripts.

Source files, editorial checks, and their full-corpus findings stay intact.
Dry-run by default; --apply writes only to an explicitly selected empty directory.
An identical second run is a no-op. Changed/stale output must use a fresh directory;
this script never deletes files. Run source gates before this publication step.
"""
import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit, unquote

from content_quality import run_lifecycle_gate

ROOT = Path(__file__).resolve().parents[2]
ASSET_DIRS = {'css', 'js', 'img', 'fonts'}
ASSET_SUFFIXES = {'.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2'}
ROOT_FILES = {'ads.txt', 'robots.txt', 'feed.xml', 'rss.xml', 'sitemap.xml', 'tools.json',
              'search-index.json', 'manifest.json', 'search.js', 'toc.js', '_headers', '_redirects',
              'f04b2b2b0e4ad248b406267e36386c55.txt'}
PAGE_DIRS = {'reviews', 'author', 'how-to', 'vs', 'best-free-photo-graphic-design-tools-2026', 'free-ai-prompt-generator'}


def review_slug(url):
    parts = urlsplit(html.unescape(url))
    if parts.netloc and parts.netloc not in ('www.qutaifan.com', 'qutaifan.com'):
        return None
    path = unquote(parts.path).rstrip('/')
    match = re.fullmatch(r'/reviews/([^/]+?)(?:\.html)?', path)
    return match.group(1) if match and match.group(1) != 'index' else None


class Links(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source = source
        self.offsets = [0]
        for line in source.splitlines(keepends=True):
            self.offsets.append(self.offsets[-1] + len(line))
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            line, col = self.getpos()
            raw = self.get_starttag_text()
            self.links.append((self.offsets[line - 1] + col, raw, dict(attrs).get('href', '')))


def rewrite_links(source, replacements):
    parser = Links(source)
    parser.feed(source)
    edits = []
    for offset, tag, href in parser.links:
        slug = review_slug(href)
        if slug not in replacements:
            continue
        target = replacements[slug]
        updated = re.sub(r'\bhref\s*=\s*(["\']).*?\1',
                         lambda m: 'href="' + html.escape(target, quote=True) + '"', tag, count=1, flags=re.I | re.S)
        # Keep existing label/editorial text. Explicitly disclose the destination.
        updated = re.sub(r'\s+title\s*=\s*(["\']).*?\1', '', updated, flags=re.I | re.S)
        updated = updated[:-1] + ' title="Official product website; our review is not currently published">'
        edits.append((offset, len(tag), updated))
    for offset, length, updated in reversed(edits):
        source = source[:offset] + updated + source[offset + length:]
    # These two existing navigation labels would otherwise promise an internal
    # review after the destination became the official product website.
    def label(match):
        opening, text = match.groups()
        if text.strip() == 'Full review':
            text = 'Official product details'
        else:
            text = re.sub(r'Read our full (.*?) review', r'Read current \1 details on its official website', text)
        return opening + text + '</a>'
    source = re.sub(r'(<a\b[^>]*title="Official product website;[^>]*>)(.*?)</a>', label, source, flags=re.S)
    return source, len(edits)


def build_plan(root):
    results = run_lifecycle_gate(root)
    if any(r['verdict'] == 'FAIL' for r in results.values()):
        raise ValueError('source lifecycle gate has failures; publication refused')
    eligible = {s for s, r in results.items() if r['computed_lifecycle'] == 'INDEXABLE'}
    held = set(results) - eligible
    tools = json.loads((root / 'tools.json').read_text(encoding='utf-8'))
    replacements = {t['slug']: t['url'] for t in tools if t['slug'] not in eligible}
    for target in replacements.values():
        if urlsplit(target).scheme not in ('http', 'https'):
            raise ValueError('official target must be HTTP(S)')
    tracked = subprocess.check_output(['git', 'ls-files'], cwd=root, text=True).splitlines()
    plan = {}
    link_changes = 0
    manuscripts = {}
    for name in tracked:
        path = root / name
        rel = Path(name)
        if name.startswith('reviews/') and rel.stem in held and rel.suffix == '.html':
            manuscripts[name] = hashlib.sha256(path.read_bytes()).hexdigest()
            continue
        page = rel.suffix == '.html' and (len(rel.parts) == 1 or rel.parts[0] in PAGE_DIRS)
        asset = rel.suffix in ASSET_SUFFIXES and (len(rel.parts) == 1 or rel.parts[0] in ASSET_DIRS)
        if not (page or asset or name in ROOT_FILES):
            continue
        if path.is_symlink():
            raise ValueError('symlinks are not publication assets: ' + name)
        content = path.read_bytes()
        if page:
            document, count = rewrite_links(content.decode('utf-8'), replacements)
            link_changes += count
            if name == 'index.html':
                document = document.replace('data-count="138">138</span>', f'data-count="{len(eligible)}">{len(eligible)}</span>')
            if name == 'reviews/index.html':
                document = document.replace('138 PUBLISHED REVIEWS', f'{len(eligible)} PUBLISHED REVIEWS + OFFICIAL TOOL LINKS')
                document = document.replace('138 software reviews', f'{len(eligible)} software reviews and official tool links')
                document = document.replace('Every listing records licensing, what the free tier actually covers, and where the limits are.',
                    'Cards link to a published review when available, or directly to the official product website while our editorial work continues. Confirm current licensing and free-tier limits with the provider before choosing a tool.')
            content = document.encode('utf-8')
        elif name == 'search-index.json':
            records = json.loads(content)
            records = [r for r in records if review_slug(r.get('url', '')) not in replacements]
            for record in records:
                if record.get('url') == '/':
                    record['description'] = 'Free software guides, published reviews, and official tool websites with practical limits and alternatives.'
            content = (json.dumps(records, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        elif name == 'tools.json':
            # Generated deployment view only; canonical vault/source JSON untouched.
            records = json.loads(content)
            for record in records:
                if record['slug'] not in eligible:
                    record['review'] = ''
            content = (json.dumps(records, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        plan[name] = content
    return plan, eligible, manuscripts, link_changes


def verify(plan, eligible, manuscripts):
    errors = []
    published = {Path(p).stem for p in plan if p.startswith('reviews/') and p.endswith('.html') and p != 'reviews/index.html'}
    if published != eligible:
        errors.append('public review set differs from full-source eligibility')
    if set(plan) & set(manuscripts):
        errors.append('held manuscripts leaked into public output')
    if 'js/privacy.js' not in plan:
        errors.append('privacy integration asset missing from tracked publication files')
    for name, content in plan.items():
        if not name.endswith('.html'):
            continue
        parser = Links(content.decode('utf-8'))
        parser.feed(content.decode('utf-8'))
        for _, _, href in parser.links:
            slug = review_slug(href)
            if slug and slug not in eligible:
                errors.append(f'{name}: unpublished review link {href}')
    return errors


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()
    if args.output.is_symlink():
        raise ValueError('output must not be a symbolic link')
    output = args.output.resolve()
    if output == ROOT or output in ROOT.parents or (output.is_relative_to(ROOT) and output != ROOT / '.public-site'):
        raise ValueError('output cannot be the source repository or its ancestor')
    plan, eligible, manuscripts, link_changes = build_plan(ROOT)
    errors = verify(plan, eligible, manuscripts)
    if errors:
        raise ValueError('\n'.join(errors))
    if output.exists():
        actual = {p.relative_to(output).as_posix(): p.read_bytes() for p in output.rglob('*') if p.is_file()}
        if actual != plan:
            raise ValueError('output is not identical; select a fresh empty directory (nothing deleted)')
        print('Identical output: 0 files changed')
    elif args.apply:
        for name, content in plan.items():
            path = output / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            print('write ' + name)
    else:
        for name in manuscripts:
            print('withhold (source preserved) ' + name)
    for name, digest in manuscripts.items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest:
            raise ValueError('source manuscript changed: ' + name)
    print(f'Public HTML={sum(n.endswith(".html") for n in plan)}; published reviews={len(eligible)}; held manuscripts preserved={len(manuscripts)}; links retargeted={link_changes}; verification errors={len(errors)}')


if __name__ == '__main__':
    main()
