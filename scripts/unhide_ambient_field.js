#!/usr/bin/env node
/**
 * unhide_ambient_field.js
 *
 * Removes the opaque `background` / `background-color` declaration from the `body` rule of the
 * pages that still carry their own inline CSS, so the ambient field can be
 * seen on them.
 *
 * Why this is needed: .fx-field — the layer motion.js injects, carrying the
 * grid, aurora, scan sweep and the constellation canvas — sits at z-index:-1.
 * In CSS paint order, negative z-index descendants are painted BEFORE the
 * backgrounds of block-level in-flow descendants, so any opaque background on
 * body covers the whole layer. site.css already moved the page background onto
 * html for this reason; these pages then re-apply it on body in their own
 * block and hide the field again.
 *
 * The removal is visually a no-op: every declaration removed here resolves to
 * the same colour that html already paints (--bg aliases --bg-base, and the
 * literals are #0A0A0B, which is --bg-base). Only the *painter* changes.
 *
 * Contract (AGENTS.md "Writing scripts"):
 *   - dry-run by default; writes only with --apply
 *   - prints exactly what changed, per file
 *   - idempotent: a second run is a no-op
 *   - ends with a verification that reports a number capable of being non-zero
 *
 * Usage:
 *   node scripts/unhide_ambient_field.js            # preview
 *   node scripts/unhide_ambient_field.js --apply    # write
 */

'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', '_next', 'freeapps-components', 'node_modules', '.github', 'docs']);

/** 404.html carries the Next.js error styling and is out of scope everywhere. */
const EXCLUDE = new Set(['404.html']);

/**
 * Only these exact values are removed. Each is --bg-base by another name, so
 * html already paints the identical colour. Anything else is left alone and
 * reported, because a body background that is NOT the page colour is a
 * deliberate design choice this script must not silently discard.
 */
const REMOVABLE = new Set(['var(--bg)', '#0a0a0b', '#0A0A0B', 'var(--bg-base)']);

const BODY_RULE = /(^|[^-\w])body\s*\{([^}]*)\}/g;
const BG_DECL = /(^|;)\s*background(?:-color)?\s*:\s*([^;}]+?)\s*(?=;|$)/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.html')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function textOf(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const files = walk(ROOT).sort();

let changed = 0;
let removed = 0;
const kept = [];
const textMismatch = [];

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (EXCLUDE.has(rel)) continue;

  const original = fs.readFileSync(file, 'utf8');
  let hits = 0;

  const updated = original.replace(BODY_RULE, (full, lead, body) => {
    const m = body.match(BG_DECL);
    if (!m) return full;
    const value = m[2].trim();
    if (!REMOVABLE.has(value) && !REMOVABLE.has(value.toLowerCase())) {
      kept.push(`${rel}  —  body background is ${value}, left alone`);
      return full;
    }
    hits++;
    const cleaned = body.replace(BG_DECL, (d, sep) => (sep === ';' ? ';' : ''));
    return `${lead}body{${cleaned}}`;
  });

  if (!hits || updated === original) continue;

  if (textOf(original) !== textOf(updated)) { textMismatch.push(rel); continue; }

  console.log(`${APPLY ? 'wrote  ' : 'would  '} ${rel}  —  removed ${hits} body background declaration(s)`);
  if (APPLY) fs.writeFileSync(file, updated, 'utf8');
  changed++;
  removed += hits;
}

console.log('');
console.log(`HTML files scanned .................. ${files.length}`);
console.log(`${APPLY ? 'Files changed' : 'Files that would change'} ............. ${changed}`);
console.log(`Declarations removed ................ ${removed}`);
if (kept.length) {
  console.log('');
  console.log('Left alone (body background is not the page colour):');
  kept.forEach((k) => console.log(`  ${k}`));
}

// Verification: no page that loads the shared stylesheet may still paint an
// opaque page-coloured background on body.
if (APPLY) {
  let leftover = 0;
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (EXCLUDE.has(rel)) continue;
    const s = fs.readFileSync(file, 'utf8');
    if (!s.includes('/css/site.css')) continue;
    let m;
    const re = new RegExp(BODY_RULE.source, 'g');
    while ((m = re.exec(s)) !== null) {
      const d = m[2].match(BG_DECL);
      if (d && REMOVABLE.has(d[2].trim())) leftover++;
    }
  }
  console.log(`Pages still hiding the field ........ ${leftover}`);
  if (leftover !== 0) {
    console.error('FAIL: an opaque body background survived.');
    process.exit(1);
  }
}
