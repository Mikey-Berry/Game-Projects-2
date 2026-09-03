#!/usr/bin/env node
/* THE SUITE RUNNER.
 *
 * `npm run check` was a single `&&` chain: thirty-six harnesses, one at a time, on a
 * four-core box. Measured before writing this:
 *
 *   · ~11.6s of every harness is startup before a single assertion runs — 6.5s to parse and
 *     load the 1.82 MB game file, then ~5.1s for worldgen and the start click. Across the
 *     whole chain that is about seven minutes of pure booting.
 *   · roads.js is 233s on its own, world.js 77s, and most of the rest are 15-25s of which
 *     only three to ten seconds is actual testing.
 *
 * So the dominant cost is per-process startup, which is embarrassingly parallel: the
 * harnesses are separate processes reading one read-only `game.html` and sharing nothing.
 * Measured on four of them: 102.2s serial, 61.1s at four-way, all four still passing.
 *
 * AND `--jobs` DOES NOT WORK YET. That was the point of building this, and the measurement
 * said no. A four-harness sample ran clean (102.2s serial, 61.1s at four-way, all passing),
 * so the whole suite was tried at four-way — and FOUR harnesses went red that pass serially:
 *
 *     carry.js, wanderers.js, kit.js, races.js
 *
 * `races.js` fails with "golem/clay BUILT NO BODY", which is a mesh that did not finish
 * building inside the window the probe allowed. None of them is a real defect; all of them
 * are the same class this repo has already been bitten by three times — a probe measuring
 * something the game is allowed to move, green alone and red under load. Concurrency makes
 * that class more likely, not less.
 *
 * So there is no `npm run check:par`. The flag stays here because it is how the next person
 * re-measures after fixing those four, and the four names are written down so they do not
 * have to find them again. Until then the serial chain is what a push is judged on.
 *
 *   node tools/run.js                 all harnesses, serially (what `npm run check` does)
 *   node tools/run.js --fast          the broad-coverage subset, for the edit loop
 *   node tools/run.js --only a.js,b.js
 *   node tools/run.js --jobs 4        UNRELIABLE — see above
 */
const { spawn } = require('child_process');
const path = require('path');

/* Every harness in the suite, in the order the serial chain runs them. `prep.js` is not here:
   it rewrites game.html and must finish before anything reads it. */
const ALL = [
  'boot.js', 'origin.js', 'sister.js', 'hire.js', 'nights.js', 'focus.js', 'standoff.js', 'ironworks.js', 'muster.js', 'stumps.js', 'queue.js', 'charnelworks.js', 'haulers.js', 'scholars.js', 'orders.js', 'tears.js', 'vessels.js', 'sixfold.js', 'watchrigs.js', 'volley.js', 'towncheck.js', 'fight.js', 'roundtrip.js', 'save.js', 'walls.js',
  'world.js', 'host.js', 'raise.js', 'hosts.js', 'kitrot.js', 'craftwork.js', 'bound.js', 'anchored.js', 'descend.js', 'cave.js', 'deepaim.js', 'under.js', 'opaque.js', 'guns.js', 'arrow.js', 'gunnery.js', 'roads.js', 'aid.js',
  'reach.js', 'ceiling.js', 'study.js', 'carry.js', 'jail.js', 'mishap.js', 'command.js', 'menus.js', 'rightclick.js', 'cloak.js', 'sundered.js', 'charm.js', 'unstuck.js', 'clicks.js', 'rites.js', 'notes.js', 'discourse.js', 'tongue.js', 'parley.js', 'board.js', 'chores.js', 'trades.js', 'charnel.js', 'cloth.js',
  'threads.js', 'beasts.js', 'wyrm.js', 'curse.js', 'siege.js', 'guild.js', 'purge.js', 'watchers.js', 'lieu.js', 'wanderers.js', 'survive.js', 'melee.js', 'press.js', 'patrol.js', 'pace.js', 'spiral.js', 'flank.js', 'kiting.js', 'lich.js', 'voices.js', 'pain.js', 'heads.js',
  'kit.js', 'wepsoak.js', 'races.js', 'names.js', 'kin.js', 'kin2.js', 'livery.js', 'mimics.js', 'pins.js', 'mobile.js', 'start.js', 'touch.js', 'terrain.js', 'axes.js',
  'civics.js',
];
/* THE EDIT LOOP SET. Not "the fast ones" — the ones that would notice a broken build at all:
   the boot check, a save round trip, a fight, and the two broadest world probes. Cheap enough
   to run after every edit, and if one of these is red nothing else is worth running. */
const FAST = ['boot.js', 'save.js', 'roundtrip.js', 'fight.js', 'towncheck.js', 'races.js'];

const args = process.argv.slice(2);
const jobs = Math.max(1, parseInt((args.find(a => a.startsWith('--jobs')) || '').split(/[= ]/)[1]
  || (args.includes('--jobs') ? args[args.indexOf('--jobs') + 1] : '1'), 10) || 1);
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
const list = only ? only.split(',').map(s => s.trim()).filter(Boolean)
  : args.includes('--fast') ? FAST : ALL;

const run = (file) => new Promise((resolve) => {
  const t0 = Date.now();
  /* origin.js takes a mode argument in the serial chain; keep it identical here */
  const extra = file === 'origin.js' ? ['game.html', 'all'] : [];
  const ch = spawn(process.execPath, [path.join(__dirname, file), ...extra], {
    cwd: path.join(__dirname, '..'), env: process.env,
  });
  let out = '';
  ch.stdout.on('data', d => { out += d; });
  ch.stderr.on('data', d => { out += d; });
  ch.on('close', code => resolve({ file, code, ms: Date.now() - t0, out }));
});

(async () => {
  const t0 = Date.now();
  const results = [];
  const queue = [...list];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      const r = await run(f);
      results.push(r);
      /* Print as each finishes rather than buffering to the end: on a fifteen-minute run you
         want to see the red one when it happens, not afterwards. Order is by completion under
         --jobs, which is why the file name leads every line. */
      process.stdout.write(`\n${r.code ? '✗' : '✓'} ${r.file} (${(r.ms / 1000).toFixed(1)}s)\n`);
      if (r.code) process.stdout.write(r.out.split('\n').filter(l => l.startsWith('***') || l.startsWith('!!')).join('\n') + '\n');
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, worker));
  const failed = results.filter(r => r.code);
  const total = (Date.now() - t0) / 1000;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${results.length - failed.length}/${results.length} harnesses passed in ${total.toFixed(1)}s` +
              (jobs > 1 ? ` (${jobs} at a time)` : ''));
  /* the three slowest, so the next person to ask "why is this slow" has the answer in front
     of them rather than having to measure it again */
  const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3)
    .map(r => `${r.file} ${(r.ms / 1000).toFixed(0)}s`).join(', ');
  console.log(`slowest: ${slow}`);
  if (failed.length) console.log(`FAILED: ${failed.map(r => r.file).join(', ')}`);
  process.exitCode = failed.length ? 1 : 0;
})();
