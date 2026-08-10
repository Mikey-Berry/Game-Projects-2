#!/usr/bin/env node
/* THE POST, THE BODYGUARD, AND WHAT THE SQUAD SAYS ABOUT IT.
 *
 * Four notes' worth of behaviour, driven end to end:
 *   1. town work exists, can be taken, can be finished, and pays
 *   2. an escort is a person who walks a road and can be lost
 *   3. BODYGUARD names a ward out loud and the ward is visible afterwards
 *   4. quest directions are directions, not flavour
 *   5. the squad talks about the situation it is actually in
 *
 * Each block ends in a verdict. Anything starting '!!' fails the build.
 *
 *   node tools/board.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 220)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 220)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    const t = towns[0];
    /* PRECONDITION, not decoration. Dens and tears accrue over the first days of a run, so on
       day one `camps` and `rifts` are both empty — and every job that needs an address is
       therefore unrollable. An earlier run of this harness reported the scholar quests as
       still saying "out past the flats" when what it had actually measured was a world too
       young to have anywhere to send anyone. */
    spawnCamp(); spawnCamp();
    R.world = `${camps.length} dens, ${camps.filter(c => campAlive(c) > 0).length} of them manned`;

    /* ---------- 1. THERE IS WORK, AND IT IS NOT AT THE BAR ---------- */
    refreshBoard(t, true);
    R.postExists = t.board && t.board.jobs.length >= 2
      ? `${t.board.jobs.length} jobs on the ${t.name} post`
      : '!! THE POST IS EMPTY';
    /* the board must be somewhere you can stand — the plan reserves +2.5,+2.5 for it */
    {
      const bp = townBoardPos(t);
      const inABuilding = buildings.some(bd => bd.town === t &&
        bp.x >= bd.x - 0.5 && bp.x <= bd.x + bd.w + 0.5 && bp.y >= bd.y - 0.5 && bp.y <= bd.y + bd.h + 0.5);
      R.postStands = (!isBlocked(Math.round(bp.x), Math.round(bp.y)) && !inABuilding)
        ? 'it stands on open plaza, clear of every building'
        : '!! THE POST IS INSIDE SOMETHING';
      /* and every town has one you can reach */
      const bad = towns.filter(t2 => {
        const q = townBoardPos(t2);
        return isBlocked(Math.round(q.x), Math.round(q.y));
      });
      R.everyTown = bad.length === 0 ? `all ${towns.length} towns have a reachable post`
        : `!! ${bad.length} TOWNS HAVE A POST IN A WALL`;
    }
    /* the kinds the note asked for: fetch work for the economy AND combat */
    {
      let kinds = {};
      for (let i = 0; i < 40; i++) { refreshBoard(t, true); for (const j of t.board.jobs) kinds[j.kind] = (kinds[j.kind] || 0) + 1; }
      R.kinds = Object.keys(kinds).sort().join(', ');
      R.bothSorts = (kinds.supply && kinds.cull && kinds.escort)
        ? 'errands, blood work and a life in your hands'
        : `!! THE BOARD IS MISSING A KIND OF JOB (${R.kinds})`;
    }

    /* ---------- 2. A SUPPLY JOB CAN BE TAKEN, FILLED AND PAID ---------- */
    {
      refreshBoard(t, true);
      let j = t.board.jobs.find(x => x.kind === 'supply');
      let guard = 0;
      while (!j && guard++ < 30) { refreshBoard(t, true); j = t.board.jobs.find(x => x.kind === 'supply'); }
      if (!j) { R.supply = '!! NO SUPPLY JOB EVER ROLLED'; }
      else {
        const goldWas = cats, repWas = t.rep || 0;
        /* The board asks for what the town is SHORT of, which is often something the player
           already carries a pile of — a perfectly good job that happens to start finished.
           Ask for seven more than is held, so the not-yet/now-done transition is the thing
           being measured rather than the starting inventory. `campHas` reads the stash, the
           wagon and every pack, so measure it in deltas and never against zero. */
        const held0 = campHas(j.item);
        j.n = held0 + 7;
        takeContract(t, j);
        R.taken = contracts.includes(j) ? 'a taken job is tracked' : '!! TAKING A JOB TRACKS NOTHING';
        R.notYet = !contractDone(j) ? 'and it is not done just because you took it' : '!! A JOB IS DONE ON ACCEPTANCE';
        stash[j.item] = (stash[j.item] || 0) + 7;        /* go and get it */
        R.fills = contractDone(j) ? 'delivering the goods completes it' : '!! DELIVERY DOES NOT COMPLETE IT';
        const heldFull = campHas(j.item);
        payContract(t, j);
        R.pays = (cats === goldWas + j.gold) ? `it pays out ${j.gold} gold`
          : `!! PAID ${cats - goldWas}, EXPECTED ${j.gold}`;
        R.standing = ((t.rep || 0) > repWas) ? `and standing at ${t.name} went ${repWas} → ${Math.round(t.rep)}`
          : '!! STANDING DID NOT MOVE';
        R.spent = (heldFull - campHas(j.item) === j.n) ? `and ${j.n} ${ITEMS[j.item].name} left the stores`
          : `!! THE STORES ONLY GAVE UP ${heldFull - campHas(j.item)} OF ${j.n}`;
        R.offBoard = !t.board.jobs.includes(j) && !contracts.includes(j)
          ? 'a paid job comes off the board' : '!! A PAID JOB IS STILL COLLECTABLE';
      }
    }

    /* ---------- 3. AN ESCORT IS A PERSON WHO WALKS A ROAD ---------- */
    {
      let j = null, guard = 0;
      while (!j && guard++ < 40) { refreshBoard(t, true); j = t.board.jobs.find(x => x.kind === 'escort'); }
      if (!j) { R.escort = '!! NO ESCORT JOB EVER ROLLED'; }
      else {
        takeContract(t, j);
        const w = chars.find(c => c.id === j.wardId);
        R.escort = w ? `${w.name} steps out of ${t.name} for ${towns[j.toTown].name}` : '!! NOBODY STEPPED OUT';
        R.wardIsVip = w && w.vip ? 'and is marked as somebody you are responsible for' : '!! THE WARD IS NOT A VIP';
        /* they must actually travel: run the contract tick and watch the distance fall */
        if (w) {
          const startD = dist(w.x, w.y, towns[j.toTown].x, towns[j.toTown].y);
          /* left alone, the ward must NOT set off — a job that walks itself pays out for
             nothing and dies on a road you were never asked to be on */
          const esc = player()[0];
          esc.x = w.x + 400; esc.y = w.y + 400;
          for (let i = 0; i < 200; i++) { contractTick(0.2); if (w.moveTarget) physics(w, 0.2); }
          const aloneD = dist(w.x, w.y, towns[j.toTown].x, towns[j.toTown].y);
          R.waitsForYou = Math.abs(aloneD - startD) < 6 ? 'they will not set off without you'
            : `!! THE WARD WALKED ${Math.round(startD - aloneD)} TILES WITH NOBODY ESCORTING THEM`;
          /* and with somebody of yours in sight, they go */
          for (let i = 0; i < 600; i++) {
            esc.x = w.x + 1; esc.y = w.y + 1;
            contractTick(0.2);
            if (w.moveTarget) { physics(w, 0.2); }
          }
          const nowD = dist(w.x, w.y, towns[j.toTown].x, towns[j.toTown].y);
          R.theyTravel = nowD < startD - 5 ? `they covered ${Math.round(startD - nowD)} tiles of road`
            : `!! THE WARD DID NOT MOVE (${Math.round(startD)} → ${Math.round(nowD)})`;
          /* and losing them is a failure with a cost */
          const repWas = t.rep || 0;
          kill(w, null);
          contractTick(0.2);
          R.losingThem = (!contracts.includes(j) && (t.rep || 0) < repWas)
            ? `a dead ward fails the job and costs ${Math.round(repWas - t.rep)} standing`
            : '!! LOSING THE WARD COSTS NOTHING';
        }
      }
    }

    /* ---------- 3b. A HEADCOUNT BOUNTY COUNTS ---------- */
    {
      /* With dens standing, the job should name one — but ask the RIGHT town. A town posts a
         bounty on the nest on its own roads, and with only two dens on a 1440-wide map
         shared by seven towns, most towns correctly have no nest to point at. Asking
         Dustport about a den outside Ironscar and calling the answer a bug is the harness
         being wrong about the rule, not the rule being wrong. */
      const owner = towns.slice().sort((a, b) =>
        dist(a.x, a.y, camps[0].x, camps[0].y) - dist(b.x, b.y, camps[0].x, camps[0].y))[0];
      const nest = rollBoardJob(owner, 'cull');
      R.cullNest = nest && nest.campId && nest.where
        ? `${owner.name} points at the nest on its own road: ${nest.title.toLowerCase()}`
        : '!! THE TOWN NEAREST A DEN DOES NOT POST A BOUNTY ON IT';
      /* and with none, it must still be able to post blood work — the day-one case */
      const held = camps.splice(0, camps.length);
      const j2 = rollBoardJob(t, 'cull');
      camps.push(...held);
      R.cull = j2 && j2.foeFac ? `with no den to point at, it asks for ${j2.n} ${j2.foe} instead`
        : '!! NO COMBAT WORK AT ALL BEFORE THE FIRST DEN EXISTS';
      if (j2 && j2.foeFac) {
        t.board.jobs.push(j2); takeContract(t, j2);
        const v = makeChar('Mark', j2.foeFac, 600, 600, { tough: 5 });
        chars.push(v);
        const by = player()[0];
        for (let i = 0; i < j2.n; i++) { v.state = 'ok'; v.blood = v.maxBlood; kill(v, by); }
        R.cullCounts = (j2.killed || 0) >= j2.n ? `${j2.killed}/${j2.n} counted where the bodies fell`
          : `!! THE COUNT DID NOT MOVE (${j2.killed || 0}/${j2.n})`;
        R.cullPays = contractDone(j2) ? 'and the count completes the job' : '!! THE COUNT DOES NOT COMPLETE IT';
        const iv = chars.indexOf(v); if (iv >= 0) chars.splice(iv, 1);
        const ic = contracts.indexOf(j2); if (ic >= 0) contracts.splice(ic, 1);
        const ib = t.board.jobs.indexOf(j2); if (ib >= 0) t.board.jobs.splice(ib, 1);
      }
    }

    /* ---------- 4. THE BODYGUARD ORDER NAMES A WARD, OUT LOUD ---------- */
    {
      const mine = player().filter(c => c.state === 'ok');
      const g = mine[0], w = mine[1] || mine[0];
      /* the old failure: set the job on a lone unit and nothing happened, silently */
      const solo = mine[0];
      solo.guardTarget = null;
      const picked = wardFor(solo, []);
      R.lonePick = picked && picked !== solo ? `a lone unit set to guard finds ${picked.name}`
        : '!! A LONE UNIT SET TO BODYGUARD STILL GUARDS NOBODY';
      if (g !== w) {
        g.guardTarget = null;
        const ok = setWard(g, w);
        R.setWard = (ok && g.guardTarget === w && g.job === 'guard')
          ? `${g.name} is set to guard ${w.name}, job and all` : '!! SETTING A WARD DID NOT TAKE';
      } else R.setWard = 'only one body available — skipped';
    }

    /* ---------- 5. DIRECTIONS ARE DIRECTIONS ---------- */
    {
      const here = towns[0], far = towns[towns.length - 1];
      const hint = placeHint(here.x, here.y, far.x, far.y);
      const compass = ['north', 'south', 'east', 'west'];
      R.hint = hint;
      R.hintHasBearing = compass.some(c => hint.includes(c))
        ? 'a job says which way to walk' : '!! NO BEARING IN THE HINT';
      /* it must be RIGHT, not merely present */
      const dx = far.x - here.x, dy = far.y - here.y;
      const wantEW = dx > 0 ? 'east' : 'west', wantNS = dy > 0 ? 'south' : 'north';   /* screen-north is -y */
      R.hintIsTrue = (Math.abs(dx) > Math.abs(dy) ? hint.includes(wantEW) : hint.includes(wantNS))
        ? 'and the bearing points at the thing' : `!! THE BEARING IS WRONG (${hint} for dx ${Math.round(dx)}, dy ${Math.round(dy)})`;
      /* the scholar quests the note actually complained about */
      const sc = chars.find(c => c.scholar);
      if (sc) {
        let sited = 0, withBearing = 0;
        for (let i = 0; i < 80; i++) {
          const q = rollQuest(sc);
          if (q.kind !== 'bounty' && q.kind !== 'seal') continue;   /* fetch work has no address */
          sited++;
          if (q.where && compass.some(c => q.ask.includes(c))) withBearing++;
        }
        R.scholarQuests = sited === 0 ? '!! NO SITED SCHOLAR JOB EVER ROLLED — nowhere to send anyone'
          : withBearing === sited ? `all ${sited} sited scholar jobs name a direction`
          : `!! ${sited - withBearing} OF ${sited} SITED SCHOLAR JOBS STILL SAY "OUT PAST THE FLATS"`;
      }
    }

    /* ---------- 6. THE SQUAD TALKS ABOUT THE SITUATION IT IS IN ---------- */
    {
      const c = player().find(o => !o.undead && o.conviction) || player()[0];
      const before = c.conviction;
      /* no larder, and somebody going hungry: they should say so */
      for (const k of ['meat', 'fruit', 'fish']) stash[k] = 0;
      for (const o of player()) if (!o.undead) o.hunger = 8;
      const hits = situationsFor(c);
      R.reads = hits.length ? `the squad can see: ${hits.join(', ')}` : '!! THE SQUAD NOTICES NOTHING';
      R.readsHunger = (hits.includes('starving') || hits.includes('nofood'))
        ? 'starving and an empty larder both register' : '!! HUNGER GOES UNREMARKED';
      /* and personality changes what gets said about the same facts */
      let byConv = {};
      for (const k of ['cruel', 'compassion', 'devout']) {
        c.conviction = k;
        const said = new Set();
        for (let i = 0; i < 120; i++) { const s = situationBark(c); if (s) said.add(s); }
        byConv[k] = said;
      }
      c.conviction = before;
      const cruelOnly = [...byConv.cruel].filter(s => !byConv.compassion.has(s));
      R.personality = cruelOnly.length
        ? `${cruelOnly.length} lines a cruel one says that a compassionate one never does`
        : '!! CONVICTION DOES NOT CHANGE WHAT THEY SAY';
      /* raising the dead, and a yard full of them */
      mood.raise = nowH();
      R.readsRaising = situationsFor(c).includes('raised')
        ? 'raising the dead gets remarked on' : '!! NOBODY MENTIONS THE RAISING';
      /* and it must not become a status readout: the opinions still get a turn */
      const seen = new Set();
      for (let i = 0; i < 400; i++) { const s = squadBark(c); if (s) seen.add(s); }
      const idle = (CONV_TALK[c.conviction] || {});
      const anyIdle = Object.values(idle).flat().some(s => seen.has(s));
      R.stillOpinions = anyIdle ? 'and they still tell you what they think of you'
        : '!! THE SQUAD HAS BECOME A STATUS READOUT';
    }

    /* ---------- 7. AND IT ALL SURVIVES A SAVE ---------- */
    {
      refreshBoard(t, true);
      const j = t.board.jobs.find(x => x.kind === 'supply') || t.board.jobs[0];
      takeContract(t, j);
      const wasId = j.id, wasN = contracts.length;
      restore(JSON.parse(JSON.stringify(snapshot())));
      const t2 = towns[0];
      const back = t2.board && t2.board.jobs.find(x => x.id === wasId);
      R.savedBoard = back ? 'the post survives a save' : '!! THE POST IS GONE AFTER A LOAD';
      R.savedTaken = (contracts.length === wasN && contracts.includes(back))
        ? 'and the job you took is still the job on the board'
        : '!! THE CONTRACT LIST AND THE BOARD CAME BACK AS DIFFERENT OBJECTS';
    }
    return R;
  });

  console.log('=== THE POST ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(16) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THERE IS WORK IN TOWN, AND SOMEBODY TO KEEP ALIVE'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 5).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
