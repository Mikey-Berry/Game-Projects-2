#!/usr/bin/env node
/* SIX PEOPLE WHO ARE OUT THERE EVERY TIME.
 *
 * The promise is not "there are some named NPCs". It is: every world has all six, in the same
 * KIND of place, never the same place twice, and every one of them can actually be reached and
 * actually be taken on. Every part of that is a thing a probe can hold to — and every part of
 * it is a thing that silently stops being true the first time a placement falls through to a
 * fallback nobody checked.
 *
 *   1. all six exist, on ground somebody can stand on, in a fresh world
 *   2. each is where its kind says it is — the gaoled one in a real cell, the held one held
 *   3. the six roll to different places across seeds, and are still all six
 *   4. every recruit gate refuses for a stated reason and then opens when that reason is met
 *   5. taking one on actually puts them on the banner, out of the cell, off the rope
 *   6. it all survives a save, and the one in a cell does not file her way out
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/wanderers.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 240)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  /* START AND STOP IN THE SAME BREATH. A click followed by a wait lets the world run for
     however many frames the machine manages, which is not a fixed number and drops when a
     sixty-harness suite is loading the box — so every body is somewhere slightly different
     by the time this probe stages anything, and the numbers below inherit it. Measured on
     one unchanged build before this was applied here: flank.js gave 1.67 / 1.67 / 1.09 over
     three runs, and guns.js split three-to-two on an md5 that had not moved. Pausing inside
     the same evaluate leaves no frames at all between the two. Every file below sets
     `paused` for itself anyway; this only removes the window before its first statement. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    const who = k => chars.find(c => c.wanderKey === k && c.state !== 'dead');

    /* ============================================================ 1. ALL SIX, EVERY TIME */
    {
      const found = WANDERERS.map(w => who(w.key)).filter(Boolean);
      R.roster = found.length === WANDERERS.length
        ? `all ${WANDERERS.length} are in the world: ${found.map(c => c.name).join(', ')}`
        : `!! ONLY ${found.length} OF ${WANDERERS.length} WERE PLACED`;
      /* somewhere a person could actually stand — a wanderer inside a mountain is a wanderer
         who does not exist, which is the one thing the design promises cannot happen */
      const stuck = found.filter(c => isBlocked(c.x, c.y, c.floor || 0) && !c.jailedAt);
      R.reachable = !stuck.length
        ? 'every one of them is standing on ground you can walk to'
        : `!! ${stuck.map(c => c.name).join(', ')} IS INSIDE SOMETHING`;
      const onMap = found.filter(c => c.x > 2 && c.y > 2 && c.x < W - 2 && c.y < H - 2);
      R.onTheMap = onMap.length === found.length ? 'and inside the map' : '!! SOMEBODY IS OFF THE EDGE OF THE WORLD';
      /* each is a dated rumour, so the roster is learnable without being handed over */
      const news = events.filter(e => e.kind === 'wanderer');
      R.rumoured = news.length >= WANDERERS.length
        ? `and each one is a dated rumour in the world news (${news.length})`
        : `!! ONLY ${news.length} OF THEM ARE RUMOURED`;
    }

    /* ============================================================ 2. IN THE RIGHT KIND OF PLACE */
    {
      const hob = who('hob'), cressa = who('cressa'), nine = who('nine'), hesper = who('hesper');
      R.inACell = (hob && hob.jailedAt && hob.jailedAt.kind === 'town' && hob.jailedAt.holds === hob.id)
        ? `${hob.name} is in a real town cell, and the cell knows it holds him`
        : `!! THE GAOLED ONE IS NOT IN A CELL (${hob && !!hob.jailedAt})`;
      R.held = (cressa && cressa.captured)
        ? `${cressa.name} is held at the slaver camp`
        : '!! THE HELD ONE IS NOT HELD';
      R.atARedoubt = (nine && redoubts.some(r => dist(r.x, r.y, nine.x, nine.y) < (r.r || 8) + 14))
        ? `${nine.name} is standing at a redoubt`
        : `!! THE REDOUBT ONE IS NOWHERE NEAR A REDOUBT`;
      R.neutral = WANDERERS.every(w => { const c = who(w.key); return c && !hostile(c, player()[0]); })
        ? 'and not one of the six opens on sight'
        : '!! ONE OF THEM IS HOSTILE ON SIGHT';
      /* she walks. A drifter standing in one field would make "meet her three times" a joke. */
      const was = { x: hesper.x, y: hesper.y };
      let moved = 0;
      for (let d = 0; d < 6; d++) { wandererDayTick(); if (dist(hesper.x, hesper.y, was.x, was.y) > 5) moved++; was.x = hesper.x; was.y = hesper.y; }
      R.sheWalks = moved >= 5 ? `${hesper.name} is somewhere else on ${moved} of 6 days` : `!! SHE STANDS STILL (${moved}/6)`;
    }

    /* ============================================================ 3. EVERY GATE REFUSES, THEN OPENS */
    {
      const say = [];
      /* HOB — a fine, in coin */
      const hob = who('hob');
      cats = 0;
      const g0 = wandererGate(hob);
      cats = 99999;
      const g1 = wandererGate(hob);
      R.hobGate = (!g0.ok && /fine/.test(g0.why) && g1.ok)
        ? `Hob refuses with a reason — "${g0.why}" — and opens once you have it`
        : `!! HOB'S GATE IS WRONG (${g0.ok}/${g1.ok}: ${g0.why})`;

      /* OTTOLINE — somebody who needs her */
      const ott = who('ottoline');
      for (const u of player()) { u.state = 'ok'; u.blood = u.maxBlood; for (const k in u.parts) { u.parts[k].hp = u.parts[k].max; u.parts[k].bleed = 0; u.parts[k].bandaged = false; } }
      const o0 = wandererGate(ott);
      const hurt = player().find(u => !u.undead);
      hurt.parts['l.arm'].hp = 10; hurt.parts['l.arm'].bleed = 1;
      const o1 = wandererGate(ott);
      R.ottGate = (!o0.ok && o1.ok)
        ? `Ottoline will not come for a whole squad — "${o0.why}" — and comes the moment one of them is not`
        : `!! THE SURGEON'S GATE IS WRONG (${o0.ok}/${o1.ok}: ${o0.why})`;

      /* NINE — a written doctrine */
      const nine = who('nine');
      stash.doctrine = 0;
      const n0 = wandererGate(nine);
      stash.doctrine = 1;
      const n1 = wandererGate(nine);
      R.nineGate = (!n0.ok && /doctrine/.test(n0.why) && n1.ok)
        ? `Nine wants a written order — "${n0.why}" — and stands down when it reads one`
        : `!! NINE'S GATE IS WRONG (${n0.ok}/${n1.ok}: ${n0.why})`;

      /* CRESSA — her keepers on the ground. The REAL ones: she is staged at the actual slaver
         camp, which has its own guards standing around her, so a probe that kills one keeper
         it made itself is still looking at a camp full of them and reads the gate as broken. */
      const cressa = who('cressa');
      const keeper = makeChar('Keeper', 'slaver', cressa.x + 2, cressa.y, { atk: 10 });
      keeper.state = 'ok'; chars.push(keeper);
      const c0 = wandererGate(cressa);
      for (const o of chars) if (o.faction === 'slaver' && dist(o.x, o.y, cressa.x, cressa.y) < 20) o.state = 'dead';
      const c1 = wandererGate(cressa);
      R.cressaGate = (!c0.ok && /keepers/.test(c0.why) && c1.ok)
        ? `Cressa will not be talked loose — "${c0.why}" — and is free the moment they are down`
        : `!! CRESSA'S GATE IS WRONG (${c0.ok}/${c1.ok}: ${c0.why})`;

      /* ---------- ALBEDO — A NAME OFF A POLE, WHICH SOMEBODY HAS TO GO AND READ ----------
         "I like the idea, especially since it requires sneaking into paladin territory. But I
          cannot find any pyres of burnt ones, despite the tooltip messages that the Paladins
          have taken them."
         The poles are built and they are built on time — measured over two hundred days of
         `questionTick`: five taken, five burned, five poles. Every one of them stands at the
         Bastion gate, which is a long way from where anybody starts, and NOTHING SAID SO. And
         her gate asked `pyres.length > 0` — satisfied by a burning that happened somewhere in
         the world, seen by nobody, which is not what her line asks for.
         So this is a THREE-STATE test: no fire at all, a fire nobody has stood at, and a name
         somebody read. The middle state is the one that did not exist. */
      const albedo = who('albedo');
      pyres.length = 0; pyreRead = null;
      const a0 = wandererGate(albedo);
      const pole = { x: bastion.x, y: bastion.y + BASTION_R + 3 };
      pyres.push({ x: pole.x, y: pole.y, name: 'Bess Prentiss', day: day });
      const a1 = wandererGate(albedo);
      R.albedoNeedsAFire = (!a0.ok && /not built a fire/.test(a0.why))
        ? `with no fire lit she says so — "${a0.why}"`
        : `!! ALBEDO'S FIRST GATE IS WRONG (${a0.ok}: ${a0.why})`;
      R.andSomebodyHasToStandAtIt = (!a1.ok && /nobody of yours has stood/.test(a1.why))
        ? `and a pole nobody has walked to is still not an answer — "${a1.why}"`
        : `!! A DISTANT BURNING OPENED HER WITHOUT ANYBODY GOING (${a1.ok}: ${a1.why})`;
      /* walk somebody to it. `witnessTick` is where every other "your people set foot here"
         lives, so that is what gets run rather than a hand-rolled equivalent. */
      const reader = player().find(u => u.state !== 'dead');
      const rx = reader.x, ry = reader.y;
      reader.x = pole.x + 1; reader.y = pole.y;
      witnessTick();
      const a2 = wandererGate(albedo);
      R.andThenSheTakesYourHand = (a2.ok && pyreRead && pyreRead.name === 'Bess Prentiss' && /BESS PRENTISS/.test(a2.label))
        ? `stand at the pole and the name comes off it — she is waiting to hear "${pyreRead.name}", and the button says so`
        : `!! ${a2.ok} / ${a2.label || a2.why} / read ${JSON.stringify(pyreRead)}`;
      /* AND THE WORLD SAYS WHERE. A world event scrolls past in the feed; a thread with a mark
         on it is a place you can walk to, and finding it was the actual complaint. */
      threads.length = 0; pyres.length = 0; pyreRead = null;
      const victim = makeChar('Doomed', 'town', bastion.x, bastion.y + 2, { atk: 4, def: 4, tough: 8 });
      victim.state = 'ok'; victim.heretic = true; victim.burnDay = day;
      chars.push(victim);
      burnHeretic(victim);
      const th = threads.find(t => t.key === 'pyre');
      R.andTheJournalSaysWhere = (th && th.mark && dist(th.mark.x, th.mark.y, bastion.x, bastion.y) < BASTION_R + 12)
        ? `and the burning opens a journal thread with a bearing on it — "${th.title}", pointing ${Math.round(dist(th.mark.x, th.mark.y, bastion.x, bastion.y))} tiles from the Bastion's middle`
        : `!! NOTHING IN THE JOURNAL POINTS AT A POLE (${th ? JSON.stringify(th.mark) : 'no thread'})`;
      reader.x = rx; reader.y = ry;
      { const i = chars.indexOf(victim); if (i >= 0) chars.splice(i, 1); }
      pyres.length = 0; pyreRead = null; threads.length = 0;

      /* HESPER — three places, not three button presses */
      const hesper = who('hesper');
      hesper.wanderMet = 0; hesper.wanderSeen = null;
      hesper.x = towns[0].x + 6; hesper.y = towns[0].y;
      wandererMet(hesper); wandererMet(hesper); wandererMet(hesper);
      const oneSpot = hesper.wanderMet;
      hesper.x = towns[1].x + 6; hesper.y = towns[1].y; wandererMet(hesper);
      hesper.x = towns[2].x + 6; hesper.y = towns[2].y; wandererMet(hesper);
      R.hesperCounts = oneSpot === 1
        ? 'standing in front of Hesper pressing the button three times counts once'
        : `!! HER COUNT IS PER CONVERSATION, NOT PER PLACE (${oneSpot})`;
      R.hesperGate = wandererGate(hesper).ok
        ? `and three DIFFERENT places opens her — ${hesper.wanderMet} of ${wandererDef('hesper').meets}`
        : `!! THREE PLACES DID NOT OPEN HER (${wandererGate(hesper).why})`;

      /* and the banner cap outranks every one of them */
      const filler = [];
      while (player().filter(u => (!u.undead || u.lich) && !u.settler).length < SQUAD_CAP) {
        const f = makeChar('Filler', 'player', towns[0].x, towns[0].y, {});
        f.state = 'ok'; chars.push(f); filler.push(f);
        if (filler.length > 40) break;
      }
      R.capWins = !wandererGate(hob).ok && /banner is full/.test(wandererGate(hob).why)
        ? 'and a full banner refuses all of them, whatever they cost'
        : `!! THE SQUAD CAP DOES NOT OUTRANK THE GATES (${wandererGate(hob).why})`;
      for (const f of filler) { const i = chars.indexOf(f); if (i >= 0) chars.splice(i, 1); }
    }

    /* ============================================================ 4. TAKING THEM ON */
    {
      const hob = who('hob'), cressa = who('cressa'), nine = who('nine');
      cats = 99999; stash.doctrine = 3;
      const cell = hob.jailedAt;
      const before = player().length;
      const paid = cats;
      const okHob = recruitWanderer(hob);
      R.hobJoins = (okHob && hob.faction === 'player' && !hob.jailedAt && cell.holds === 0)
        ? `paying his fine takes ${hob.name} out of the cell and onto the banner, for ${paid - cats} gold`
        : `!! HOB DID NOT JOIN (${okHob}, jailed ${!!hob.jailedAt}, cell ${cell.holds})`;
      recruitWanderer(cressa);
      R.cressaJoins = (cressa.faction === 'player' && !cressa.captured)
        ? `and cutting ${cressa.name} loose takes the rope off her`
        : `!! CRESSA IS STILL HELD (${cressa.faction}, captured ${cressa.captured})`;
      const doc0 = campHas('doctrine');
      recruitWanderer(nine);
      R.nineJoins = (nine.faction === 'player' && campHas('doctrine') < doc0)
        ? `and ${nine.name} reads the doctrine — and the doctrine is spent for it`
        : `!! NINE JOINED FOR FREE OR NOT AT ALL (${nine.faction}, doctrine ${doc0} to ${campHas('doctrine')})`;
      R.onTheBanner = player().length >= before + 3
        ? `the squad is ${player().length} where it was ${before}`
        : `!! THEY ARE NOT ON THE BANNER (${before} to ${player().length})`;
      /* a recruited one has real skill, not a bar-recruit stat line */
      R.worthTaking = (nine.stats.atk >= 30 && who('ottoline').stats.medic >= 45 && who('bram').stats.gunnery >= 40)
        ? `and they are worth the trip — Nine atk ${Math.floor(nine.stats.atk)}, Ottoline med ${Math.floor(who('ottoline').stats.medic)}, Bram gunnery ${Math.floor(who('bram').stats.gunnery)}`
        : '!! THE ROSTER IS NOT WORTH CROSSING A MAP FOR';
    }

    /* ============================================================ 5. THROUGH A SAVE */
    {
      const hesper = who('hesper'), hob = who('hob');
      const met = hesper.wanderMet, seen = JSON.stringify(hesper.wanderSeen || {});
      const sv = snapshot();
      hesper.wanderMet = 0; hesper.wanderSeen = null; hob.faction = 'drifter';
      restore(JSON.parse(JSON.stringify(sv)));
      const h2 = who('hesper'), b2 = who('hob');
      R.saved = (h2 && h2.wanderMet === met && JSON.stringify(h2.wanderSeen || {}) === seen)
        ? `her tally of places survives a save (${met})`
        : `!! THE MEETING COUNT DID NOT SURVIVE (${h2 && h2.wanderMet} vs ${met})`;
      R.savedJoined = (b2 && b2.faction === 'player' && b2.wanderJoined)
        ? 'and somebody you took on is still yours after one'
        : `!! A RECRUITED WANDERER CAME BACK A STRANGER (${b2 && b2.faction})`;
    }

    /* ============================================================ 6. HE STAYS PUT */
    {
      /* Left in a cell for a fortnight, the Ninth Man must still be in it — `workTheBars` is
         the escape system and it would quietly undo the whole premise in about two weeks. */
      const fresh = chars.find(c => c.wanderKey === 'hob');
      if (fresh && fresh.faction === 'player') {
        /* he has already been recruited above; stage a fresh one to test the cell */
        const cl = cells.find(x => x.kind === 'town' && !x.holds);
        const t = makeChar('Test Ninth Man', 'drifter', cl.x, cl.y, {});
        t.wanderKey = 'hob'; t.neutral = true; chars.push(t);
        jail(t, cl, 9999);
        const hp0 = cl.hp;
        for (let i = 0; i < 30000; i++) { t.state = 'ok'; physics(t, 1 / 30); }
        R.staysPut = (t.jailedAt === cl && cl.hp === hp0)
          ? 'a fortnight of sim later he has not touched the bars'
          : `!! HE FILES HIS WAY OUT (jailed ${!!t.jailedAt}, cell ${hp0} to ${cl.hp})`;
        const i = chars.indexOf(t); if (i >= 0) chars.splice(i, 1);
        cl.holds = 0;
      } else R.staysPut = '(hob was not recruited; cell test skipped)';
    }
    return R;
  });

  /* ============================================================ GOING OVER TO TALK
     Reported from play: "scholars give generic dialogue at a distance and require you to be
     close up to give their actual conversational dialogue." Two separate faults, and neither
     is visible from anything except THE REAL CLICK HANDLER — one was branch ordering (the
     generic townsperson check sits three hundred lines above the one that knows what a scholar
     is, and a scholar is faction 'drifter') and the other was that walking over dropped the
     intent. So this drives actual right-click events at actual screen coordinates. */
  const talk = await p.evaluate(async () => {
    const T = {};
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const modal = document.getElementById('modal');
    const shut = () => { modal.style.display = 'none'; modalOpen = false; hideCtxMenu(); };
    const title = () => (document.getElementById('modaltitle') || {}).textContent || '';
    const rclick = async (o) => {
      camX = camSX = o.x; camY = camSY = o.y;
      camDist = camDistTarget = 16; camPitch = camPitchT = 0.62; camYaw = camYawT = 0.4;
      camFollow = false;
      await frame(); await frame(); await frame();
      /* AIM AT THEIR FEET, which is what a player aims at. The first version projected at
         +0.9 — head height — and the screen point maps back to ground 0.91 tiles PAST them,
         which happens to be just outside the two 0.9-tile traps that were eating the click.
         The probe passed on a build where a dead-centre click did nothing at all. */
      const q = w2s(o.x, o.y, groundY(o.x, o.y) + 0.05);
      if (!q) return false;
      const mp = screenToWorld(q.x, q.y);
      window.__aim = dist(mp.x, mp.y, o.x, o.y);
      /* ---------- A CLICK IS A PRESS AND A RELEASE, AND NOW THAT MATTERS ----------
         A right-click on somebody with something to say no longer resolves on mousedown: the
         press starts a hold timer and the RELEASE decides which it was — a tap talks, a hold
         opens the options menu. So a probe that dispatches only mousedown now stages a button
         that is still being held down, and correctly gets no conversation. Dispatch both, the
         way a hand does. */
      const ev = (type) => document.getElementById('game').dispatchEvent(new MouseEvent(type, {
        clientX: q.x, clientY: q.y, button: 2, buttons: type === 'mousedown' ? 2 : 0,
        bubbles: true, cancelable: true,
      }));
      ev('mousedown');
      ev('mouseup');
      return true;
    };

    const sc = chars.find(c => c.scholar && c.state === 'ok');
    const me = player().find(c => c.state === 'ok' && !c.undead) || player()[0];
    T.subject = sc ? `${sc.name} is standing somewhere` : '!! NO SCHOLAR IN THE WORLD';
    if (!sc) return T;
    /* STOP THE WORLD. Every step below is separated by an `await frame()`, and while this
       probe is awaiting, the game's own loop is still running in REAL time — so how far the
       world moves between two assertions depends on how busy the machine is. Run this file
       alone and it passes; run it inside the suite with a loaded box and a second scholar
       wanders into the click radius between the order and the arrival, and the panel opens on
       somebody else. It failed exactly that way twice under `npm run check` and passed three
       times out of three on its own, which is the signature of a wall-clock dependency rather
       than a bug. The walk below is driven by explicit `physics()` calls and does not need the
       loop, so pausing costs the test nothing and makes it deterministic. */
    paused = true;

    /* ---- ON TOP OF THEM: the click must find the SCHOLAR, not the generic townsperson ---- */
    shut();
    me.x = sc.x + 1; me.y = sc.y; me.floor = sc.floor || 0;
    selected = [me]; clearOrders(me);
    rebuildCharGrid(); computeVision();
    await rclick(sc);
    await frame();
    T.aimedAtThem = window.__aim < 0.5
      ? `the probe clicks ${window.__aim.toFixed(2)} tiles from them — dead centre, the way a player aims`
      : `!! THE PROBE IS AIMING ${window.__aim.toFixed(2)} TILES OFF AND MISSING THE BRANCHES UNDER TEST`;
    T.closeOpens = (modal.style.display !== 'none' && title().includes(sc.name.toUpperCase().split(' ')[0]))
      ? `clicking a scholar you are standing beside opens ${title()}`
      : `!! A CLICK ON A SCHOLAR OPENED "${title()}" (modal ${modal.style.display})`;
    T.notAMenu = document.getElementById('ctxmenu').style.display === 'none'
      ? 'and not the generic TALK menu the townsperson branch would have given'
      : '!! IT FELL THROUGH TO THE GENERIC TOWNSPERSON MENU';

    /* ---- AND FROM ACROSS THE SQUARE: walk over, and REMEMBER WHY ---- */
    shut();
    /* ACROSS THE SQUARE, NOT OVER THE HORIZON. Sight is 17 tiles at night and the talk branch
       quite rightly will not resolve a click on somebody nobody can see — so a probe staged
       eighteen tiles out is measuring the fog rule, not the walk. Ten is a plaza. */
    const far = findOpenNear(Math.round(sc.x) + 10, Math.round(sc.y), 4);
    me.x = far.x; me.y = far.y;
    selected = [me]; clearOrders(me);
    rebuildCharGrid(); computeVision();
    await rclick(sc);
    await frame();
    T.farInSight = (dist(far.x, far.y, sc.x, sc.y) < 16 && visAt(sc.x, sc.y) === 2)
      ? `staged ${dist(far.x, far.y, sc.x, sc.y).toFixed(0)} tiles off, with the scholar still in sight`
      : `!! THE PROBE CANNOT SEE WHO IT IS CLICKING (${dist(far.x, far.y, sc.x, sc.y).toFixed(1)} tiles, vis ${visAt(sc.x, sc.y)})`;
    T.farNoModal = modal.style.display === 'none'
      ? 'clicking one across the square does not open anything yet'
      : '!! A DISTANT CLICK OPENED THE PANEL FROM FOURTEEN TILES AWAY';
    T.farRemembers = me.talkTarget === sc
      ? `${me.name} sets off to speak with them, and the walk knows why`
      : `!! THE WALK FORGOT WHY IT WAS ORDERED (talkTarget ${me.talkTarget && me.talkTarget.name})`;
    /* CLEAR THE LAST TILE. `talkTarget` has a 30-second give-up on it, and `travel` has to get
       inside TALK_REACH to count as arrived — so one townsman standing on the scholar's last
       approach tile runs the clock out, the order is dropped WITHOUT opening anything, and the
       next assertion reports "arriving opened nothing" for a walk that never arrived. That is
       exactly how this went red inside `npm run check` and green on its own: the crowd around
       the scholar differs by a body between runs. Crowd navigation is what `givesUp` below is
       for; this leg is about the intent surviving the walk, so it is staged in the open. */
    for (const o of chars) {
      if (o === sc || o === me || o.state === 'dead') continue;
      if (dist(o.x, o.y, sc.x, sc.y) < 3) { o.x += 14; o.y += 14; }
    }
    rebuildCharGrid();
    /* now run the real sim until they arrive */
    let gaveUp = false;
    for (let i = 0; i < 3000 && me.talkTarget; i++) { me.state = 'ok'; physics(me, 1 / 30); }
    if (!me.talkTarget && dist(me.x, me.y, sc.x, sc.y) > 3.2) gaveUp = true;
    T.arrives = !me.talkTarget && !gaveUp && dist(me.x, me.y, sc.x, sc.y) < 3.2
      ? `and they walk the ${Math.round(dist(far.x, far.y, sc.x, sc.y))} tiles`
      : `!! THEY NEVER GOT THERE — ${gaveUp ? 'THE 30s GIVE-UP FIRED' : 'STILL WALKING'} (${dist(me.x, me.y, sc.x, sc.y).toFixed(1)} tiles out)`;
    T.opensOnArrival = (modal.style.display !== 'none' && title().includes(sc.name.toUpperCase().split(' ')[0]))
      ? 'and the conversation opens when they arrive, with no second click'
      : `!! ARRIVING OPENED NOTHING — THE SECOND CLICK IS STILL REQUIRED ("${title()}")`;

    /* ---- and it gives up rather than walking at a wall forever ---- */
    shut();
    me.x = far.x; me.y = far.y; clearOrders(me);
    me.talkTarget = sc; me.talkGiveUp = 30;
    const realTravel = window.travel;
    window.travel = () => false;                     /* never arrives */
    for (let i = 0; i < 2000 && me.talkTarget; i++) { me.state = 'ok'; physics(me, 1 / 30); }
    window.travel = realTravel;
    T.givesUp = !me.talkTarget
      ? 'somebody they cannot reach is dropped rather than walked at forever'
      : '!! AN UNREACHABLE CONVERSATION IS AN INFINITE WALK';
    shut();
    return T;
  });
  Object.assign(out, talk);

  /* ============================================================ AND ACROSS SEEDS */
  const spots = [];
  for (let run = 0; run < 2; run++) {
    const p2 = await b.newPage({ viewport: { width: 800, height: 600 } });
    /* ---------- THIRTY SECONDS IS NOT ENOUGH TO OPEN THIS DOCUMENT ----------
       Playwright's default navigation timeout is 30s and the game is a 2.1MB page that runs
       the whole of worldgen before `load` fires. This file opens THREE worlds, so it pays that
       cost three times, and on a loaded machine it is the only harness in the suite that can
       fail without a single assertion going red — the run dies on `page.goto` and the summary
       says "wanderers.js" as if the wanderers were the problem. Caught once at 118s passing
       and once at 74s throwing, on the same build, while the suite as a whole was running 40%
       slower than its previous pass. Give the document time to open. */
    p2.setDefaultNavigationTimeout(180000);
    await p2.goto('file://' + gamePath(process.argv[2]) + '?seed=' + (run + 7), { waitUntil: 'load' });
    await p2.waitForTimeout(2500);
    await p2.evaluate(() => document.getElementById('btn-start').click());
    await p2.waitForTimeout(2500);
    spots.push(await p2.evaluate(() => WANDERERS.map(w => {
      const c = chars.find(x => x.wanderKey === w.key);
      return c ? `${w.key}:${Math.round(c.x)},${Math.round(c.y)}` : `${w.key}:MISSING`;
    })));
    await p2.close();
  }
  const missing = spots.flat().filter(s => s.includes('MISSING'));
  out.everySeed = !missing.length
    ? `all six placed in ${spots.length} more worlds as well`
    : `!! MISSING IN A RELOADED WORLD: ${missing.join(', ')}`;
  const total = spots[0].length;
  const same = spots[0].filter((s, i) => s === spots[1][i]).length;
  out.differentPlaces = same <= 2
    ? `and they land somewhere different: ${total - same} of ${total} moved between worlds`
    : `!! THE ROSTER IS PINNED TO FIXED COORDINATES (${same} identical)`;

  console.log('\n=== THE SIX WHO ARE ALWAYS OUT THERE ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26) + ' ' + v);
  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  if (errs.length) console.log('\n' + errs.slice(0, 6).join('\n'));
  console.log('\n' + (bad.length || errs.length
    ? `FAIL — ${bad.length} verdict(s), ${errs.length} error(s)`
    : 'EVERY WORLD HAS ALL SIX, AND NONE OF THEM TWICE IN THE SAME PLACE'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
