#!/usr/bin/env python3
"""Stamp a build version onto every local CSS and JS reference in the site.

Cloudflare Pages serves this repo verbatim -- there is no bundler, so asset
filenames never change between deploys. Without a version marker a returning
visitor keeps a cached stylesheet while the freshly revalidated HTML around it
has already moved on, and the page renders against CSS that no longer matches
its markup.

Appending ?v=<commit sha> puts the build into the cache key, so a deploy
invalidates every asset immediately and the files themselves can then be
cached for a year (see _headers).

This runs in CI against the checked-out tree just before deploy. It is not
committed back: the HTML in git stays clean and unstamped.
"""

import os
import re
import subprocess
import sys

# Already content-hashed by their own build tools; stamping them again would
# only add noise to the URL.
SKIP_PREFIXES = ("/assets/", "/_next/")

SKIP_DIRS = {".git", "node_modules", ".github"}

# href="/css/site.css" or src="/js/motion.js", with or without a stamp already
# on it. Re-stamping an already-stamped tree replaces the old version rather
# than appending to it, which keeps the script safe to run twice.
ASSET = re.compile(r'(\b(?:href|src)=")(/[^"?#]+\.(?:css|js))(\?v=[^"#]*)?(")')

# A page that links no local asset is possible; the whole site losing its
# links is not. That would mean the regex or the tree changed shape, and
# deploying unstamped assets behind a one-year immutable header is exactly
# the failure this script exists to prevent -- so fail the build instead.
MIN_EXPECTED = 100


def build_version() -> str:
    sha = os.environ.get("GITHUB_SHA")
    if not sha:
        try:
            sha = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                capture_output=True, text=True, check=True,
            ).stdout.strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            sys.exit("stamp_assets: no GITHUB_SHA, and no git checkout to read a sha from")
    return sha[:8]


def html_files(root: str):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in sorted(filenames):
            if name.endswith(".html"):
                yield os.path.join(dirpath, name)


def main() -> int:
    version = build_version()
    stamp = "?v=" + version

    pages_written = 0
    refs_seen = 0

    for path in html_files(os.getcwd()):
        with open(path, encoding="utf-8") as handle:
            original = handle.read()

        seen = 0

        def rewrite(match):
            nonlocal seen
            prefix, url, suffix = match.group(1), match.group(2), match.group(4)
            if url.startswith(SKIP_PREFIXES):
                return match.group(0)
            seen += 1
            return prefix + url + stamp + suffix

        updated = ASSET.sub(rewrite, original)
        refs_seen += seen

        if updated != original:
            with open(path, "w", encoding="utf-8", newline="") as handle:
                handle.write(updated)
            pages_written += 1

    print("stamp_assets: v=%s -- %d references across the site, %d pages rewritten"
          % (version, refs_seen, pages_written))

    if refs_seen < MIN_EXPECTED:
        print("stamp_assets: FAILED -- expected at least %d local asset references, found %d."
              % (MIN_EXPECTED, refs_seen), file=sys.stderr)
        print("Deploying unstamped assets under a one-year immutable header would "
              "serve stale CSS to returning visitors. Refusing to continue.", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())