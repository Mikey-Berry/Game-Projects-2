#!/usr/bin/env node
/* THE LORE SEAMS, CLOSED ONE AT A TIME.
 *
 * LORE-SEAMS.md lists the places where the lore says something and the game has no equivalent.
 * Each claim here is one seam that has been closed, staged the way a player would meet it and
 * measured on the running game, and each was red on the build before the fix.
 *
 *   1. every kind of body with authored barks says one when somebody is near enough to hear
 *      (53 lines were set on bodies and never spoken)
 *   2. the small ones stand: an Eye of Ainzopha'ar (22 blood), a Shoalling (18) and a Marrow Tick
 *      (40) are up when made, go down when bled, and get back up. The down and rise lines were
 *      absolute (40 and 50 blood), so the first two lay on the ground from their first tick
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/seams.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const step = (secs, dt = 0.25) => { for (let i = 0; i < secs / dt; i++) update(dt); };

    /* ---- 1. the barks are said ---- */
    {
      /* one of every kind that owns lines: whatever the world already holds (the garrison, the
         immortals, the Archivist, the Kept, the thing in the rock), plus one of each GAUNTS row
         with a `bark:`, because gaunts are made at night and this is the first morning */
      const kindOf = (c) => c.gauntKind || c.deepKin || (c.redoubtId != null ? 'garrison' : null) || c.name;
      const pickOne = new Map();
      for (const c of chars) if (c.state === 'ok' && c.barks && c.barks.length && !pickOne.has(kindOf(c))) pickOne.set(kindOf(c), c);
      const me = player()[0];
      for (const [k, g] of Object.entries(GAUNTS)) {
        if (!g.bark || pickOne.has(k)) continue;
        const q = findOpenNear(Math.round(me.x) + 30, Math.round(me.y) + 30, 10);
        const c = spawnGaunt(k, q.x, q.y);
        if (c) { c.__probe = true; c.nightborn = false; pickOne.set(k, c); }
      }
      const kinds = [...pickOne.keys()];
      const silent = [], said = [];
      for (const [k, c] of pickOne) {
        /* a listener at arm's length, on the speaker's own storey; and nothing else talking */
        const ear = makeChar('Listener', 'player', c.x + 2, c.y, { atk: 1, def: 40, tough: 90 });
        ear.floor = c.floor || 0; ear.__probe = true; ear.noFight = true; chars.push(ear);
        for (const o of chars) o.bubble = null;
        /* ONE VOICE AT A TIME, BY DESIGN. Only one ambient line may be said anywhere every five
           seconds, so a Kept congregation, or a Maw on the same storey, speaking first is the
           limiter working, not the one under test failing. Hush the rest for the window. */
        const hush = chars.filter(o => o !== c && o.barks && o.barks.length);
        for (const o of hush) { o._cdWas = o.barkCd; o.barkCd = 1e9; }
        c.barkCd = 0; c.target = null;
        if (typeof _ambientBarkT !== 'undefined') _ambientBarkT = 0;   /* absent on the build before */
        let heard = null;
        for (let i = 0; i < 12 && !heard; i++) {
          step(0.25);
          if (c.bubble && c.barks.includes(c.bubble.text)) heard = c.bubble.text;
          c.x = ear.x - 2; c.y = ear.y;                                  /* hold it in earshot */
        }
        (heard ? said : silent).push(heard ? `${k}: "${heard}"` : k);
        for (const o of hush) { o.barkCd = o._cdWas; delete o._cdWas; }
        chars.splice(chars.indexOf(ear), 1);
      }
      R.theBarksAreSaid = !kinds.length ? '!! NOTHING IN THE WORLD OWNS A BARK TO TEST WITH'
        : !silent.length
          ? `all ${kinds.length} kinds with authored lines say one when somebody is near: ${said.slice(0, 4).join(' · ')}${said.length > 4 ? ' …' : ''}`
          : `!! ${silent.length} OF ${kinds.length} KINDS OWN LINES AND NEVER SAY ONE: ${silent.join(', ')}`;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    }
    /* ---- 2. the small ones stand ---- */
    {
      const me = player()[0];
      const at = (dx) => findOpenNear(Math.round(me.x) + 40 + dx, Math.round(me.y) + 20, 8);
      const q1 = at(0), q2 = at(6), q3 = at(12);
      const eye = spawnGaunt('eye', q1.x, q1.y); eye.nightborn = false;
      const shoal = (() => { const n0 = chars.length; spawnShoal(q2.x, q2.y, 0); return chars.slice(n0); })();
      const sh = shoal[0];
      const tick = makeChar('Marrow Tick', 'wild', q3.x, q3.y, {atk:14, def:20, tough:6, ath:16});
      tick.beast = true; tick.big = 0.62; tick.kin = 'tick'; tick.blood = 40; tick.maxBlood = 40; chars.push(tick);
      const trio = [['an Eye', eye], ['a Shoalling', sh], ['a Marrow Tick', tick]];
      for (const [, c] of trio) c.__probe = true;
      for (const c of shoal) c.__probe = true;
      step(1);
      const up0 = trio.filter(([, c]) => c.state !== 'ok').map(([n, c]) => `${n} (${c.maxBlood} blood) is ${c.state}`);
      /* bled under 40% of its own pool, then brought back over half of it */
      const fell = [], rose = [];
      for (const [n, c] of trio) {
        c.blood = c.maxBlood * 0.3; updateState(c);
        if (c.state !== 'down') fell.push(`${n} did not go down at 30% (${c.state})`);
        c.blood = c.maxBlood * 0.9; updateState(c);
        if (c.state !== 'ok') rose.push(`${n} did not get up at 90% (${c.state})`);
      }
      R.theSmallOnesStand = up0.length ? `!! ${up0.join('; ').toUpperCase()} ON ITS FIRST TICK`
        : fell.length || rose.length ? `!! ${[...fell, ...rose].join('; ').toUpperCase()}`
        : `an Eye (22 blood), a Shoalling (18) and a Marrow Tick (40) stand when made, go down when bled under 40% of themselves, and get back up past half`;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(24) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  const which = Object.keys(out).filter(k => typeof out[k] === 'string' && out[k].startsWith('!!'));
  console.log(bad.length || errs.length ? `*** A SEAM IS OPEN AGAIN (${bad.length + errs.length}): ${[...which, ...errs.map(() => 'pageerror')].join(', ')} ***`
                                        : 'THE CLOSED SEAMS STAY CLOSED');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
