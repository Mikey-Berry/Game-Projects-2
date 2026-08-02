#!/usr/bin/env node
/* Build the test copy of the game.
 *
 * The harnesses drive the real file, but they cannot use the CDN <script> tag: the pages are
 * loaded over file:// and the sandbox they run in has no outbound network. So the three.js
 * URL is swapped for a local copy and the result is written to tools/game.html, which is
 * gitignored and disposable.
 *
 * Also checks for the one corruption that has actually bitten this file before: a stray NUL
 * byte written in by a bad edit. The source has never legitimately contained one.
 *
 *   node tools/prep.js                 -> tools/game.html from the working tree
 *   node tools/prep.js HEAD~1 prev     -> tools/prev.html from a git revision, for A/B runs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = 'dustward3d_hd.html';
const root = path.join(__dirname, '..');
const rev = process.argv[2];
const out = path.join(__dirname, (process.argv[3] || 'game') + '.html');

let src;
if (rev) {
  src = execFileSync('git', ['show', `${rev}:${SRC}`], { cwd: root, maxBuffer: 64 << 20 }).toString();
} else {
  src = fs.readFileSync(path.join(root, SRC), 'utf8');
}

const nuls = (src.match(/\0/g) || []).length;
if (nuls) {
  console.error(`REFUSING: ${nuls} NUL byte(s) in ${SRC}. Something wrote binary into the source.`);
  process.exit(1);
}

const three = path.join(__dirname, 'three.min.js');
if (!fs.existsSync(three)) {
  console.error(
    'tools/three.min.js is missing. It is deliberately not committed (600KB of vendored library).\n' +
    'Fetch the r128 build the game pins:\n' +
    '  curl -Lo tools/three.min.js https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
  process.exit(1);
}

const swapped = src.replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/[^"']+/g, 'three.min.js');
if (swapped === src) console.warn('warning: no three.js CDN URL found to swap — has the tag changed?');

fs.writeFileSync(out, swapped);

/* a syntax check on the main script block, which is most of the file */
const blocks = [...swapped.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const big = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
try {
  new (require('vm').Script)(big, { filename: SRC });
} catch (e) {
  console.error('SYNTAX ERROR in the main script block:', e.message);
  process.exit(1);
}

console.log(`${path.basename(out)} written — ${(swapped.length / 1024).toFixed(0)} KB, syntax OK, 0 NULs`);
