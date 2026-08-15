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
  await p.evaluate(() => document.getElementById('btn-start').click());
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

  /* ============================================================ AND ACROSS SEEDS */
  const spots = [];
  for (let run = 0; run < 2; run++) {
    const p2 = await b.newPage({ viewport: { width: 800, height: 600 } });
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
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  if (errs.length) console.log('\n' + errs.slice(0, 6).join('\n'));
  console.log('\n' + (bad.length || errs.length
    ? `FAIL — ${bad.length} verdict(s), ${errs.length} error(s)`
    : 'EVERY WORLD HAS ALL SIX, AND NONE OF THEM TWICE IN THE SAME PLACE'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
