<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-27 | Updated: 2026-08-27 -->

# reviews

## Purpose

The review corpus: 138 per-tool review pages plus the hub index. These are hand-maintained
static HTML with no buildable source — every change is a patch on generated output. This
is the highest-risk directory in the repository and the subject of most of the hard rules.

## Key Files

| File | Description |
|------|-------------|
| `index.html` | The reviews hub. A categorised index of every review, grouped by `tools.json` category. Rebuilt by `scripts/build_internal_links.js`, not by hand. |
| `<slug>.html` | One review per tool, 138 of them (`bitwarden.html`, `gimp.html`, `claude.html`, …). The slug matches `slug` in `tools.json`. |

## URL form

`reviews/<slug>.html` is a flat `.html` file, so it serves **200 at `/reviews/<slug>`**
(extensionless) and 308-redirects `/reviews/<slug>/` and `/reviews/<slug>.html`.
Canonicals, `og:url`, sitemap entries, and every internal link must point at the
extensionless form. `index.html` is the opposite case: it serves 200 at `/reviews/`
*with* the trailing slash.

## For AI Agents

### Working In This Directory

These are hard rules from the root `AGENTS.md`, and each exists because it was violated here:

1. **Never auto-generate review pages.** Written by a human or not at all. `scripts/archive/build_review_pages.js` still exists and still runs; it produced the templated corpus that still holds 95 pages out of the index. It has been moved to `scripts/archive/` precisely so it is not run by reflex.
2. **Do not add new review pages until the template-repetition warnings clear.** Note the gate now *exits 0* (`FAIL=0`, measured 2026-08-27) — that is not the bar. 95 of these 138 pages are still held out of the index for `excessive_template_repetition`. Adding templated pages to that corpus is not neutral. Read the warning counts, not the exit code.
3. **Never delete editorial content.** Count rendered body words per page before and after any bulk edit and compare totals. A bulk regex rewrite destroyed this entire corpus once; `scripts/archive/merge_reviews_recovery.js` is the script that spliced ~47,000 words back in from commit `3ef61dc`.
4. **Never fabricate editorial claims.** No invented `ratingValue`, `reviewCount`, awards, testing methodology, or "we tested this for a week". `scripts/archive/fix_review_truthfulness.py` already had to strip exactly that.
5. **Structured data must match visible content.** Every `FAQPage` question in the JSON-LD must be rendered on the page. Invisible markup risks a manual action.
6. **Advertising follows editorial eligibility.** Reviews below the computed `INDEXABLE` lifecycle must have no AdSense loader, manual unit, or initialization code. Keep the account verification meta. Eligible reviews may carry one unit — slot `qutaifan-review-in-article` — with `min-height: 250px` reserved. Never a placeholder slot ID. This is a conservative inventory rule, not a claim that passing the local gate guarantees AdSense approval.
7. **Exactly one `<h1>` per page.** Duplicates were collapsed once already (`scripts/archive/fix_h1_and_duplicate_urls.js`); do not reintroduce them.

### Known state (measured 2026-08-27)

`tools.json` carries 157 entries, **all 157 with a `review:` route, but only 138 review
files exist** — 19 routes point at pages that are not here. Every review file does have a
matching `tools.json` entry. Always filter generated links against the real contents of
this directory; trusting the data alone is how 162 thin pages got generated once.

### Testing Requirements

```bash
python .github/scripts/content_quality.py .   # per-page lifecycle verdicts
python .github/scripts/compliance.py .        # ad placement, indexability consistency
node scripts/audit_internal_redirects.js      # canonicals point at 200 forms
```

Run before and after, and report the delta. Verify canonical shape against production
with `curl -I`, not by reading the file.

### Common Patterns

Each review page carries: a single `<h1>`, an E-E-A-T byline linking to
`/author/qutaifan-editorial-board/`, a JSON-LD graph
(`SoftwareApplication` + `BreadcrumbList` + `FAQPage` + `Article`), pros/cons, one
in-article ad container with reserved height, and cross-links to related tools so no page
is an orphan.

## Dependencies

### Internal

- `../tools.json` — slug, category, and metadata source
- `../author/qutaifan-editorial-board/index.html` — byline target
- `../sitemap.xml` — membership is computed, not hand-maintained
- `../scripts/build_internal_links.js`, `../scripts/fix_lifecycle_exposure.py`

### External

- Google AdSense (`ca-pub-9640734919758311`)
- schema.org vocabulary for the JSON-LD graph

<!-- MANUAL: notes added below this line are preserved on regeneration -->
