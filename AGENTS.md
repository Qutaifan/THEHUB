# AGENTS.md

Canonical operating instructions for AI agents and contributors working on **qutaifan.com** (repo: `Qutaifan/Freeapps`).

`CLAUDE.md` mirrors the hard rules for Claude Code. This file is the fuller version; where they differ, this file wins.

Full project context — architecture, history, open problems, roadmap — lives in the Obsidian vault at `MY-NOTES/THEHUB/PROJECT-BRIEF.md`, with current work in `MY-NOTES/THEHUB/TODO.md`. The vault is not committed to this repository. If you do not have it, ask before assuming context.

## 0. The vault is the source of truth — read it first, write back to it after

This applies to **every** AI agent working on this project, not just the one that set it up.

**Before acting:** read `MY-NOTES/THEHUB/HOME.md`, then `PROJECT-BRIEF.md`, then `TODO.md`. Several items marked open in `TODO.md` are already complete on a feature branch. Acting without reading means redoing finished work, or undoing it.

**After acting:** write findings back into the vault, not only into a chat reply or a scratch folder.

- A new investigation becomes `MY-NOTES/THEHUB/Audits/<date>-<name>.md`
- Anything that changes what should happen next becomes a targeted `TODO.md` edit
- A new top-level area gets a row in `HOME.md`'s "Where everything lives" table

**Four rules for writing back:**

1. **Report only what is new.** If the vault already records something, do not restate it as a discovery. Say what changed, or what contradicts it.
2. **Retract in place.** A finding that turns out wrong is struck through and corrected where it was written — never silently deleted. §1 of `Audits/2026-08-12-live-site-audit.md` is the worked example.
3. **Cite what you measured.** Numbers in the vault carry a date and a method. "Verified in Chrome" and "reported by an HTTP fetch" are not the same claim.
4. **Respect the ownership rule.** `Tools/` notes are canonical; `Categories/`, `Freeapps-Tools-by-Category.md` and `tools.json` are generated views. Never hand-edit a generated view.

The vault is deliberately **not** in this repository — `MY-NOTES/` is gitignored, because the repo root is the deployed site and anything committed here becomes a public URL. It has its own git history. **If you are working from a fresh clone you do not have it: ask for it rather than proceeding on assumption.**

---

## 1. Hard rules

Non-negotiable. Each of these exists because it was violated and caused real damage.

1. **Never push to `main`.** It is protected: pull request required, admin bypass disabled. Branch → PR → checks → merge. A direct push will be rejected at the remote.
2. **Never claim success you have not verified.** Verify against a *fresh clone of the pushed branch*, not your working copy. State what you measured and the number you got.
3. **Your verification must be able to fail.** A check that confirms a generator wrote a string it was told to write is not a check. If your test cannot distinguish success from failure, it is worthless — and worse than nothing, because it manufactures false confidence.
4. **Never delete editorial content.** Count rendered body words per page before and after any bulk edit and compare totals. If the total drops, stop and report. Bulk regex rewrites of generated HTML have destroyed the entire review corpus here before.
5. **Never fabricate editorial claims.** Do not write that tools were "audited", "tested", or "verified" unless a human did that work. Do not invent `ratingValue`, `reviewCount`, awards, or testing methodology. The site's premise is honest coverage; manufacturing credibility is worse than shipping nothing.
6. **Never auto-generate review pages.** Templated pages at scale are the specific risk this site already carries. Reviews are written by a human or not at all.
7. **Structured data must match visible content.** Every `FAQPage` question in JSON-LD must be rendered on the page for users. Invisible markup risks a manual action.
8. **Scraped vendor copy is research only.** Publisher and app-store descriptions must never be reproduced verbatim — licensing risk and duplicate-content penalty.
9. **Ask before destructive or irreversible actions** — force push, branch deletion, bulk file deletion, Cloudflare configuration changes.

---

## 2. What this repository is

An independent directory and review site for free and open-source software, AI tools, and productivity apps, monetised by Google AdSense.

The editorial promise — honest coverage that names misleading free tiers, dark patterns, and real limits — is a design constraint and an AdSense policy matter, not marketing copy. Treat it as a hard requirement on any content you touch.

---

## 3. Deployment reality

**Publication update (2026-09-18):** `.github/scripts/stage_public_site.py` creates
`.public-site/` from tracked public assets and reviews that clear the unchanged
full-source editorial gate. The deploy workflow publishes `.public-site`, not the
repository root. All 138 source manuscripts stay in `reviews/`; held manuscripts,
tooling, vault files and abandoned scaffolds must never enter the artifact.
Published link/search/data views are derived during staging. Do not hand-edit
`.public-site`, and do not run editorial checks only against that smaller output:
the complete source corpus remains authoritative. The following root-deploy notes
describe the historical setup and its risks.

**The repository root *is* the deployed website.** There is no build step and no output directory.

```
.github/workflows/deploy.yml
  → wrangler pages deploy . --project-name=qutaifan-website
```

Consequences:

- **Anything committed anywhere in this repo becomes a public URL.** Check what you commit. Editor state was publicly served this way until it was found and removed.
- **Cloudflare Pages does not delete files that disappear from a deploy.** Removing a file from the repo does not immediately remove it from production; expect stale `200`s until the cache is purged.
- **There is no buildable source for the HTML.** Review and pillar pages are hand-maintained static HTML. Every change is a patch on generated output. This is the largest piece of technical debt in the project and the root cause of most incidents.

### `freeapps-components/` is dead weight

A Vite + React scaffold that is **never deployed and not linked from any live page**. Earlier versions of this file told agents to make UI changes there. That was wrong — changes there have no effect on the site. Do not work in it unless explicitly asked to revive or remove it.

### URL rules — non-obvious, repeatedly gotten wrong

Cloudflare Pages resolves the two storage layouts to **opposite** canonical forms:

| On disk | Returns 200 at | 308-redirects |
|---|---|---|
| `x.html` | `/x` | `/x/` and `/x.html` |
| `x/index.html` | `/x/` *(trailing slash)* | `/x` |

Canonicals, `og:url`, sitemap entries, and internal links must point at the **200 form**, never at a redirect. Both directions have been wrong in this repo. Verify with `curl -I` against production rather than assuming.

---

## 4. Data layer

`tools.json` is **generated**, not authored. The source of truth is the Obsidian vault:

```
MY-NOTES/THEHUB/Tools/<category>/tool--<slug>.md
        │
        └── scripts/sync_tools_from_obsidian.js ──> tools.json
```

```bash
node scripts/sync_tools_from_obsidian.js --check    # read-only
node scripts/sync_tools_from_obsidian.js --apply    # rebuilds tools.json
```

Never hand-edit `tools.json`, and never maintain the same tool in two places.

**Not every tool in `tools.json` has a review page.** A `review:` route in the data does not mean the page exists. Always filter against the actual files in `reviews/` before generating links or pages from this data. Ignoring this is how 162 thin pages got generated once already.

---

## 5. Monetisation

Publisher ID `ca-pub-9640734919758311`. Three ad units are in use — `qutaifan-review-in-article`, `qutaifan-pillar-top`, `qutaifan-pillar-mid`. Read the existing slot IDs out of the HTML rather than inventing them.

- **Every `<ins class="adsbygoogle">` must reserve height** (`min-height: 250px`). No exceptions — unreserved units cause layout shift.
- **Never place ad units on pages without publisher content.** `404.html` deliberately has no loader and no units; the compliance gate exempts it for that reason. Do not "fix" that exemption.
- The AdSense loader is already in `<head>` sitewide. Do not paste it again per unit.
- Maximum two manual units per page; keep at least 400 words between them.
- **Never use placeholder slot IDs.** `1234567890`, `0987654321`, `auto`, and `YOUR_REAL_SLOT_ID` have all shipped to production and served nothing.

---

## 6. Quality gates

```bash
python .github/scripts/compliance.py .        # currently passes — keep it passing
python .github/scripts/content_quality.py .   # currently fails — see below
```

Branch protection on `main`: PR required, bypass disabled, **Compliance** and **Deploy** required, **Content Quality** advisory.

**The content-quality gate does not currently pass.** It measures template repetition, factual contradictions, and category mismatches across the review corpus, and it is correct to fail. Treat it as authoritative:

- **Do not weaken, bypass, or "fix" the gate to make it green.** The fix is editorial — reviews whose sections are not interchangeable.
- **Do not add new review pages until it passes.** Adding templated pages to a corpus already flagged for template repetition makes the problem worse, not bigger.
- Run it before and after any content work and report the delta.

---

## 7. Environment and commands

- Windows, PowerShell. Working directory `Q:\world\Projects\thehub` (the folder is `thehub`; the GitHub repository is `Qutaifan/Freeapps`).
- **Use `python`, not `python3`** — the latter hits a Microsoft Store shim on this machine. CI runs Ubuntu where `python3` is correct; do not "fix" the workflows to match local.
- Maintenance scripts live in `scripts/`. Quality gates live in `.github/scripts/` — the workflows hardcode that path.
- `.gitattributes` sets `*.html text eol=lf`. CRLF warnings on other file types are harmless.

### Script conventions

Every script in `scripts/` follows this contract. New ones must too:

- **Dry-run by default**; write only with `--apply`
- Print exactly what changed, per file
- **Idempotent** — a second run is a no-op
- End with a verification that reports a number capable of being non-zero

### Standard workflow

```bash
git checkout -b fix/short-description
node scripts/your_script.js            # preview
node scripts/your_script.js --apply
git add -A && git commit -m "..."
git push -u origin fix/short-description
# open the PR, let the checks run, read the diff, merge
```

---

## 8. Safe editing

- Treat `_next/` and `index.txt` route payloads as generated output. Do not hand-edit them.
- Keep edits scoped to the task. No broad formatting-only rewrites.
- Preserve existing naming and file structure unless the task requires otherwise.
- Prefer parsing HTML with a real parser (`html5lib` or equivalent) over regex when validating structural changes. Regex is acceptable for targeted substitutions, but verify the result with a parser.
- When inserting markup into existing pages, insert at element boundaries so nesting cannot break, and confirm no element was split.

---

## 9. Where things live

| Item | Path |
|---|---|
| Review pages | `reviews/<slug>.html` |
| Reviews hub | `reviews/index.html` |
| Pillar / listicle pages | root `*.html` |
| Comparison pages | `vs/<a>-vs-<b>/index.html` |
| Author / E-E-A-T page | `author/qutaifan-editorial-board/index.html` |
| Generated tool data | `tools.json` |
| Maintenance scripts | `scripts/` |
| Quality gates | `.github/scripts/` |
| Workflows | `.github/workflows/` |
| Full project context | `MY-NOTES/THEHUB/` *(vault, not committed)* |

---

## 10. Directory map

<!-- Generated: 2026-08-27 | Updated: 2026-08-29 -->

Each directory below carries its own `AGENTS.md` with local rules. Read the one for
the directory you are about to touch — the hard rules above still apply everywhere.

| Directory | Purpose |
|---|---|
| `.agents/` | Mirror of `.claude/skills/` for non-Claude agent runners (see `.agents/AGENTS.md`) |
| `.claude/` | Claude Code project config and installed skills (see `.claude/AGENTS.md`) |
| `.github/` | CI: quality gates and workflows (see `.github/AGENTS.md`) |
| `_next/` | Abandoned Next.js static payload — generated, do not edit (see `_next/AGENTS.md`) |
| `author/` | E-E-A-T editorial-board page (see `author/AGENTS.md`) |
| `css/` | Sitewide stylesheets — `site.css` + `motion.css` (see `css/AGENTS.md`) |
| `docs/` | Remediation specs, agent reports, fact sheets (see `docs/AGENTS.md`) |
| `fonts/` | Self-hosted Inter variable font (see `fonts/AGENTS.md`) |
| `freeapps-components/` | **Dead weight.** Never deployed (see `freeapps-components/AGENTS.md`) |
| `how-to/` | How-to guide pages (see `how-to/AGENTS.md`) |
| `js/` | `motion.js` — the sitewide progressive-enhancement layer (see `js/AGENTS.md`) |
| `reviews/` | 138 tool review pages + hub index (see `reviews/AGENTS.md`) |
| `scripts/` | Maintenance and generator scripts (see `scripts/AGENTS.md`) |
| `vs/` | Head-to-head comparison pages (see `vs/AGENTS.md`) |
| `MY-NOTES/` | Obsidian vault — **separate git repo, gitignored, no `AGENTS.md` written here.** See §0 |

Single-page route directories (`best-free-photo-graphic-design-tools-2026/`,
`free-ai-prompt-generator/`) hold one `index.html` each and have no `AGENTS.md`;
they follow the pillar-page rules in §3 and §5.

**These `AGENTS.md` files deploy.** `robots.txt` disallows `/*/AGENTS.md` so they are
not indexed. If you add a new one in a directory that is served, confirm the disallow
still covers it.

<!-- MANUAL: notes added below this line are preserved on regeneration -->
