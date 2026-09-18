<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-27 | Updated: 2026-08-27 -->

# scripts

## Purpose

Maintenance, generation, and verification tooling for the static site. Most of these are
one-shot repair scripts written for a specific incident and kept for provenance; a few
are live tooling that is still run. Nothing here is imported by the site at runtime.

`robots.txt` disallows `/scripts/`, but this directory **is still uploaded by the
deploy** — the repo root is the site. Do not put secrets or scratch data here.

## Key Files

All live tooling. One-shot historical repairs moved to `archive/` on 2026-08-27.

| File | Description |
|------|-------------|
| `sync_tools_from_obsidian.js` | **The data pipeline.** Rebuilds `tools.json` from `MY-NOTES/THEHUB/Tools/<category>/*.md`. `--check` / `--apply`. `tools.json` is generated; never hand-edit it. |
| `generate_full_sitemap.js` | Rebuilds `sitemap.xml`. Filters `noindex` pages, emits the Cloudflare **200 form** per layout. `--check` / `--apply`. |
| `verify_facts.js` | Gate for `docs/facts/*.json`. Mechanical and deliberately un-reasonable-with; each check exists because a specific agent run shipped a specific fabrication. **Never edit it to make a batch pass.** |
| `fix_lifecycle_exposure.py` | Syncs each review's robots meta and sitemap membership to the lifecycle `content_quality.py` computes. **Re-run this after any editorial batch** — it is what flips a rewritten page to `index` and into the sitemap. Changes no threshold and no body content. |
| `build_internal_links.js` | Rebuilds `reviews/index.html` as a categorised index and inserts "Read our full X review" links under pillar headings. Inserts only after a heading's closing tag, so it cannot break nesting. |
| `build_alternative_pages.js` | Programmatic-SEO generator for `free-alternative-to-*.html`, data-driven from `tools.json` so pages use the catalogue's own original blurbs. The one generator that is still legitimate to run. |
| `audit_internal_redirects.js` | Read-only. Verifies internal links and canonicals point at fully-qualified 200-form URLs rather than redirects. |
| `verify_main.js` | Read-only smoke check of `main`: sitemap URL count, no `.html` in sitemap, canonical shape on a sample review. |
| `remove_cookie_banner.py` | **Pending, not historical.** Removes the homemade cookie banner, which satisfies no consent standard and conflicts with the certified Google CMP. Run only once the CMP is live — see the open item in the vault `TODO.md`. |
| `install-skills.ps1` | Installs agent skills via `npx skills` into `.claude/skills/`, recorded in `../skills-lock.json`. |
| `hermes_curator.js` | Nightly audit agent invoked by `.github/workflows/hermes_curator.yml`. **The only script in this repo wired to CI.** |
| `hermes_web_curator.js` | Batch expansion of `tools.json` across the taxonomy with FOSS/freemium entries. |
| `hermes_futuretools_curator.js` | Batch curation from the FutureTools.io benchmark list. |
| `hermes_memory.json` | Persisted curator state. Generated — do not hand-edit. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `archive/` | 12 already-run one-shot repair and generation scripts, kept for provenance only (see `archive/AGENTS.md`). Includes `build_review_pages.js` — **the script that created the templated-corpus problem.** Nothing there should be run. |

## For AI Agents

### Working In This Directory

Every script here follows one contract, and new ones must too:

- **Dry-run by default.** Write only on `--apply` (or `--check` for read-only mode).
- **Print exactly what changed, per file.**
- **Idempotent** — a second run is a no-op.
- **End with a verification that reports a number capable of being non-zero.** A check
  that confirms a generator wrote a string it was told to write is not a check.

Additional rules:

- **Never delete editorial content.** Count rendered body words before and after any bulk
  edit and compare totals. If the total drops, stop and report. This has gone wrong here.
- **Not every tool in `tools.json` has a review page.** A `review:` route in the data does
  not mean the file exists. Always filter against the actual contents of `reviews/`
  before generating links or pages — ignoring this generated 162 thin pages once.
- Prefer a real HTML parser (`html5lib` or equivalent) over regex for structural
  validation. Regex is fine for targeted substitutions; verify the result with a parser.
- When inserting markup, insert at element boundaries so nesting cannot break.

### Testing Requirements

```bash
node scripts/<name>.js            # preview — must write nothing
node scripts/<name>.js --apply
node scripts/<name>.js --apply    # second run must report zero changes
python .github/scripts/compliance.py .        # must still pass
python .github/scripts/content_quality.py .   # report the delta
```

Use `python`, not `python3` — the latter hits a Microsoft Store shim on this machine.

### Common Patterns

- Node scripts: CommonJS `require`, `path.join(__dirname, '..')` for the repo root, a
  file-header docstring explaining *why the script exists*, not just what it does.
- Python scripts: `#!/usr/bin/env python`, module docstring, dry-run flag, same contract.

## Dependencies

### Internal

- `../tools.json` (generated — read it, do not write it by hand)
- `../reviews/`, root `*.html`, `../sitemap.xml`, `../docs/facts/`
- `MY-NOTES/THEHUB/Tools/` — the vault, not committed. `sync_tools_from_obsidian.js` will
  not work from a fresh clone without it.

### External

- Node 20, Python 3.11 — both stdlib-only. There is no `package.json` here and no
  dependency install step.

<!-- MANUAL: notes added below this line are preserved on regeneration -->

`disable_held_review_ads.py` removes advertising only from reviews below the
unchanged computed INDEXABLE lifecycle. Dry-run by default, `--apply` to write.
It preserves exact editorial text and checks every page's body word count before
writing. It adds a visible editorial-status note. It does not restore ads
automatically or claim that the editorial backlog is resolved.
