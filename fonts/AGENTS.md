<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-27 | Updated: 2026-08-30 -->

# fonts

## Purpose

Self-hosted web fonts. Self-hosting rather than linking Google Fonts is deliberate: it
removes a third-party request from every page, which matters both for Core Web Vitals and
for what the privacy policy has to disclose.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `inter/` | Holds `inter-latin-var.woff2` — the Inter variable font, Latin subset. |
| `space-grotesk/` | Holds `space-grotesk-500.woff2` (13 KB) — **not a THEHUB face.** It sets the ZYRN wordmark in the footer credit, and nothing else. |

## For AI Agents

### Working In This Directory

- **Measured 2026-08-27: 7 deployable pages reference `fonts/inter`** — the graphic-design,
  video-editing, Linux-distro and open-source pillars, plus `editorial-policy.html`,
  `free-alternative-to-photoshop.html`, and `free-password-generator.html`. Method:
  `grep -rl "fonts/inter" --include="*.html" .`, excluding `freeapps-components/`. Every
  other page falls back to a system stack. That inconsistency is real; do not "fix" it by
  bulk-editing `<head>` across the corpus without counting words before and after.
- **Renaming or moving this file breaks those 7 pages silently.** A missing `woff2` does
  not error — it falls back to a system font — so a browser check is required, not an
  HTTP fetch.
- Binary assets are served straight from the repo root. Adding a font here adds a public
  URL and page weight; prefer subsetting an existing family over adding another.
- **`space-grotesk/` is a deliberate exception to the line above, and it is fenced in.**
  It is another firm's brand face, present so their mark is set in their own type rather
  than approximated in ours. `css/motion.css` §09f pins its `unicode-range` to
  `U+004E, U+0052, U+0059, U+005A` — N, R, Y, Z — so the file cannot render THEHUB copy
  even by accident. **Do not widen that range and do not use this face for anything
  else.** It ships whole rather than subsetted to four glyphs only because there is no
  `fonttools` on this machine; subsetting it to ~1.5 KB is a real improvement if a
  toolchain ever appears. Licence travels with it in `space-grotesk/README.txt` (OFL-1.1
  requires this).
- Keep `font-display: swap` and the `preload` hint together wherever the face is declared.
  Dropping either reintroduces layout shift, which is also an ad-placement concern.

### Testing Requirements

```bash
grep -rl "fonts/inter" --include="*.html" . | grep -v freeapps-components | wc -l
```

Space Grotesk is referenced from CSS, not from any `<head>`, so the grep above will
never find it. A missing woff2 falls back silently to a system font, which for a
wordmark reads as a design choice rather than a failure — so check it in a browser:

```bash
# expect: true, and a width that differs from the forced-serif control
#   document.fonts.check('500 20px "Space Grotesk"')
```

Compare this count before and after any change here. Confirm rendering in a browser —
a font fallback is invisible to `curl`.

### Common Patterns

One directory per family, variable format (`woff2`) only, Latin subset only.

## Dependencies

### Internal

- The 7 pages listed above; `../docs/superpowers/specs/` treats this as the type stack for
  the visual reskin.

### External

- Inter (SIL Open Font License 1.1). Retain the licence terms if the font is redistributed.

<!-- MANUAL: notes added below this line are preserved on regeneration -->
