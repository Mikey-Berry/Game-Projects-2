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
      /* an untaken job — earlier blocks have already taken, paid and botched several, and
         re-taking one of those measures the harness rather than the save */
      const j = t.board.jobs.find(x => !x.taken && x.kind === 'supply')
             || t.board.jobs.find(x => !x.taken);
      R.freshJob = j ? `taking "${j.title}" for the save test` : '!! NOTHING UNTAKEN LEFT ON THE BOARD';
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
    /* ---------- 6. AND THE TOWN SELLS YOU ITS COUNTRY ----------
       "Maps as a purchasable item would be handy since the world is so big now." The world is
       1440 tiles across and the only way to learn any of it was to walk it. The thing that
       must not happen is the chart quietly handing over LIVE sight: `vis` has three states,
       and 2 means a body of yours is standing there looking at it right now. A chart is paper.
       It gives you the shape of the ground and nothing about who is on it. */
    {
      const t2 = towns[1] || towns[0];
      const count = (want) => { let n = 0; for (let i = 0; i < vis.length; i++) if (want(vis[i])) n++; return n; };
      const known0 = count(v => v > 0), live0 = count(v => v === 2);
      cats = 5000;
      const gold0 = cats;
      const opened = revealMap(t2.x, t2.y, MAP_R);
      t2.mapSold = true; cats -= MAP_PRICE;
      R.chartOpens = opened > 400 ? `the ${t2.name} chart opens ${opened} tiles`
        : `!! THE CHART OPENED ${opened} TILES`;
      R.chartExact = count(v => v > 0) - known0 === opened
        ? 'and the known world grew by exactly that much' : '!! THE CHART OPENED GROUND IT DID NOT COUNT';
      R.chartIsPaper = count(v => v === 2) === live0
        ? 'without granting one tile of live sight' : '!! A CHART HANDED OUT LIVE SIGHT';
      /* which means the people standing on the charted ground are still nobody's business */
      {
        const onIt = chars.filter(c => c.faction !== 'player' && dist(c.x, c.y, t2.x, t2.y) < MAP_R - 2);
        R.chartHidesPeople = !onIt.length ? 'nobody out there to check'
          : onIt.every(c => visAt(c.x, c.y) !== 2) ? `${onIt.length} bodies on it, and the chart shows you none of them`
          : '!! THE CHART SHOWED YOU WHO WAS THERE';
      }
      R.chartCosts = gold0 - cats === MAP_PRICE ? `it costs ${MAP_PRICE}` : `!! WRONG PRICE (${gold0 - cats})`;
      R.chartIsOnce = revealMap(t2.x, t2.y, MAP_R) === 0
        ? 'and a second copy of the same chart opens nothing' : '!! THE SAME CHART OPENED MORE GROUND';
      /* it has to survive the road home. `packExplored` stores vis>0, so charted ground rides
         in the same bitmap as walked ground — and restoring re-stamps live vision around the
         squad, so the count can only ever go UP. Asserting equality here reported a loss of
         -7 tiles, which was seven tiles gained. */
      {
        const k2 = count(v => v > 0);
        const snap = JSON.parse(JSON.stringify(snapshot()));
        restore(snap);
        const k3 = count(v => v > 0);
        R.chartSaved = k3 >= k2 ? 'the charted country survives a save'
          : `!! ${k2 - k3} TILES OF CHART WERE LOST ON LOAD`;
        R.chartSoldOnce = (towns[1] || towns[0]).mapSold
          ? 'and the town remembers selling it' : '!! THE TOWN WILL SELL THE SAME CHART AGAIN';
      }
    }


    /* ============================================================ WHAT THE WORK IS WORTH
       "Escort missions pay INSANELY well when it's very far away. This is good as they are
       indeed the riskiest mission type, but their pay dwarfs every other. (Sometimes it's
       literally just more profitable to sell the item they are asking for at their local
       market than to do the hand-in quest.)"

       Both halves are arithmetic, so both are measurable rather than felt. Roll a great many
       of each kind across every town and look at the distribution — one job's purse says
       nothing, and the complaint is about the SPREAD. */
    {
      const by = { supply: [], cull: [], escort: [] };
      let worseThanSelling = 0, supplyRolls = 0;
      const worst = [];
      for (const t2 of towns) for (let i = 0; i < 60; i++)
        for (const k of ['supply', 'cull', 'escort']) {
          const j = rollBoardJob(t2, k);
          if (!j) continue;
          by[j.kind].push(j.gold);
          if (j.kind === 'supply') {
            supplyRolls++;
            const sale = priceSell(t2, j.item) * j.n;
            if (j.gold < sale) { worseThanSelling++; if (worst.length < 3) worst.push(`${j.n} ${j.item} pays ${j.gold}, sells for ${sale}`); }
          }
        }
      const med = (a2) => { const b2 = a2.slice().sort((x, y) => x - y); return b2[b2.length >> 1]; };
      const mSup = med(by.supply), mCull = med(by.cull), mEsc = med(by.escort);
      R.purses = `median purse — supply ${mSup}, bounty ${mCull}, escort ${mEsc}`;

      /* ---------- A HAND-IN MUST BEAT A SALE ----------
         A fetch reward under the local sale price of the fetched item is a quest strictly
         worse than ignoring it. On the build before this, 37 of 420 rolled supply jobs were
         — every one of them iron, where a high base price and a high town multiplier together
         beat a flat fraction of base. */
      R.aHandInBeatsASale = worseThanSelling === 0
        ? `and not one of ${supplyRolls} supply jobs pays less than selling the goods to the same town`
        : `!! ${worseThanSelling} OF ${supplyRolls} SUPPLY JOBS PAY LESS THAN SELLING: ${worst.join('; ')}`;

      /* ---------- THE RISKIEST JOB PAYS BEST ----------
         Kept as a floor as well as a ceiling: the fix for "escorts pay too much" must not
         become "escorts are not worth the risk", which is the same complaint upside down. */
      R.theEscortStillPaysBest = mEsc > mCull
        ? `an escort is still the best purse on the board — ${(mEsc / mCull).toFixed(1)}x a nest bounty`
        : `!! THE RISKIEST JOB NO LONGER PAYS BEST (escort ${mEsc}, bounty ${mCull})`;
      /* ---------- BUT IT DOES NOT DWARF THE BOARD ----------
         Before: escort 12402 against a bounty's 980 and a supply run's 230 — twelve times the
         one and fifty-four times the other, so nothing else on the post was worth reading. */
      R.butItDoesNotDwarfTheBoard = (mEsc < mCull * 4 && mEsc < mSup * 15)
        ? `and the rest of the board is still worth reading — ${(mEsc / mSup).toFixed(0)}x a supply run, not fifty`
        : `!! ESCORT DWARFS THE BOARD (${(mEsc / mCull).toFixed(1)}x a bounty, ${(mEsc / mSup).toFixed(0)}x a supply run)`;
    }

    /* ============================================================ AND YOU GET PAID FOR IT
       "Sometimes escort missions fail to deliver upon the payment if I'm a few days late to
       return. Which is a really sucky feeling after a long and painful mission."

       Two expiry rules disagreed. `contractTick` deliberately exempts an arrived contract, so
       the contract survived; `refreshBoard` filtered on `day <= j.expires` alone, so the job
       came off the BOARD and the walk back to collect found nothing nailed up. The tick
       protected it and the board tore it down. */
    {
      const t2 = towns[0];
      /* THE CLOCK STARTS WHEN YOU ACCEPT. It used to be stamped when the job was ROLLED, so a
         notice nailed up for nine of its twelve days handed you three. */
      const j = rollBoardJob(t2, 'supply');
      j.expires = day + 1;
      t2.board = t2.board || { day: day, jobs: [] };
      t2.board.jobs.push(j);
      takeContract(t2, j);
      R.theClockStartsOnAccepting = j.expires >= day + CONTRACT_DAYS
        ? `taking a job re-stamps its deadline — ${j.expires - day} days from now, not from whenever it was posted`
        : `!! A JUST-ACCEPTED JOB EXPIRES IN ${j.expires - day} DAY(S)`;

      /* AND A JOB YOU HAVE FINISHED IS OWED ITS PURSE WHENEVER YOU TURN UP. */
      addItem(j.item, j.n + 2);
      const wasDone = contractDone(j);
      j.expires = day - 3;                         /* days late, and the work already done */
      const dayWas = day;
      contractTick(1 / 30);
      refreshBoard(t2, true);
      const stillListed = t2.board.jobs.includes(j);
      const stillLive = contracts.includes(j) && !j.failed;
      day = dayWas;
      R.finished = `work done: ${wasDone}; three days past the deadline — on the board: ${stillListed}, still live: ${stillLive}`;
      R.aFinishedJobIsStillOwed = (wasDone && stillListed && stillLive)
        ? 'and a job whose work is already done survives its deadline on both the board and the ledger — you can always walk back for the purse'
        : `!! A FINISHED JOB WAS VOIDED FOR BEING LATE (listed ${stillListed}, live ${stillLive})`;

      /* the control: an UNfinished job past its date is still allowed to go stale, or the
         deadline stops meaning anything at all */
      const k2 = rollBoardJob(t2, 'supply');
      k2.item = 'crown'; k2.n = 99;                /* nothing the stores can satisfy */
      t2.board.jobs.push(k2);
      takeContract(t2, k2);
      k2.expires = day - 3;
      contractTick(1 / 30);
      R.butAnUnfinishedOneStillGoesStale = !contracts.includes(k2)
        ? 'while a job you never did still goes stale on time — the deadline still means something'
        : '!! AN UNFINISHED JOB SURVIVED ITS DEADLINE';
      const bi = t2.board.jobs.indexOf(j); if (bi >= 0) t2.board.jobs.splice(bi, 1);
      const ci = contracts.indexOf(j); if (ci >= 0) contracts.splice(ci, 1);
    }

    return R;
  });

  /* ---------- AND YOU CAN SEE WHERE IT IS ----------
     Reported from play: "I cannot find where to get jobs in a town. Seems impossible to find
     right now." Every assertion above passed throughout, because all of them are about the
     board's STATE and none of them about whether a player can locate two posts and a plank
     among two hundred boxes.
     This has to be a pixel test. Nothing else works: the first mark written for it was a '✎',
     which is a perfectly good character that this canvas renders as EMPTY SPACE, because the
     overlay is set to bare `monospace` and takes whatever font the machine happens to have.
     Every state check in the file passed while the mark was invisible. So: point the camera
     at the plaza, read the pixels where the mark should be, and require them to differ from
     the same pixels with the mark suppressed.

     It is TWO measurements, because the rule has two halves and the fix for the first note
     broke the second. Drawing the mark on ground the squad had merely walked made the post
     findable — and put seven of them on the map at once, permanently, which came back as
     "seeing the quest boards marked across the entire map is a bit distracting." So the mark
     is gated on LIVE sight: legible while somebody of yours can see the square, and gone the
     moment they walk away. A test that only measured the first half is what let the second
     one ship. */
  const seen = await p.evaluate(async () => {
    /* PAUSE, or the control is measuring pedestrians. Townspeople keep walking between the
       two grabs, and a plaza full of them moving one pixel each was 78 pixels of difference
       with nothing drawn at all — noise the size of a small mark. */
    /* DEBUG VISION OFF. `visAt` returns 2 for everything while `debugSeeAll` is set, which is
       the exact value the mark is gated on — so a probe left with it on answers the question
       with the answer switched on, and passes just as happily against a build where the mark
       never draws at all. */
    hour = 12; debugSeeAll = false; paused = true; if(typeof syncPauseBtn === 'function') syncPauseBtn();
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    const t = towns[0];
    refreshBoard(t, true);
    const bp = townBoardPos(t);
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    camX = camSX = bp.x; camY = camSY = bp.y;
    camDist = camDistTarget = 13; camPitch = camPitchT = 0.62; camYaw = camYawT = 0.4;
    camFollow = false; selected = [];
    /* the camera eases toward its target — reading w2s in the same tick it was set projects
       from wherever the camera happened to be, which off a start position is off-screen */
    await frame(); await frame(); await frame();

    /* The measurement itself: read the pixels where the mark belongs, then suppress THE MARK
       AND NOTHING ELSE by making the one projection call it depends on come back null.
       Emptying `towns` was the first attempt and it was not a control — it also takes away the
       town's name, drawn from a different call at a different height, and left 78 pixels of
       difference with the mark already invisible, enough to pass a test of its own. */
    const q = w2s(bp.x, bp.y, groundY(bp.x, bp.y) + 2.05);
    if (!q) return { fail: 'the board does not project to the screen at all' };
    const dpr = cx.canvas.width / cx.canvas.clientWidth || 1;
    const grab = () => Array.from(cx.getImageData((q.x - 10) * dpr, (q.y - 20) * dpr, 20 * dpr, 24 * dpr).data);
    const measure = async () => {
      await frame(); await frame(); await frame();
      const withMark = grab();
      const realW2S = window.w2s;
      window.w2s = function(x, y, z){
        if (Math.abs(x - bp.x) < 1e-6 && Math.abs(y - bp.y) < 1e-6) return null;
        return realW2S.apply(this, arguments);
      };
      await frame(); await frame();
      const without = grab();
      window.w2s = realW2S;
      await frame();
      let diff = 0;
      for (let i = 3; i < withMark.length; i += 4) if (withMark[i] !== without[i]) diff++;
      for (let i = 0; i < withMark.length; i += 4) if (Math.abs(withMark[i] - without[i]) > 24) diff++;
      return diff;
    };

    /* ---------- A. SOMEBODY IS LOOKING AT THE SQUARE ---------- */
    for(const c of player()){ c.x = bp.x; c.y = bp.y + 3; }
    computeVision(); computeVision();
    const liveVis = visAt(bp.x, bp.y);
    const diffNear = await measure();

    /* ---------- B. THEY HAVE WALKED AWAY AGAIN ----------
       This is the half a note came back about. Marking a post on ground the squad had merely
       WALKED made every one of the seven plazas visible from anywhere on the map at once, and
       that read as clutter rather than as help. Remembered ground must draw NOTHING. */
    for(const c of player()){ c.x = bp.x + 120; c.y = bp.y + 120; }
    computeVision(); computeVision();
    const memVis = visAt(bp.x, bp.y);
    const diffFar = await measure();

    return { diffNear, diffFar, liveVis, memVis,
             px: Math.round(20 * dpr * 24 * dpr), dbg: debugSeeAll,
             whoIsNear: chars.filter(c => c.faction === 'player' && c.state !== 'dead'
                          && Math.hypot(c.x - bp.x, c.y - bp.y) < 12).map(c => c.name).slice(0, 6) };
  });
  /* 250 out of a 480-pixel box, and both ends of that are measured. Frame-to-frame noise with
     the sim paused is exactly 0, so the floor is not jitter — it is that a MISSING GLYPH IS
     NOT NOTHING. The '✎' this started as draws a tofu placeholder worth 78 pixels: invisible
     to a player at any honest zoom, and enough to satisfy any threshold set just above zero.
     The drawn mark is 476. The bar goes between them, nearer the top, because the property is
     "a player can see it" and not "some ink reached the canvas". */
  /* and the numbers that say it was a fair test */
  out.visionState = `debugSeeAll=${seen.dbg}, live ${seen.liveVis}, remembered ${seen.memVis}`;
  out.markSightState = (seen.liveVis === 2 && seen.memVis === 1)
    ? 'the plaza went from live sight to remembered, which is the whole question'
    : `!! THE PROBE NEVER CHANGED WHAT THE SQUAD COULD SEE (${seen.liveVis} then ${seen.memVis})`;
  out.markIsOnScreen = seen.fail ? '!! ' + seen.fail
    : seen.diffNear >= 250 ? `with somebody watching the square, the post wears a mark you can see — ${seen.diffNear} pixels of one`
    : `!! THE MARK ON THE POST IS NOT LEGIBLE (${seen.diffNear} pixels of ${seen.px} — a tofu box is 78)`;
  out.markIsNotAMap = seen.fail ? '' 
    : seen.diffFar <= 40 ? `and once they walk away it is gone again — ${seen.diffFar} pixels on remembered ground`
    : `!! THE POST IS MARKED ACROSS THE WHOLE MAP (${seen.diffFar} pixels with nobody in sight of it)`;

  console.log('=== THE POST ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THERE IS WORK IN TOWN, AND SOMEBODY TO KEEP ALIVE'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 5).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
