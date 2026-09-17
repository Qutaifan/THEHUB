<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-29 | Updated: 2026-09-17 -->

# css

## Purpose

The sitewide stylesheet pair, introduced on the `design/unify-and-homepage` branch. Before
these files existed every page carried its own inline `<style>` block, and **two** token
systems were in play — a cyan one on the homepage and the review corpus, a purple one on
the pillar, alternative, about and contact pages, with different backgrounds, text colours,
container widths and navigation. `site.css` collapses both onto the cyan palette the THEHUB
logo mark already uses.

Both files are committed (first in PR #35, extended on `design/neon-hub-core`).

## Key Files

| File | Description |
|------|-------------|
| `site.css` | 1,172 lines (2026-09-17). Structural and visual system, in 22 numbered sections listed in the file header. §21 Neon holds the glow tokens (`--glow-sm/md/lg`, `--neon-text`); §22 Deep field holds the blue-black base palette. |
| `motion.css` | 2,695 lines. The immersive layer: ambient field, cards, kinetic type, reveals, tickers, landing sequence, brand mark, review and pillar immersion, the ZYRN credit (09f), and the homepage stage (13–17: home stage, neon field, hub core, pillar holograms, pillar spectrum). Paired with `../js/motion.js` and `../js/hub-core.js`. |

## Measured state (2026-08-29)

- 180 site HTML pages exist (excluding the gitignored `MY-NOTES/` vault and the
  never-deployed `freeapps-components/`).
- **179 of 180 link both sheets.** The single holdout is `404.html`.
- **23 site pages still carry a `<style>` block** of their own — the migration remainder,
  not a finished state. Reproduce the count with the command under Testing Requirements.

Report these as numbers you re-measured, not as numbers you read here.

## For AI Agents

### Working In This Directory

- **Section 02 is load-bearing — do not "clean up" the legacy aliases.** The pillar,
  alternative, about and contact pages carry inline `style=""` attributes naming the *old
  purple-system* variables (`--bg`, `--card`, `--accent`, `--r`, `--font`, …). Section 02
  points those names at the unified values, which recolours that markup with no per-page
  edits. Deleting an alias silently reverts every page that still uses it. Grep the HTML
  for a variable name before removing it.
- **Edit inside the numbered sections.** Both files are organised 01–20 with a contents
  list in the header comment. A rule appended to the bottom of the file is a rule nobody
  will find. If you add a section, add it to the header list in the same change.
- **Class names from all three original templates are supported on purpose.** The sheet is
  written to drop into existing pages without touching their markup. An unfamiliar-looking
  selector is probably load-bearing for one of the older templates — check before deleting.
- **Ad slots must keep their reserved height** (`min-height: 250px`, root `AGENTS.md` §5).
  No rule here may make an `.adsbygoogle` container collapse, animate in, or depend on JS
  for its box. Unreserved units cause layout shift on a monetised site.
- **`motion.css` is decoration only.** Every effect must be transform/opacity so it cannot
  shift layout or cost CLS, and the whole layer collapses under `prefers-reduced-motion`
  (three separate blocks — `motion.css:626`, `:958`, and `site.css:997`). If you add an
  effect, add its reduced-motion stand-down in the same change.
- Nothing animates before `<html class="js">` is set, so a failed script never leaves
  content hidden. Do not write a rule that hides content by default and reveals it only
  from JS.

### Testing Requirements

There is no build step and no CSS linter wired into CI. Verify by measurement:

```bash
# adoption — how many pages link the sheets
grep -rl 'css/site\.css' --include=*.html . | grep -v freeapps-components | wc -l

# migration remainder — pages still carrying their own <style>
grep -rl '<style' --include=*.html . | grep -v freeapps-components | grep -v MY-NOTES | wc -l

# a token you are about to rename or delete is still referenced nowhere
grep -rn 'var(--the-token)' --include=*.html --include=*.css .
```

Then the repository gates, which check ad placement and indexability:

```bash
python .github/scripts/compliance.py .
python .github/scripts/content_quality.py .
```

Visual changes need a browser. Root `AGENTS.md` §0 rule 3: "verified in Chrome" and
"reported by an HTTP fetch" are not the same claim — say which one you did.

### Common Patterns

- Tokens on `:root`, referenced with `var()`. Never a raw hex outside section 01.
  **Exception, deliberate:** §22 redefines the palette on `html:root`, not `:root`. About
  forty pages re-declare the old greys (`--bg:#0A0A0B`, `--card:#18181B`, …) in their own
  inline `:root{}`, which comes later in source order; `html:root` outranks them without
  editing those pages. Changing it back to `:root` silently reverts them to grey.
- **The ZYRN credit (09f) is another firm's mark and is never recoloured** — its violet
  seam is the one non-palette colour on the site, and the rules fighting `footer a`'s cyan
  hover are compound on purpose.
- Surfaces step `--bg-base` → `--surface-1` → `--surface-2`; text steps
  `--text-primary` → `--text-secondary` → `--text-muted`.
- One visible focus treatment sitewide (`site.css:173`). The original templates had none,
  which was a keyboard-accessibility defect. Do not remove it per-component.
- Section comments are prose explaining *why*, not labels. Match that when adding one.

## Dependencies

### Internal

- `../js/motion.js` — writes the custom properties `motion.css` reads
  (`--mx`/`--my`, `--rx`/`--ry`, `--px`/`--py`, `--scroll`, `--i`, `--vw`)
- `../fonts/inter/inter-latin-var.woff2` — the self-hosted type stack
- Every page's `<head>`: `<link rel="stylesheet" href="/css/site.css" />`

### External

None. No preprocessor, no framework, no CDN — plain CSS served as-is.

<!-- MANUAL: notes added below this line are preserved on regeneration -->
