<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-27 | Updated: 2026-08-27 -->

# .github/scripts

## Purpose

The two CI quality gates. These are **authoritative judgements about the site**, not
lint. Both are pure-stdlib Python, runnable standalone and importable for tests. The
workflows in `../workflows/` hardcode this path.

## Key Files

`stage_public_site.py` derives a deployment artifact from the full-source content
gate, leaving held manuscripts intact. `test_publication.py` checks that held
reviews cannot leak and eligible reviews cannot disappear. Do not change content
thresholds to affect staging. Use an empty output directory or an identical one;
the staging script never deletes or overwrites mismatched output.

| File | Description |
|------|-------------|
| `compliance.py` | Sitewide technical/policy gate. Nine checks: AdSense loader per page, `ads.txt` authorized-sellers line, `robots.txt` directives, privacy-policy / editorial-policy / contact pages exist and say what they must, dormant-affiliate state, self-consistent indexability directives, and ad-placement integrity (matching `push()`, `min-height` reservation, ≤2 units/page, ≥400 words between units, no placeholder slot IDs). |
| `content_quality.py` | Per-review editorial gate. Emits `Finding(check, detail)` per page, then resolves each page to one of four lifecycle states via `determine_lifecycle_state`. Two separate bars: **PUBLISHABLE** (safe to serve at all) and the stricter **INDEXABLE** (safe to promote to search engines — adds duplication limits). |

## For AI Agents

### Working In This Directory

**Measured 2026-08-27: `content_quality.py` exits 0.** Verdicts were `PASS=43`,
`PASS_WITH_WARNING=84`, `PASS_WITH_PROMINENT_WARNING=11`, `FAIL=0`; lifecycle
`INDEXABLE=43 PUBLISHABLE_NOINDEX=84 DRAFT=11`.

Note that `CLAUDE.md` and the root `AGENTS.md` §6 both still say this gate "currently
fails". That text is stale — the FAILs were cleared on 2026-08-16 by PR #13, which synced
each page's `noindex`/sitemap membership to the lifecycle the gate already computed
(`../../scripts/fix_lifecycle_exposure.py`), weakening no threshold and no logic.

**The exit code is not the point, and a green gate does not clear the constraint.** 95 of
138 reviews are still held out of the index for excessive template repetition. The
editorial backlog is real and open, so the rule stands: do not add new review pages until
those warnings clear, and read the warning counts, not just the exit status.

- **Never weaken a check, raise a threshold, or add an exemption to turn a gate green.**
  Both files exist because agents previously did exactly that. `scripts/verify_facts.js`
  carries the same warning for the same reason.
- The fix for a content-quality failure is **editorial** — reviews whose sections are not
  interchangeable — never a change to this file.
- `404.html` is deliberately exempt from the AdSense-loader check: it has no publisher
  content, so it must carry no loader and no units. Do not "fix" that exemption.
- `compliance.py` passes today. If your change breaks it, your change is wrong.

### Testing Requirements

```bash
python .github/scripts/compliance.py .
python .github/scripts/content_quality.py .
```

Run both **before and after** any content work and report the delta in counts. A gate
that reports the same number before and after a large edit has probably not seen your
change.

### Common Patterns

- `check_*` functions return `list[Finding]`; empty means clean.
- Blocking checks are declared in `PUBLISHABLE_BLOCKING_CHECKS` and
  `INDEXABLE_BLOCKING_CHECKS` (a superset).
- Page discovery is `Path.rglob` over the repo root passed as `argv[1]`.

## Dependencies

### Internal

- The full repo tree, `tools.json`, `sitemap.xml`, `robots.txt`, `ads.txt`.
- `../../scripts/fix_lifecycle_exposure.py` consumes the lifecycle this module computes
  and syncs each review's robots meta and sitemap membership to match it. It must never
  change a threshold here.

### External

- Python 3.11 standard library only (`re`, `json`, `collections`, `pathlib`).

<!-- MANUAL: notes added below this line are preserved on regeneration -->

2026-09-18: Compliance now computes review eligibility using the unchanged content
gate. Held-back reviews must contain zero advertising code; this is an enforced
prohibition, not an unchecked loader exemption. Eligible pages still require the
loader and all review pages retain account verification. Run regression tests with
`python .github/scripts/test_ad_inventory.py`. Do not infer Google approval from
these checks.
