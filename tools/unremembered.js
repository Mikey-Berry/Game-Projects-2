#!/usr/bin/env node
/* THE UNREMEMBERED, AT FULL.
 *
 * "The Unremembered is the weakest of the Old King's court -- thematically and visually. Rework
 *  him from the ground up to better do justice to the Dust Arts." Rebuilt 2026-09-29, the name
 *  kept. Every Dust art the player has is a degraded copy of one he does whole:
 *
 *   1. the body: masked, with the redaction bar; black bars drifting across him; a band of the
 *      chest gone; a forearm floating past its sleeve; the ledger; falling dust; and copies of
 *      him left standing on the path behind, which settle back into him when he stops
 *   2. a wall that was never there: in a fight, 5 to 7 tiles across the ground behind whoever he
 *      is fighting, real to feet and arrows, and gone after DUST_WALL_S
 *   3. his Unwalled: at half blood he is four, the copies' blades cut, and a struck copy is dust
 *   4. his Loyalty: one of yours forgets whose side they are on for 8 s, always; then remembers
 *   5. his Veil: gone, and somewhere else, and whoever was fighting him has lost him
 *   6. the old king, while he stands, inherits the walls and nothing else
 *   7. dead: the copies go with him, "Something was killed on the salt flats", and a leaf of his
 *      ledger, which read gives a Dust III caster the wall
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/unremembered.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => { try { return player().length > 0; } catch (e) { return false; } }, null, { timeout: 180000, polling: 1000 });
  await p.waitForTimeout(1500);

  /* staged on open waste, the squad three tiles off him */
  await p.evaluate(() => {
    paused = true; hour = 14;
    let q = null;
    for (let t = 0; t < 600 && !q; t++) {
      const x = 80 + ((t * 977) % (W - 160)), y = 80 + ((t * 613) % (H - 160));
      if (nearestTownDist(x, y) > 80 && craterD(x, y) > 260 && !biomeAt(x, y) && [0, 4, 8, -4, -8].every(dx => !isBlocked(x + dx, y) && !isBlocked(x + dx, y + 3))) q = { x, y };
    }
    for (const c of chars) if (c.faction !== 'player' && c.state !== 'dead' && dist(c.x, c.y, q.x, q.y) < 50) c.x += 400;
    const u = spawnCourtier('unremembered', q.x, q.y);
    player().forEach((c, i) => { c.x = q.x - 1 + i; c.y = q.y + 3; c.floor = 0; c.moveTarget = null; c.stats.def = 60; c.blood = c.maxBlood = 400; });
    rebuildCharGrid(); computeVision();
    camX = camSX = q.x; camY = camSY = q.y + 2; camDist = camDistTarget = 12;
    window.__u = u; window.__q = q;
  });
  /* walk him two tiles so the path behind him has something on it */
  for (let i = 0; i < 12; i++) await p.evaluate(() => new Promise(r => { window.__u.x += 0.2; syncChars(1 / 60); requestAnimationFrame(() => r()); }));

  const out = await p.evaluate(() => {
    const R = {};
    const u = window.__u, us = player(), me = us[0];

    /* ---- 1. the body ---- */
    {
      const e = charMeshes.get(u.id);
      const kinds = {};
      for (const j of (e && e.jitter) || []) kinds[j.userData.kind || 'jit'] = (kinds[j.userData.kind || 'jit'] || 0) + 1;
      e._movedAt = Date.now() + 60000;
      syncChars(1 / 60);
      const trail = e.jitter.filter(j => j.userData.kind === 'trail').map(j => Math.hypot(j.position.x, j.position.z));
      const behind = trail.length === 3 && trail[0] > 0.3 && trail[2] > trail[0];
      e._movedAt = Date.now() - 60000; syncChars(1 / 60);
      const settled = e.jitter.filter(j => j.userData.kind === 'trail').every(j => Math.hypot(j.position.x, j.position.z) < 0.2);
      R.theBody = kinds.bar >= 5 && kinds.dust >= 8 && kinds.hover === 1 && behind && settled
        ? `drawn with ${kinds.bar} drifting bars, ${kinds.dust} motes of falling dust and a forearm hanging past its sleeve; walking, his copies stand ${trail.map(d => d.toFixed(1)).join(', ')} tiles back on his path, and stopped they settle back into him`
        : `!! THE BODY: ${JSON.stringify(kinds)}, trail ${trail.map(d => d.toFixed(2))}, settled ${settled}`;
    }

    /* ---- 2. the wall ---- */
    {
      dustWallsClear();
      u.target = me; u._wallT = 1; u._veilStepT = 99; u._loyalT = 99;
      dustAtFull(u);
      const w = dustWalls[0];
      const real = w && w.keys.every(k => { const [x, y] = [k % 100000, 0]; return blocked.has(k); });
      const behindMe = w && (() => { const m = w.meshes[Math.floor(w.meshes.length / 2)]; return dist(m.position.x, m.position.z, u.x, u.y) > dist(me.x, me.y, u.x, u.y); })();
      /* an arrow will not go through it */
      const m0 = w && w.meshes[Math.floor(w.meshes.length / 2)];
      const los = m0 ? losBlocked(me.x, me.y, m0.position.x + (m0.position.x - me.x), m0.position.z + (m0.position.z - me.y), 0) : false;
      const n = w ? w.keys.length : 0;
      dustWallTick(DUST_WALL_S + 0.1);
      const gone = !dustWalls.length && w && w.keys.length === 0;
      R.theWall = n >= 5 && n <= 7 && real && behindMe && los && gone
        ? `in a fight he raises a wall of ${n} tiles behind whoever he is fighting; it blocks the ground and the line of sight, and after ${DUST_WALL_S} s it is gone`
        : `!! THE WALL: ${n} tiles, real ${real}, behind the target ${behindMe}, blocks sight ${los}, gone ${gone}`;
    }

    /* ---- 3. his Unwalled ---- */
    {
      u.blood = u.maxBlood * 0.45; u.dustSplit = false;
      const x0 = u.x, y0 = u.y;
      dustAtFull(u);
      const copies = chars.filter(o => o.dustCopy && o.state !== 'dead');
      const swapped = dist(u.x, u.y, x0, y0) > 0.5;
      const v = us[1] || us[0];
      const hp0 = Object.values(v.parts).reduce((a, q) => a + q.hp, 0);
      for (let i = 0; i < 16; i++) attack(copies[0], v);
      const cut = Object.values(v.parts).reduce((a, q) => a + q.hp, 0) < hp0;
      applyDamage(me, copies[1], 'chest', 3, 'cut', true);
      const dust = !chars.includes(copies[1]);
      R.hisUnwalled = copies.length === 3 && swapped && cut && dust
        ? 'at half blood he is four and has traded places with one of them; their blades cut, and a copy that is struck is dust'
        : `!! HIS UNWALLED: ${copies.length} copies, swapped ${swapped}, cut ${cut}, struck-to-dust ${dust}`;
    }

    /* ---- 4. his Loyalty ---- */
    {
      u._loyalT = 1;
      dustAtFull(u);
      const c = chars.find(o => o.charmed && o.charmed.by === u);
      const turned = c && c.faction !== 'player' && hostile(c, me === c ? us[1] : me);
      if (c) { c.charmed.t = 0.01; c.state = 'ok'; paused = false; update(0.05); paused = true; }
      const back = c && c.faction === 'player' && !c.charmed && !c.provoked;
      R.hisLoyalty = turned && back
        ? `${c.name} forgets whose side they are on for 8 s, every time, and then remembers, without a grudge`
        : `!! HIS LOYALTY: charmed ${!!c}, turned ${turned}, came back ${back}`;
    }

    /* ---- 5. his Veil ---- */
    {
      const x0 = u.x, y0 = u.y;
      me.target = u; u._veilStepT = 1;
      dustAtFull(u);
      R.hisVeil = dist(u.x, u.y, x0, y0) > 4 && u.veilT > 0 && me.target !== u
        ? `he goes, and is ${dist(u.x, u.y, x0, y0).toFixed(1)} tiles away, and whoever was fighting him has lost him`
        : `!! HIS VEIL: moved ${dist(u.x, u.y, x0, y0).toFixed(1)}, veil ${u.veilT}, still targeted ${me.target === u}`;
    }

    /* ---- 6. the king's inheritance ---- */
    {
      dustWallsClear();
      const k = makeChar('The Old King', 'gaunt', u.x + 6, u.y, {}); k.bossKey = 'oldking'; k.courtArts = ['dust']; chars.push(k);
      k.target = me; k._wallT = 1; k._veilStepT = 1; k._loyalT = 1; k.blood = 1; k.maxBlood = 100;
      const kx = k.x, charmed0 = chars.filter(o => o.charmed).length;
      dustAtFull(k);
      const walls = dustWalls.length > 0, stepped = k.x !== kx, charmed = chars.filter(o => o.charmed).length > charmed0, split = chars.filter(o => o.dustCopy).length;
      chars.splice(chars.indexOf(k), 1); dustWallsClear();
      R.theKingInheritsTheWalls = walls && !stepped && !charmed && !k.dustSplit
        ? 'the old king, carrying the Unremembered\'s art, raises the walls and does nothing else of his'
        : `!! THE KING: walls ${walls}, veil-stepped ${stepped}, charmed ${charmed}, split ${!!k.dustSplit}`;
    }

    /* ---- 7. dead ---- */
    {
      const heard = []; const lg = window.log; window.log = (m, c2) => { heard.push(String(m)); return lg(m, c2); };
      kill(u, me);
      window.log = lg;
      const copiesLeft = chars.filter(o => o.dustCopy && o.state !== 'dead').length;
      const said = heard.some(m => /Something was killed on the salt flats/.test(m));
      /* the leaf, read, gives a Dust III caster the wall */
      delete research.done.dust_wall;
      const c = me; c.gift = 'dust'; c.att = { divine: 0, destruction: 0, dark: 0, dust: 3 }; c.stats.magic = 30; c.mana = 99; c.castCd = 0;
      readBook(c, 'sch_wall');
      const learned = !!research.done.dust_wall;
      const tx = c.x + 4, ty = c.y;
      resolveCastAt(c, 'dustwall', tx, ty);
      const w = dustWalls[dustWalls.length - 1];
      R.whenHeDies = copiesLeft === 0 && said && u.dropItems.sch_wall === 1 && learned && w && w.keys.length >= 3
        ? `dead, his copies go with him, the log says only that something was killed on the salt flats, and he drops a leaf of his ledger: read, it gives a Dust III caster the wall (${w.keys.length} tiles)`
        : `!! DEAD: copies left ${copiesLeft}, said ${said}, leaf ${u.dropItems && u.dropItems.sch_wall}, learned ${learned}, cast wall ${w ? w.keys.length : 0}`;
      dustWallsClear();
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(24) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE UNREMEMBERED IS WRONG (${bad.length + errs.length}) ***` : 'NOBODY WHO WAS THERE CAN SAY WHAT IT WAS');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
