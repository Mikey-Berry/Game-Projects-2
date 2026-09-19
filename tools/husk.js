#!/usr/bin/env node
/* THE SIGIL-BOUND DEAD, AND THE DOOR THAT WAS TAKEN OUT FROM UNDER THEM.
 *
 * There are three immortalities in this game. Two of them survive their own death: a lich
 * sheds a phylactery you carry to a Binding Circle, and a sigil-bound immortal sheds a HUSK
 * you carry to a Forge. `shedHusk` says so in as many words — "Carry it to a Forge and
 * re-etch them" — and `bearerNear`, which is what the Circle asks, goes out of its way to
 * REFUSE a husk (`!m.phyl.husk`), because the husk's road is the forge and not the circle.
 *
 * The forge's road was deleted. `reEtchHusk` is whole and correct and has exactly one
 * caller: `openCrafting`, the per-bench crafting modal that the work-order book replaced.
 * Nothing calls `openCrafting` any more. So the rite is reachable from nowhere, the circle
 * refuses them by design, and a sigil-bound immortal who dies is gone for good — while the
 * log line still tells the player to carry the husk to a forge.
 *
 * "An authored asset behind a condition that cannot be true is invisible in exactly the way
 * a missing asset is, and nothing logs" — the note beside the Soulbound rig. This is the
 * same failure with the condition removed entirely: there is no door, not even a shut one.
 *
 * So the assertions are about REACHABILITY, not arithmetic. The rite works; it is asked here
 * only to prove that what is broken is the way in. The claim that matters is
 * `andThereIsAWayToAskForIt`, and it is red on the build before the fix.
 *
 *   node tools/husk.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) {
        for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase();
      }
    };

    /* Open ground near the squad, by the same deterministic ring search the other harnesses
       use — `findOpenNear` throws sixty darts and moves whenever the RNG upstream does. */
    const home = player()[0];
    const open = (r0) => {
      for (let r = r0; r < r0 + 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.floor(home.x) + dx + 0.5, y = Math.floor(home.y) + dy + 0.5;
        if (!isBlocked(x, y, 0) && !isBlocked(x + 3, y + 3, 0) && !charsNear(x, y, 3).length) return { x, y };
      }
      return null;
    };
    const spot = open(8);
    if (!spot) { R.staging = '!! NO OPEN GROUND NEAR THE SQUAD'; return R; }

    const mk = (name, x, y) => {
      const c = makeChar(name, 'player', x, y, { atk: 5, def: 5, tough: 8, magic: 10, race: 'human', sub: 'dustborn' });
      c.state = 'ok'; c.hunger = 100; c.floor = 0; c.__probe = true; chars.push(c); return c;
    };

    /* ---------- 1. THE PREMISE: A SIGIL-BOUND DEATH LEAVES A HUSK ----------
       Asserted rather than assumed, because every claim below is about what you may do with
       the husk, and they would all pass vacuously if no husk were ever made. */
    let husk = null, bearer = null;
    guard(['thePremise'], () => {
      const imm = mk('Probe Sigil', spot.x, spot.y);
      ascendTransmute(imm);
      const phyl0 = phylacteries.length;
      const wasIn = chars.includes(imm);
      kill(imm, null);
      const made = phylacteries.slice(phyl0);
      husk = made.find(q => q.husk) || null;
      R.thePremise = (wasIn && husk && !chars.includes(imm))
        ? `a sigil-bound death sheds a husk: phylactery #${husk.id}, soul "${husk.soul.name}", and the body is off the roster`
        : `!! NO HUSK: ${made.length} phylacter(ies) made, husk=${!!husk}, body still on roster=${chars.includes(imm)}`;
    });
    if (!husk) { R.andThereIsAWayToAskForIt = '!! NO HUSK TO CARRY — nothing below could be asked'; return R; }

    /* Somebody picks it up. This is the same assignment `update` makes when a body reaches a
       phylactery it was sent to (`c.phyl = p; p.carried = true`). */
    guard(['andItCanBeCarried'], () => {
      bearer = mk('Probe Bearer', spot.x + 1, spot.y);
      bearer.phyl = husk; husk.carried = true;
      R.andItCanBeCarried = `${bearer.name} bears the husk`;
    });

    /* ---------- 2. THE CIRCLE REFUSES IT, AND THAT IS DELIBERATE ----------
       Pinned so that a "fix" which simply lets the Binding Circle swallow husks shows up
       here as a change rather than passing quietly. The husk's road is the forge. */
    guard(['andTheCircleRefusesIt'], () => {
      const circle = { x: Math.floor(bearer.x) - 1, y: Math.floor(bearer.y) - 1 };
      const taken = bearerNear(circle);
      R.andTheCircleRefusesIt = (taken === null)
        ? 'the Binding Circle will not take a husk — by design; `bearerNear` excludes them'
        : `!! THE CIRCLE TOOK A HUSK (${taken.name}) — the two roads have collapsed into one`;
    });

    /* ---------- 3. AND THE GAME TELLS THE PLAYER TO GO TO A FORGE ----------
       The promise, read off the source of `shedHusk` rather than off the log, so it is the
       instruction itself being pinned and not a line that happened to scroll past. */
    guard(['andTheGamePromisesAForge'], () => {
      const src = String(shedHusk);
      R.andTheGamePromisesAForge = /Forge/i.test(src)
        ? 'shedHusk tells the player: "Carry it to a Forge and re-etch them"'
        : '!! shedHusk NO LONGER NAMES A FORGE — the promise this harness tests has moved';
    });

    /* ---------- 4. THE RITE ITSELF IS SOUND ----------
       Done on a COPY of the staging so the real bearer still has the husk for the claim that
       matters. If this goes red the fix broke `reEtchHusk`, which was never the broken part. */
    guard(['andTheRiteItselfWorks'], () => {
      const bt = BUILD_TYPES.forge;
      if (!bt) { R.andTheRiteItselfWorks = '!! THERE IS NO FORGE IN THIS BUILD'; return; }
      const s2 = open(24);
      const imm2 = mk('Probe Sigil II', s2.x, s2.y);
      ascendTransmute(imm2);
      kill(imm2, null);
      const h2 = phylacteries.find(q => q.husk && q.soul.name === 'Probe Sigil II');
      const carrier2 = mk('Probe Bearer II', s2.x + 1, s2.y);
      carrier2.phyl = h2; h2.carried = true;
      const forge2 = { type: 'forge', x: Math.round(s2.x), y: Math.round(s2.y), w: bt.w, h: bt.h,
                       floor: 0, hp: 100, maxHp: 100, progress: 1, growth: 0, __probe: true };
      pBuilds.push(forge2);
      for (const k of Object.keys(HUSK_COST)) addItem(k, HUSK_COST[k] + 5);
      const n0 = chars.length;
      const ok = reEtchHusk(carrier2, forge2);
      const back = chars.find(c => c.name === 'Probe Sigil II' && c.state !== 'dead');
      if (back) back.__probe = true;
      R.andTheRiteItselfWorks = (ok && back && back.immortal === 'transmute' && chars.length > n0 && !carrier2.phyl)
        ? `the rite is whole: ${back.name} stands up sigil-bound again, husk spent`
        : `!! THE RITE FAILED: returned ${ok}, rebuilt=${!!back}, bearer still holds=${!!carrier2.phyl}`;
    });

    /* ---------- 5. AND THERE IS A WAY TO ASK FOR IT ----------
       THE CLAIM THIS FILE EXISTS FOR. A bearer with a husk, standing at a built forge, with
       the materials in the camp — exactly the state the game's own instruction describes.
       The question is only whether any screen the player can open offers the rite.

       Asked of the work-order book, because that is what replaced the per-bench modal and it
       is the one crafting screen a player can reach ([K], the WORK button, and the fallback
       in the right-click chain). Not asked of `openCrafting`: a panel with no caller is not a
       way to ask for anything, which is the whole finding. */
    guard(['andThereIsAWayToAskForIt'], () => {
      const bt = BUILD_TYPES.forge;
      if (!bt) { R.andThereIsAWayToAskForIt = '!! THERE IS NO FORGE IN THIS BUILD'; return; }
      const forge = { type: 'forge', x: Math.round(bearer.x), y: Math.round(bearer.y), w: bt.w, h: bt.h,
                      floor: 0, hp: 100, maxHp: 100, progress: 1, growth: 0, __probe: true };
      pBuilds.push(forge);
      bearer.x = forge.x + 1; bearer.y = forge.y + 1.5;
      for (const k of Object.keys(HUSK_COST)) addItem(k, HUSK_COST[k] + 5);

      openWorkshops();
      const rows = [...document.querySelectorAll('#modalbody .trow')].map(r => r.textContent);
      const btn = [...document.querySelectorAll('#modalbody button')]
        .find(x => /RE-ETCH/i.test(x.textContent));
      R.andThereIsAWayToAskForIt = btn
        ? `the work orders offer RE-ETCH for ${husk.soul.name} while the bearer stands at the forge`
        : '!! NO SCREEN THE PLAYER CAN OPEN OFFERS THE RE-ETCHING — the husk is a dead end and the log still says to carry it to a forge';

      /* and pressing it actually performs the rite, so the button is not decoration */
      if (btn) {
        const n0 = chars.length;
        btn.click();
        const back = chars.find(c => c.name === husk.soul.name && c.state !== 'dead');
        if (back) back.__probe = true;
        R.andPressingItRebuildsThem = (back && chars.length > n0 && !bearer.phyl)
          ? `${back.name} is re-etched — sigil-bound, ${Math.round(back.blood)} blood, and the husk is spent`
          : `!! THE BUTTON DID NOTHING: rebuilt=${!!back}, bearer still holds=${!!bearer.phyl}`;
      } else {
        R.andPressingItRebuildsThem = '!! NO BUTTON TO PRESS';
      }
    });

    /* ---------- 6. NEGATIVE CONTROLS ----------
       Two of them, because an offer that is always present is the same bug the other way and
       would pass claim 5 for entirely the wrong reason. */
    guard(['andNotWithoutABearer', 'andNotWithoutAForge'], () => {
      const bt = BUILD_TYPES.forge;
      if (!bt) { R.andNotWithoutABearer = R.andNotWithoutAForge = '!! NO FORGE IN THIS BUILD'; return; }

      /* (a) a forge, materials, and nobody carrying a husk */
      for (const c of chars) if (c.phyl && c.phyl.husk) { c.phyl.carried = false; c.phyl = null; }
      openWorkshops();
      const noBearer = [...document.querySelectorAll('#modalbody button')].some(x => /RE-ETCH/i.test(x.textContent));
      R.andNotWithoutABearer = !noBearer
        ? 'no husk on anybody\'s back, no offer'
        : '!! THE WORK ORDERS OFFER A RE-ETCHING WITH NO HUSK IN THE WORLD';

      /* (b) a bearer with a husk, and every forge taken away */
      const s3 = open(40);
      const imm3 = mk('Probe Sigil III', s3.x, s3.y);
      ascendTransmute(imm3);
      kill(imm3, null);
      const h3 = phylacteries.find(q => q.husk && q.soul.name === 'Probe Sigil III');
      const carrier3 = mk('Probe Bearer III', s3.x + 1, s3.y);
      carrier3.phyl = h3; h3.carried = true;
      const kept = pBuilds.filter(x => x.type === 'forge');
      for (const f of kept) { const i = pBuilds.indexOf(f); if (i >= 0) pBuilds.splice(i, 1); }
      openWorkshops();
      const noForge = [...document.querySelectorAll('#modalbody button')].some(x => /RE-ETCH/i.test(x.textContent));
      for (const f of kept) pBuilds.push(f);
      R.andNotWithoutAForge = !noForge
        ? 'a husk with no forge standing, no offer'
        : '!! THE WORK ORDERS OFFER A RE-ETCHING WITH NO FORGE BUILT';
    });

    /* clean up after ourselves so a later harness in the same page is not surprised */
    $('modal').style.display = 'none'; modalOpen = false;
    for (const c of chars) if (c.__probe) c.state = 'gone';
    for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE SIGIL-BOUND DEAD HAVE NOWHERE TO GO (${bad.length + errs.length})`
    : 'A HUSK IS A ROAD HOME AGAIN');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
