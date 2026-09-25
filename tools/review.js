#!/usr/bin/env node
/* THE 2026-09-24 REVIEW, CHECKED IN PLAY.
 *
 * Each line is one bug the line-by-line review found, set up the way a player would meet it
 * and measured on the running game. Every one of them was reproduced on the unfixed build
 * first (CODE-AUDIT.md says what each read before the fix).
 *
 *   1. quadrupeds were drawn at world z = 0 (the map's north edge) instead of where they stand
 *   2. a built wayline could not be opened (right-click walked the party onto it)
 *   3. host upkeep ignored remains kept in a Reliquary, and let a body come apart
 *   4. the Binding Circle said "Missing materials." with the materials in a Reliquary
 *   5. the wagon's EAT fed a risen (and used up the food)
 *   6. a town below -100 standing was pulled UP to -100 by tribute and by penalties alike
 *   7. an old daily spawner left paupers in `corpses` but not `chars` (invisible, lost on save)
 *   8. resizing the window threw away the PIXEL RATIO cap
 *   9. ctrl+right-click on a workbench put a mindless risen on CRAFT
 *  10. the Aldercott deal was not saved, so its one-time gift could be taken again
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/review.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  /* a 2x screen, so the pixel-ratio cap has something to cap */
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(async () => {
    const R = {};
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const me = chars.find(c => c.faction === 'player' && c.state === 'ok');
    const rclick = (x, y, extra) => {
      const q = w2s(x, y, groundY(x, y) + 0.05);
      document.getElementById('game').dispatchEvent(new MouseEvent('mousedown',
        Object.assign({ clientX: q.x, clientY: q.y, button: 2, buttons: 2, bubbles: true, cancelable: true }, extra || {})));
    };

    /* ---- 1. a beast is drawn where it stands ---- */
    {
      const bs = chars.filter(c => c.beast && !c.construct && c.state === 'ok' && !c.soulbound && !c.wisp &&
                                   !c.servitor && !c.gauntKind && !c.bossKey).slice(0, 4);
      bs.forEach((c, i) => { c.x = me.x + 3 + i; c.y = me.y + 2; c.floor = 0; c.moveTarget = null; });
      /* meshes are built by the renderer, a few a frame, and only for what is in sight */
      for (let i = 0; i < 40 && !bs.every(c => charMeshes.get(c.id)); i++) await wait(200);
      await wait(200);
      const off = bs.map(c => { const e = charMeshes.get(c.id); return e ? Math.abs(e.g.position.z - c.y) : 99; });
      R.beastsStandWhereTheyAre = bs.length && off.every(d => d < 0.6)
        ? `${bs.length} quadrupeds beside the squad, each drawn within ${Math.max(...off).toFixed(2)} of its own tile`
        : `!! A BEAST IS DRAWN OFF ITS TILE (${off.map(d => d.toFixed(1)).join(', ')} tiles out)`;
    }
    paused = true;

    /* ---- 2. right-clicking a wayline opens it ---- */
    {
      const A = placeStructure('way', Math.floor(me.x) + 3, Math.floor(me.y) + 3);
      placeStructure('way', Math.floor(me.x) + 40, Math.floor(me.y) + 3);
      selected = [me]; activeFloor = 0; camX = A.x + 1; camY = A.y + 1; camFollow = false;
      await wait(500);
      me.moveTarget = null;
      rclick(A.x + A.w / 2, A.y + A.h / 2);
      await wait(60);
      const open = document.getElementById('modal').style.display === 'flex' ? document.getElementById('modaltitle').textContent : '';
      document.getElementById('modal').style.display = 'none'; modalOpen = false;
      R.aWaylineOpens = /^WAYLINE/.test(open)
        ? `right-clicking a built wayline opens "${open}"`
        : `!! RIGHT-CLICKING A WAYLINE DID NOT OPEN IT${me.moveTarget ? ' — the party walked onto the stone' : ''}`;
    }

    /* ---- 3 & 4. remains in a Reliquary pay the upkeep and the circle ---- */
    {
      const rel = placeStructure('relic', Math.floor(me.x) - 6, Math.floor(me.y) - 6);
      rel.store = { remains: 40 };
      stash.remains = 0;
      const u = makeChar('Bound One', 'player', me.x + 1, me.y, { atk: 5 });
      u.undead = true; u.crafted = true; u.master = me; u.bindWeight = 2; chars.push(u);
      hostUpkeep();
      /* and what the top-up took over the bill goes back to the Reliquary, not into the wagon:
         any remains in the cart are grave-goods at a gate */
      R.theReliquaryFeedsTheHost = !(u.state !== 'dead' && chars.includes(u)) ? '!! THE HOST CAME APART WITH REMAINS IN THE RELIQUARY'
        : (stash.remains || 0) > 0 ? `!! THE UPKEEP LEFT ${(+stash.remains).toFixed(2)} REMAINS IN THE WAGON — the cart is dirty for a necromancer who kept it clean`
        : `a bound body with 40 remains in the Reliquary and none in the wagon is held for another day (Reliquary now ${(+rel.store.remains).toFixed(2)}, wagon still empty)`;
      const k = Object.keys(UNDEAD_TYPES).find(k2 => { const ut = UNDEAD_TYPES[k2]; return ut.cost && Object.keys(ut.cost).every(x => x === 'remains'); });
      if (!k) R.theCircleReadsTheReliquary = '!! NO REMAINS-ONLY BINDING TO TEST WITH';
      else {
        const ut = UNDEAD_TYPES[k];
        research.done[ut.tech] = true;
        me.gift = 'dark'; me.mana = 999; me.stats.magic = 60;
        const circle = placeStructure('circle', Math.floor(me.x) + 6, Math.floor(me.y) - 6);
        rel.store = { remains: ut.cost.remains + 5 }; stash.remains = 0;
        const said = []; const was = window.refuse; window.refuse = (t) => said.push(t);
        const ok = craftUndead(k, me, circle, null);
        window.refuse = was;
        R.theCircleReadsTheReliquary = ok
          ? `the circle binds a ${ut.name} from remains kept in the Reliquary`
          : `!! THE CIRCLE REFUSED WITH THE REMAINS IN STORAGE (${said.join('; ') || 'no reason given'})`;
      }
    }

    /* ---- 5. the wagon will not feed the dead ---- */
    {
      const u = makeChar('Test Risen', 'player', me.x + 1, me.y + 1, { atk: 5 });
      u.undead = true; u.master = me; chars.push(u);
      stash.fruit = 3; opts.stash = true; applyStashFold(); selected = [u]; refreshInv();
      const btn = document.querySelector('#invbody [data-eat="fruit"]');
      if (btn) btn.click();
      R.theWagonDoesNotFeedTheDead = !btn ? '!! NO EAT BUTTON TO PRESS'
        : (stash.fruit || 0) === 3 ? 'a risen handed a greenfruit from the wagon refuses it, and the fruit stays in the wagon'
        : `!! THE WAGON FED A RISEN (${3 - (stash.fruit || 0)} fruit gone)`;
      selected = [me];
    }

    /* ---- 6. standing below -100 stays below -100 ---- */
    {
      const t = towns.find(x => x.leader && !x.playerRuled);
      cats = 99999;
      t.rep = -250; payTribute(t, t.leader);
      const tribute = t.rep;
      R.aHatedTownStaysHated = tribute > -250 && tribute < -200
        ? `tribute to a town at -250 buys its ordinary few points (now ${Math.round(tribute)}), not a jump to -100`
        : `!! TRIBUTE AT -250 LANDED AT ${Math.round(tribute)}`;
      t.rep = -50;
    }

    /* ---- 7. no bodies outside the roster ---- */
    {
      const hm = towns.find(t => t.def.undeadFriendly);
      let worst = 0;
      for (let d = 0; d < 60; d++) {
        for (let i = corpses.length - 1; i >= 0; i--) if (dist(corpses[i].x, corpses[i].y, hm.x, hm.y) < 14) {
          const bb = corpses[i]; corpses.splice(i, 1); const ci = chars.indexOf(bb); if (ci >= 0) chars.splice(ci, 1);
        }
        hour = 23.9999; update(SIM_DT);
        worst = Math.max(worst, corpses.filter(bb => !chars.includes(bb)).length);
      }
      R.everyCorpseIsOnTheRoster = worst === 0
        ? 'sixty days of an emptied Hollowmere yard, and every corpse that arrives is on the roster (drawn, and saved)'
        : `!! ${worst} CORPSE(S) IN \`corpses\` BUT NOT \`chars\` — invisible, and gone on the next save`;
    }

    /* ---- 8. the pixel-ratio cap survives a resize ---- */
    {
      opts.dpr = '1.0'; applyOpts();
      window.dispatchEvent(new Event('resize')); await wait(50);
      const got = renderer.getPixelRatio();
      opts.dpr = 'auto'; applyOpts();
      R.theCapSurvivesAResize = devicePixelRatio < 2 ? `!! THE PAGE IS NOT 2x (${devicePixelRatio}); nothing to measure`
        : got === 1 ? 'CAP 1.0 on a 2x screen is still 1.0 after the window is resized'
        : `!! A RESIZE PUT THE PIXEL RATIO BACK TO ${got}`;
    }

    /* ---- 9. the building menu asks for a mind ---- */
    {
      const u = makeChar('Hollow One', 'player', me.x + 1, me.y + 1, { atk: 5 });
      u.undead = true; u.master = me; chars.push(u);
      /* clear of the wayline, circle and reliquary put down above: the menu is for whichever
         building is under the cursor */
      const wb = placeStructure('workbench', Math.floor(me.x) - 14, Math.floor(me.y) + 9);
      selected = [u]; camX = wb.x + 1; camY = wb.y + 1; camFollow = false;
      await wait(400);
      rclick(wb.x + wb.w / 2, wb.y + wb.h / 2, { ctrlKey: true });
      await wait(40);
      const item = [...document.querySelectorAll('#ctxmenu button')].find(x => /^ASSIGN/.test(x.textContent));
      if (item) item.click();
      hideCtxMenu();
      R.noCraftWithoutAMind = !item ? '!! NO ASSIGN ITEM ON THE WORKBENCH MENU'
        : !u.job ? 'ctrl+right-click a workbench with a mindless risen selected, pick ASSIGN: CRAFT, and it is refused'
        : `!! A MINDLESS RISEN WAS PUT ON ${String(u.job).toUpperCase()}`;
      selected = [me];
    }

    /* ---- 10. the Aldercott deal is kept across a save ---- */
    {
      if (!estate) R.theDealIsKept = '!! NO ESTATE IN THIS WORLD';
      else {
        estate.deal = 'kept'; estate.watched = true;
        const snap = JSON.parse(JSON.stringify(snapshot()));
        estate.deal = null; estate.watched = false;
        restore(snap);
        R.theDealIsKept = estate.deal === 'kept' && estate.watched
          ? 'the Dame\'s deal and the watch it sets both come back from a save, so her gift cannot be taken twice'
          : `!! THE DEAL CAME BACK AS ${estate.deal} (watched ${estate.watched})`;
      }
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE REVIEW'S BUGS ARE BACK (${bad.length + errs.length})`
                                        : 'EVERY BUG THE REVIEW FOUND STAYS FIXED');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
