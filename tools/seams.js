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
 *   3. the convictions hear two deeds the lore says they care about: a formula recovered under
 *      study warms the inquisitive, and a band breaking off a fight cools the ambitious. Both
 *      kinds were in the weights table and no call site ever emitted them
 *   4. working a profane formula (Dark, Destruction) in sight of a Church town's watch is the
 *      crime CRIMES has always named; the blessed art is not, and Hollowmere does not care
 *   5. the rest of the conviction table is heard: a captive taken back from a captor (rescued),
 *      a stranger mended (heal), a prisoner turned loose (mercy), and a town with an empty seat
 *      put to the torch from its own flag (sack). All four were weighted and none was fired
 *   6. Mother's seal is hers: her door is not forced by a shoulder and holds against a Hollow
 *      still riding; a finished one puts a hand on it, it opens, and the scene behind it is said.
 *      Her lines promised this and the door was an ordinary barred door
 *   7. the Church speaks in its own layer: a Paladin at peace, the Inquisitor, and Vey open the
 *      Order's conversation (the Light, the Original Purge, the pyre) instead of the townsfolk's
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
    /* ---- 3. formula and retreat are deeds ---- */
    {
      const me = player()[0];
      const listen = (conv) => { me.conviction = conv; me.regard = 0; me.undead = false; return () => me.regard || 0; };
      /* a formula comes apart under study. The rate is stubbed: whether the bench is staffed is
         not the claim, the completion is. */
      const sr = window.studyRate;
      window.studyRate = () => 1;
      let r = listen('scholar');
      research.study = { docs: ['formula_w'], left: 0.0001 };
      researchTick(1);
      const afterFormula = r();
      r = listen('scholar');
      research.study = { docs: ['tome'], left: 0.0001 };
      researchTick(1);
      const afterTome = r();
      research.study = null;
      window.studyRate = sr;
      /* a band breaks off: its captain is cut under the break-off line, and the real update runs */
      const q = findOpenNear(Math.round(me.x) + 20, Math.round(me.y) - 20, 8);
      const band = [];
      for (let i = 0; i < 4; i++) {
        const c = makeChar('Band ' + i, 'player', q.x + i, q.y, { atk: 16, def: 14, tough: 14, ath: 7 });
        c.__probe = true; c.conviction = 'cold'; chars.push(c); band.push(c);
      }
      giveCommand(band[0], band, 'forage', { x: q.x, y: q.y }, 20);
      r = listen('ambitious');
      band[0].blood = band[0].maxBlood * 0.40;
      let broke = false;
      for (let i = 0; i < 40 && !broke; i++) { step(0.25); broke = !!(band[0].cmd && band[0].cmd.phase === 'home') || !band[0].cmd; }
      const afterRetreat = r();
      const bits = [];
      if (!(afterFormula > 0.5)) bits.push(`a Worn Formula studied moved an Inquisitive companion by ${afterFormula.toFixed(2)}`);
      if (Math.abs(afterTome) > 0.001) bits.push(`a Tome moved them by ${afterTome.toFixed(2)} (a tome is not a formula)`);
      if (!broke) bits.push('the band never broke off, so there was no retreat to hear');
      else if (!(afterRetreat < -0.5)) bits.push(`a band breaking off moved an Ambitious companion by ${afterRetreat.toFixed(2)}`);
      R.theConvictionsHearIt = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
        : `a Worn Formula studied warms the Inquisitive (+${afterFormula.toFixed(2)}), a Tome moves nobody, and a band breaking off cools the Ambitious (${afterRetreat.toFixed(2)})`;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    }
    /* ---- 4. the profane gift is a crime inside the walls ---- */
    {
      /* a caster with every art, stood beside the watch in a Church town and in Hollowmere */
      const church = towns.find(t => !t.def.undeadFriendly && !t.playerRuled && chars.some(o => o.homeTown === t && o.faction === 'town' && o.state === 'ok'));
      const mere = towns.find(t => t.def.undeadFriendly);
      const castIn = (t, cast) => {
        const w = chars.find(o => o.homeTown === t && o.faction === 'town' && o.state === 'ok' && !o.civ) ||
                  chars.find(o => o.homeTown === t && o.faction === 'town' && o.state === 'ok');
        /* beside the watch AND in its sight, placed without dice: `findOpenNear` is random darts,
           and on the draw where it landed behind a house the watch saw nothing and booked nothing */
        let q = null;
        for (const r of [2, 3, 2.5, 4]) {
          for (let a = 0; a < 16 && !q; a++) {
            const x = w.x + Math.cos(a / 16 * Math.PI * 2) * r, y = w.y + Math.sin(a / 16 * Math.PI * 2) * r;
            if (!isBlocked(x, y, w.floor || 0) && !losBlocked(w.x, w.y, x, y, w.floor || 0)) q = { x, y };
          }
          if (q) break;
        }
        q = q || findOpenNear(Math.round(w.x) + 2, Math.round(w.y), 3);
        const c = makeChar('Caster', 'player', q.x, q.y, { atk: 6, def: 30, tough: 90, magic: 60 });
        c.__probe = true; c.floor = w.floor || 0; c.mana = 999; c.castCd = 0;
        c.att = { divine: 3, destruction: 3, dark: 3, dust: 3 };
        chars.push(c); rebuildCharGrid();
        const foe = makeChar('Rat', 'wild', q.x + 3, q.y, { atk: 1, def: 1, tough: 5 });
        foe.__probe = true; foe.beast = true; foe.floor = c.floor; chars.push(foe); rebuildCharGrid();
        const b0 = t.bounty || 0;
        t._formulaAt = null;               /* each art is asked on its own; the hour is asked below */
        cast(c, foe);
        const got = (t.bounty || 0) - b0;
        chars.splice(chars.indexOf(c), 1); if (chars.includes(foe)) chars.splice(chars.indexOf(foe), 1);
        t.bounty = b0; t.wanted = b0 > 0;
        return got;
      };
      if (!church) R.theProfaneGiftIsACrime = '!! NO CHURCH TOWN WITH A WATCH TO TEST IN';
      else {
        const fire = castIn(church, (c, f) => castFirebolt(c, f));
        const dark = castIn(church, (c, f) => castDarkbolt(c, f));
        const heal = castIn(church, (c) => castHeal(c, c));
        const inMere = mere ? castIn(mere, (c, f) => castFirebolt(c, f)) : 0;
        /* and one fight is one charge: a second bolt inside the hour adds nothing */
        const twice = castIn(church, (c, f) => { castFirebolt(c, f); c.castCd = 0; c.mana = 999; castFirebolt(c, f); });
        const want = CRIMES.formula.bounty;
        const bits = [];
        if (fire < want) bits.push(`a firebolt in ${church.name} added ${fire} bounty`);
        if (dark < want) bits.push(`a darkbolt in ${church.name} added ${dark}`);
        if (heal) bits.push(`a heal (the blessed art) added ${heal}`);
        if (inMere) bits.push(`a firebolt in ${mere.name} added ${inMere}`);
        if (twice !== want) bits.push(`two firebolts inside the hour added ${twice}, not one charge of ${want}`);
        R.theProfaneGiftIsACrime = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `fire or the dark worked in sight of ${church.name}'s watch costs ${want} bounty each; the blessed art costs nothing, a second bolt inside the hour is the same charge, and ${mere ? mere.name : 'Hollowmere'} does not care`;
      }
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    }
    return R;
  });

  /* ---- 5. the rest of the deeds: rescued, heal, mercy, sack ----
     Two of these exist only inside the right-click handler, so they are driven the way
     aid.js drives one: stage, let the camera settle over real frames, click the body or the
     flag, and press the menu entry by its words. The other two are called where play calls
     them: a captor killed by one of ours, and a heal cast at a point on the ground. */
  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  await p.evaluate(() => {
    const me = player()[0];
    /* a council that only listens, one of each conviction these deeds should move */
    const council = {};
    ['compassion', 'cruel', 'loyal'].forEach((k, i) => {
      const q = findOpenNear(Math.round(me.x) - 30 + i * 2, Math.round(me.y) - 30, 6);
      const c = makeChar('Council ' + k, 'player', q.x, q.y, { atk: 4, def: 40, tough: 90 });
      c.__probe = true; c.conviction = k; c.regard = 0; c.noFight = true; chars.push(c); council[k] = c;
    });
    window.__hear = (fn) => {
      for (const c of Object.values(council)) c.regard = 0;
      const got = fn();
      return Object.assign(Object.fromEntries(Object.entries(council).map(([k, c]) => [k, c.regard || 0])), { got });
    };
    window.__aim = (x, y) => {
      camX = camSX = x; camY = camSY = y;
      camDist = camDistTarget = 16; camPitch = camPitchT = 0.62; camYaw = camYawT = 0.4;
      camFollow = false; activeFloor = 0;
    };
    /* right-click a point, press the entry whose words match; the menu's labels come back
       when there is no such entry, so a red says what WAS offered */
    window.__rclick = (x, y, want) => {
      const q = w2s(x, y, groundY(x, y) + floorY(activeFloor) + 0.05);   /* on the storey in view */
      if (!q) return '(no projection)';
      document.getElementById('game').dispatchEvent(new MouseEvent('mousedown', {
        clientX: q.x, clientY: q.y, button: 2, buttons: 2, bubbles: true, cancelable: true }));
      if (!want) return null;
      const el = document.getElementById('ctxmenu');
      if (!el || getComputedStyle(el).display === 'none') {
        const m = selected[0], tg = m && (m.target || m.moveTarget);
        return `(no menu${tg ? `: the click sent ${m.name} at ${tg.name || 'the ground'}` : ''})`;
      }
      const btns = [...el.querySelectorAll('button')];
      const btn = btns.find(x2 => want.test(x2.textContent));
      if (btn) { btn.click(); return null; }
      el.style.display = 'none';
      return btns.map(x2 => x2.textContent).join(' | ');
    };
  });
  const five = await p.evaluate(() => {
    const R = {};
    const me = player()[0];
    /* RESCUED: something drags one of yours off and one of yours stops it. Killed by nobody
       (a gaunt, a fall) it is not a rescue. */
    const q = findOpenNear(Math.round(me.x) - 20, Math.round(me.y) + 20, 8);
    const taken = (dx) => {
      const v = makeChar('Taken', 'player', q.x + dx, q.y, { atk: 4, def: 4, tough: 20 });
      const m = makeChar('Slaver', 'slaver', q.x + dx + 1, q.y, { atk: 4, def: 4, tough: 20 });
      v.__probe = m.__probe = true; chars.push(v, m);
      v.state = 'down'; v.captured = true; m.drag = v;
      return { v, m };
    };
    const a = taken(0), b = taken(4);
    R.byUs = __hear(() => { kill(a.m, me); return !a.v.captured; });
    R.byNobody = __hear(() => { kill(b.m, null); return !b.v.captured; });
    /* HEAL: cast at a hurt townsman on open ground. Once a day a person, and a whole body is
       not mended, so neither of those is a deed */
    const hq = findOpenNear(Math.round(me.x) + 20, Math.round(me.y) + 25, 8);
    const medic = makeChar('Medic', 'player', hq.x, hq.y, { atk: 4, def: 30, tough: 90, magic: 10 });
    medic.__probe = true; medic.att = { divine: 3 }; chars.push(medic);
    const hurt = makeChar('Stranger', 'town', hq.x + 2, hq.y, { atk: 4, def: 4, tough: 20 });
    const whole = makeChar('Whole', 'town', hq.x, hq.y + 2, { atk: 4, def: 4, tough: 20 });
    hurt.__probe = whole.__probe = true; chars.push(hurt, whole); rebuildCharGrid();
    const wound = () => { for (const k of PARTS) hurt.parts[k].hp = Math.min(hurt.parts[k].hp, hurt.parts[k].max * 0.5); };
    const hp = (o) => PARTS.reduce((a2, k) => a2 + o.parts[k].hp, 0);
    const cast = (o) => { medic.mana = 999; medic.castCd = 0; const hp0 = hp(o); resolveCastAt(medic, 'heal', o.x, o.y); return hp(o) > hp0; };
    wound(); R.healOnce = __hear(() => cast(hurt));
    wound(); R.healAgain = __hear(() => cast(hurt));
    R.healWhole = __hear(() => cast(whole));
    for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].__probe) corpses.splice(i, 1);
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe && !/^Council/.test(chars[i].name)) chars.splice(i, 1);
    rebuildCharGrid();

    /* MERCY: a prisoner in your own cell, turned loose from the menu on their body */
    const cq = findOpenNear(Math.round(me.x) + 25, Math.round(me.y) - 25, 8);
    const nb = pBuilds.length;
    placeStructure('cell', cq.x, cq.y);
    const cell = cells[cells.length - 1];
    const pris = makeChar('Held', 'bandit', cell.x, cell.y, { atk: 10, def: 10, tough: 20 });
    pris.__probe = true; pris.state = 'ok'; chars.push(pris);
    stripKit(pris); jail(pris, cell, 0); pris.prisoner = true; rebuildCharGrid();
    const mover = makeChar('Keeper', 'player', cell.x + 3, cell.y + 3, { atk: 10, def: 30, tough: 90 });
    mover.__probe = true; chars.push(mover); selected = [mover];
    window.__mercy = { pris, cell, nb };
    __aim(pris.x, pris.y);
    return R;
  });
  await frame(); await frame(); await frame();
  Object.assign(five, await p.evaluate(() => {
    const R = {};
    const { pris, cell, nb } = window.__mercy;
    R.mercy = __hear(() => __rclick(pris.x, pris.y, /^TURN THEM LOOSE/));
    R.mercy.loose = !pris.jailedAt;
    /* clear the cell away, and stage the sack: a town whose seat is empty and whose stores
       are not, the flag at the hall door, and one of yours standing two strides off it */
    if (pris.jailedAt) { pris.jailedAt = null; }
    cells.splice(cells.indexOf(cell), 1); pBuilds.splice(nb);
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i] === pris) chars.splice(i, 1);
    const t = towns.find(t2 => !t2.playerRuled && !(t2.sacked > 0) && !t2.def.undeadFriendly && t2.leader &&
      Object.values(t2.stock || {}).some(v => v >= 1));
    if (!t) { R.noTown = true; return R; }
    const f = townFlagPos(t);
    for (const o of chars) if (o.state !== 'dead' && o.faction !== 'player' && dist(o.x, o.y, f.x, f.y) < 2.5) o.x += 6;
    const mover = chars.find(o => o.name === 'Keeper');
    /* within reach of the flag, and placed without dice: `findOpenNear` is sixty random darts,
       and on a world where the stream sits a few draws over it put the keeper past the three
       tiles the menu asks for, and the torch was refused with "Stand at the flag" */
    let mq = null;
    for (const r of [2, 2.5, 1.5, 2.8]) {
      for (let a = 0; a < 16 && !mq; a++) {
        const x = f.x + Math.cos(a / 16 * Math.PI * 2) * r, y = f.y + Math.sin(a / 16 * Math.PI * 2) * r;
        if (!isBlocked(x, y, 0)) mq = { x, y };
      }
      if (mq) break;
    }
    mq = mq || { x: f.x + 2, y: f.y };
    mover.x = mq.x; mover.y = mq.y; mover.floor = 0; selected = [mover]; rebuildCharGrid();
    window.__sack = { t, f, seat: t.leader.charId, rep: towns.map(o => o.rep), stock: Object.assign({}, t.stock),
      stash: Object.values(stash).reduce((a2, v) => a2 + (Number(v) || 0), 0) };
    t.leader.charId = -1;                       /* the seat is empty: whoever sat it is gone */
    __aim(f.x, f.y);
    return R;
  }));
  await frame(); await frame(); await frame();
  Object.assign(five, await p.evaluate(() => {
    const R = {};
    const S = window.__sack;
    if (!S) return R;
    const { t, f } = S;
    R.sack = __hear(() => __rclick(f.x, f.y, /TO THE TORCH$/));
    R.sack.town = t.name;
    R.sack.burnt = t.sacked === 5 && t.sackKind === 'torch';
    R.sack.carried = Object.values(stash).reduce((a2, v) => a2 + (Number(v) || 0), 0) - S.stash;
    R.sack.others = towns.every((o, i) => o === t || o.rep <= S.rep[i]);
    /* and put it back: the sack is the last thing this file stages, but a claim added after
       it should not inherit a burning town */
    t.sacked = 0; t.sackKind = null; t.stock = S.stock; t.leader.charId = S.seat;
    towns.forEach((o, i) => { o.rep = S.rep[i]; });
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    selected = [];
    return R;
  }));
  {
    const f5 = five, bits = [];
    const dn = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);
    if (!f5.byUs.got) bits.push('killing the slaver did not let the captive go');
    if (!(f5.byUs.loyal > 1)) bits.push(`a captive saved by one of yours moved the Loyal by ${dn(f5.byUs.loyal)}`);
    if (Math.abs(f5.byNobody.loyal) > 0.001) bits.push(`a captor dying of nothing moved the Loyal by ${dn(f5.byNobody.loyal)}`);
    if (!f5.healOnce.got) bits.push('a heal cast at a hurt townsman mended nothing (the spell found no one there)');
    else if (!(f5.healOnce.compassion > 0.2)) bits.push(`mending a stranger moved the Compassionate by ${dn(f5.healOnce.compassion)}`);
    if (Math.abs(f5.healAgain.compassion) > 0.001) bits.push(`mending the same stranger twice in a day moved them again (${dn(f5.healAgain.compassion)})`);
    if (Math.abs(f5.healWhole.compassion) > 0.001) bits.push(`a heal on a whole body moved them by ${dn(f5.healWhole.compassion)}`);
    if (f5.mercy.got) bits.push(`the prisoner's menu has no TURN THEM LOOSE (${f5.mercy.got})`);
    else if (!f5.mercy.loose) bits.push('TURN THEM LOOSE left the prisoner in the cell');
    else if (!(f5.mercy.cruel < -0.5)) bits.push(`turning a prisoner loose moved the Cruel by ${dn(f5.mercy.cruel)}`);
    if (f5.noTown) bits.push('no town with a seat and stores to stage the sack in');
    else if (f5.sack.got) bits.push(`the flag of an empty seat offers no torch (${f5.sack.got})`);
    else {
      if (!f5.sack.burnt) bits.push(`${f5.sack.town} was not left sacked and burning`);
      if (!(f5.sack.carried > 0)) bits.push(`nothing from ${f5.sack.town}'s stores reached the wagon`);
      if (!f5.sack.others) bits.push('the other towns did not hear of it');
      if (!(f5.sack.compassion < -1) || !(f5.sack.cruel > 1)) bits.push(`the sack moved the Compassionate by ${dn(f5.sack.compassion)} and the Cruel by ${dn(f5.sack.cruel)}`);
    }
    out.theDeedsAreDone = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
      : `a captive taken back moves the Loyal (${dn(f5.byUs.loyal)}), a stranger mended moves the Compassionate (${dn(f5.healOnce.compassion)}, once a day, not for a whole body), ` +
        `a prisoner turned loose cools the Cruel (${dn(f5.mercy.cruel)}), and ${f5.sack.town} put to the torch from its flag burns, fills the wagon (${f5.sack.carried}), ` +
        `and turns the Compassionate (${dn(f5.sack.compassion)}) and warms the Cruel (${dn(f5.sack.cruel)})`;
  }

  /* ---- 6. Mother's seal answers one of hers, and nobody else ----
     Underground, so the eye has to arrive: `activeFloor` follows the selection and the storey
     lift lerps inside `render`, which runs paused. Frames until it stops moving (cave.js). */
  const settle = async () => {
    let last = null;
    for (let i = 0; i < 120; i++) {
      await frame();
      const y = await p.evaluate(() => camFY);
      if (last !== null && Math.abs(y - last) < 0.002 && i > 6) break;
      last = y;
    }
  };
  const six = await p.evaluate(() => {
    const R = {};
    const cv = motherCave(), dr = cv && cv.doors.find(d => d.vault);
    if (!dr) { R.none = true; return R; }
    mother.spoken = false; mother.found = false; mother.toldPrice = false;
    if ('opened' in mother) mother.opened = false;
    const at = (name, race, tier) => {
      const c = makeChar(name, 'player', dr.x + 0.5 + 1.8, dr.y + 0.5, { atk: 20, def: 30, tough: 90, labor: 20 });
      c.__probe = true; c.floor = dr.f || 0; c.race = race; c.hollowTier = tier; c.noFight = true;
      chars.push(c); return c;
    };
    window.__six = { dr, cv, stranger: at('Stranger', 'human', 0), rider: at('Rider', 'hollow', 1), whole: at('Whole', 'hollow', 2) };
    /* only the one under test is in the party, so her first scene reads the right body */
    for (const k of ['rider', 'whole']) window.__six[k].faction = 'wild';
    rebuildCharGrid();
    selected = [window.__six.stranger];
    __aim(dr.x + 0.5, dr.y + 0.5); activeFloor = dr.f || 0;
    return R;
  });
  if (!six.none) {
    await settle();
    Object.assign(six, await p.evaluate(() => {
      const R = {};
      const { dr } = window.__six;
      R.strangerMenu = __rclick(dr.x + 0.5, dr.y + 0.5, /^\(NO SUCH ENTRY\)$/);
      /* the shoulder, directly: an order to force her door, as a save from before would carry */
      const s0 = window.__six.stranger;
      s0.forcing = { x: dr.x, y: dr.y, f: dr.f || 0, t: 0 };
      for (let i = 0; i < 40 && s0.forcing; i++) forceTick(s0, 0.5);
      R.forcedOpen = !!dr.open;
      if (dr.open) { dr.barred = true; setDoor(dr, false); }
      /* and every other vault door still gives to a shoulder */
      const other = doors.find(d => d.vault && d !== dr && d.barred && !d.open);
      if (other) {
        s0.forcing = { x: other.x, y: other.y, f: other.f || 0, t: 0 };
        const x0 = s0.x, y0 = s0.y, f0 = s0.floor;
        s0.x = other.x + 0.5; s0.y = other.y + 0.5; s0.floor = other.f || 0;
        for (let i = 0; i < 40 && s0.forcing; i++) forceTick(s0, 0.5);
        R.otherForced = !!other.open;
        other.barred = true; setDoor(other, false);
        s0.x = x0; s0.y = y0; s0.floor = f0;
      }
      /* a rider: one of hers, not finished */
      const { rider, whole, stranger } = window.__six;
      stranger.faction = 'wild'; rider.faction = 'player';
      selected = [rider];
      return R;
    }));
    await frame(); await frame();
    Object.assign(six, await p.evaluate(() => {
      const R = {};
      const { dr, rider, whole } = window.__six;
      R.riderMenu = __rclick(dr.x + 0.5, dr.y + 0.5, /^\(NO SUCH ENTRY\)$/);
      rider.faction = 'wild'; whole.faction = 'player';
      selected = [whole];
      return R;
    }));
    await frame(); await frame();
    Object.assign(six, await p.evaluate(() => {
      const R = {};
      const { dr } = window.__six;
      const lines = [];
      const _log = log; log = (t, k) => { lines.push(String(t)); return _log(t, k); };
      try { R.wholeMenu = __rclick(dr.x + 0.5, dr.y + 0.5, /HAND ON THE SEAL$/); } finally { log = _log; }
      R.said = lines.join(' | ');
      R.opened = !!mother.opened && !!dr.open && !dr.barred;
      const th = threads.find(t => t.key === 'mother');
      R.threadDone = !!(th && th.done);
      /* and a reload keeps it */
      const snap = snapshot();
      mother.opened = false;
      restore(snap);
      R.kept = mother.opened === true;
      /* a save from before, with her bar already broken by a shoulder: one of hers finished,
         standing in the room, hears the same scene */
      {
        const cv = motherCave(), d2 = cv.doors.find(d => d.vault);
        mother.opened = false; mother.spoken = true; d2.barred = false; setDoor(d2, true);
        /* a fresh body: the reload above rebuilt `chars`, and the probes with it */
        const w2 = makeChar('Whole', 'player', cv.vault.x, cv.vault.y, { atk: 20, def: 30, tough: 90 });
        w2.__probe = true; w2.floor = cv.vault.f; w2.race = 'hollow'; w2.hollowTier = 2; w2.noFight = true; chars.push(w2);
        const l2 = [];
        const _log2 = log; log = (t, k) => { l2.push(String(t)); return _log2(t, k); };
        try { _mthT = 0; motherTick(3); } finally { log = _log2; }
        R.brokenDoor = mother.opened && /THE CELL/.test(l2.join(' ')) && /Llammialith/.test(l2.join(' '));
      }
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      selected = [];
      return R;
    }));
  }
  {
    const x = six, bits = [];
    const said = x.said || '';
    if (x.none) bits.push('there is no Mother in this world to test with');
    else {
      if (/FORCE IT/.test(x.strangerMenu || '')) bits.push(`her door offers a stranger FORCE IT (${x.strangerMenu})`);
      else if (!/DOES NOT ANSWER/.test(x.strangerMenu || '')) bits.push(`her door's menu for a stranger reads "${x.strangerMenu}"`);
      if (x.forcedOpen) bits.push('a shoulder forced her door open');
      if (x.otherForced === false) bits.push('another vault door no longer gives to a shoulder');
      if (/FORCE IT|HAND ON THE SEAL/.test(x.riderMenu || '') || !/RIDER/.test(x.riderMenu || '')) bits.push(`to a Hollow still riding her door offers "${x.riderMenu}"`);
      if (x.wholeMenu) bits.push(`a finished Hollow at her door is offered no hand on the seal (${x.wholeMenu})`);
      else {
        if (!x.opened) bits.push('the hand on the seal did not open it');
        if (!/COME IN/.test(said) || !/Malathuun/.test(said) || !/Llammialith/.test(said)) bits.push(`the second scene was not said (${said.slice(0, 100)})`);
        if (!x.threadDone) bits.push('her thread was not closed');
        if (!x.kept) bits.push('a reload forgot the door was opened');
        if (!x.brokenDoor) bits.push('with her bar already broken (an old save), a finished Hollow in the room heard nothing');
      }
    }
    out.herSealIsHers = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
      : `her door answers nobody with a shoulder (${x.strangerMenu}) while every other vault still forces, holds against a rider, and opens to a finished Hollow's hand on the seal: ` +
        `the second scene is said, her thread closes, a reload keeps it, and a door an old save already broke still gives the scene to one of hers in the room${x.otherForced === undefined ? ' (no other vault to compare)' : ''}`;
  }

  /* ---- 7. the Church speaks in its own layer ----
     A Paladin at peace with you, clicked the way a player clicks anybody; the Inquisitor under
     the white banner, through the TALK on the neutral menu; and Vey, asked directly. */
  const talkText = () => (document.getElementById('modalbody') || {}).textContent || '';
  const seven = await p.evaluate(() => {
    const R = {};
    const pal = chars.find(o => o.faction === 'purge' && o.state === 'ok' && !o.gauntKind && !o.neutral && !o.bossKey && /^Paladin/.test(o.name));
    if (!pal) { R.none = true; return R; }
    const m = makeChar('Pilgrim', 'player', pal.x + 2.2, pal.y, { atk: 10, def: 30, tough: 90 });
    m.__probe = true; m.floor = pal.floor || 0; chars.push(m);
    const iq = makeChar('Inquisitor', 'purge', pal.x - 2.6, pal.y + 2.6, { atk: 20, def: 20, tough: 30, magic: 12 });
    iq.__probe = true; iq.inquisitor = true; iq.neutral = true; iq.floor = pal.floor || 0; chars.push(iq);
    rebuildCharGrid();
    computeVision();                     /* the pilgrim's own eyes: a click only finds who can be seen */
    selected = [m]; if (typeof closeTalk === 'function') closeTalk();
    window.__seven = { pal, iq, m };
    __aim(pal.x, pal.y); activeFloor = pal.floor || 0;
    R.hostile = hostile(m, pal);
    return R;
  });
  if (!seven.none) {
    await settle();
    Object.assign(seven, await p.evaluate(() => {
      const R = {};
      const { pal } = window.__seven;
      R.palClick = __rclick(pal.x, pal.y, /^TALK$/);
      R.palTree = talkState ? talkState.key : null;
      return R;
    }));
    seven.palRoot = await p.evaluate(talkText);
    /* walk it: two of the doctrine's branches, by the buttons the player presses */
    const press = (re) => p.evaluate((src) => {
      const re2 = new RegExp(src);
      const b = [...document.querySelectorAll('#modalbody button')].find(x => re2.test(x.textContent));
      if (!b) return false; b.click(); return true;
    }, re.source);
    seven.pressedPurge = await press(/^Why is your order called the Purge\?/);
    seven.purgeNode = await p.evaluate(talkText);
    await p.evaluate(() => { closeTalk(); talkTo(window.__seven.pal); });
    seven.pressedPyre = (await press(/^Why burn them\?/)) && (await press(/^With fire from the blessed gift/));
    seven.fireNode = await p.evaluate(talkText);
    Object.assign(seven, await p.evaluate(() => {
      const R = {};
      closeTalk();
      const { iq } = window.__seven;
      R.iqClick = __rclick(iq.x, iq.y, /^TALK$/);
      R.iqTree = talkState ? talkState.key : null;
      R.iqRoot = (document.getElementById('modalbody') || {}).textContent || '';
      closeTalk();
      const vey = chars.find(o => o.bossKey === 'marshal' && o.state === 'ok');
      if (vey) {
        talkTo(vey);
        R.veyTree = talkState ? talkState.key : null;
        R.veyRoot = (document.getElementById('modalbody') || {}).textContent || '';
        closeTalk();
      }
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      selected = [];
      return R;
    }));
  }
  {
    const x = seven, bits = [];
    if (x.none) bits.push('no Paladin in this world to talk to');
    else if (x.hostile) bits.push('the staged Paladin is hunting the probe, so the claim cannot be asked');
    else {
      if (x.palTree !== 'purge') bits.push(`a right-click on a Paladin at peace opened ${x.palTree ? `the "${x.palTree}" tree` : 'nothing'} (${x.palClick || 'no menu'})`);
      else {
        if (!/Walk in the Light/.test(x.palRoot)) bits.push(`the Paladin's greeting is not the Order's (${x.palRoot.slice(0, 60)})`);
        if (!x.pressedPurge || !/Original Purge/.test(x.purgeNode)) bits.push('asked why the Order is the Purge, nobody says the Original Purge');
        if (!x.pressedPyre || !/His own fire/.test(x.fireNode)) bits.push('asked what lights the pyre, nobody says His own fire');
      }
      if (x.iqTree !== 'purge' || !/The Order speaks before it burns/.test(x.iqRoot || '')) bits.push(`the Inquisitor's TALK opened ${x.iqTree || 'nothing'} (${x.iqClick || ''})`);
      if (x.veyTree !== undefined && (x.veyTree !== 'purge' || !/What does the Order want with me/.test(x.veyRoot || ''))) bits.push(`Vey opened ${x.veyTree || 'nothing'}`);
    }
    out.theChurchSpeaks = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
      : `a Paladin at peace answers a plain right-click in the Order's own words: the Light without end, the Original Purge, and a pyre lit with His own fire; ` +
        `the Inquisitor speaks it from under the white banner${x.veyTree ? ', and Vey from his hall' : ''}`;
  }

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
