<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-27 | Updated: 2026-08-27 -->

# .github/workflows

## Purpose

GitHub Actions definitions: two PR gates, the Cloudflare Pages deploy, and a scheduled
curation job.

## Key Files

| File | Description |
|------|-------------|
| `compliance.yml` | Runs `python3 .github/scripts/compliance.py .` on every PR and on dispatch. **Required** by branch protection. |
| `content-quality.yml` | Runs `python3 .github/scripts/content_quality.py .` on every PR and on dispatch. **Advisory** — reports, does not block. |
| `deploy.yml` | `wrangler pages deploy . --project-name=qutaifan-website`, then pings IndexNow. **Required** by branch protection. |
| `hermes_curator.yml` | Nightly (`0 0 * * *`) plus dispatch. Runs `scripts/hermes_curator.js`, then `npm ci && npm run lint && npm run build` inside `freeapps-components/`. |

## For AI Agents

### Working In This Directory

- **`python3` is correct here.** Runners are Ubuntu. Locally you must use `python`
  (Windows Store shim). Do not reconcile the two.
- **`deploy.yml` is deliberately gated on `if: github.event_name == 'push'`.** It is
  triggered by both `push: [main]` and `pull_request`, but both real steps are skipped
  on PRs. That is what lets `deploy` be a *required* check on PRs without permanently
  blocking merges — a required check that only ran on `push` would never report on a
  `pull_request` event at all. Do not "simplify" this by removing the `pull_request`
  trigger or the `if` guard; either change locks the repo.
- The IndexNow step is intentionally non-fatal (`|| true`). A failed search-engine ping
  must never fail a deploy.
- The IndexNow key `f04b2b2b0e4ad248b406267e36386c55` is also the filename of the
  verification `.txt` at the repo root. Changing one without the other breaks the ping.
- Secrets used: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Never echo them.
- **`hermes_curator.yml` builds `freeapps-components/`, which is otherwise dead weight.**
  This is the only thing keeping that scaffold's toolchain alive. If that directory is
  ever removed, this workflow must be updated in the same change or the nightly job
  starts failing.

### Testing Requirements

There is no local runner here. Validate by opening a PR and reading the check results —
never by pushing to `main`, which is protected anyway.

### Common Patterns

Every workflow: `actions/checkout@v4` first, pin action versions, `workflow_dispatch`
alongside the real trigger so a run can be forced by hand.

## Dependencies

### Internal

- `../scripts/compliance.py`, `../scripts/content_quality.py`
- `../../scripts/hermes_curator.js`
- `../../freeapps-components/package.json`
- `../../sitemap.xml` (read by the IndexNow step)

### External

- Cloudflare Pages project `qutaifan-website`
- IndexNow API (`api.indexnow.org`)

<!-- MANUAL: notes added below this line are preserved on regeneration -->

2026-09-18 publication update: deploy.yml runs both gates on the full source tree,
then stages `.public-site` with `.github/scripts/stage_public_site.py`. Only that
artifact is deployed. Unfinished manuscripts stay versioned but are not public
site assets. The PR deploy check validates the exact artifact without deploying it.
