#!/usr/bin/env node
/* A named origin, end to end.
 *
 * An origin is the one thing in this game that can be completely broken and never noticed:
 * it runs once, at the click of a button, before anybody is watching, and if it throws
 * halfway through you get a half-built life that looks like a design choice.
 *
 *   node tools/origin.js [game.html] [originKey]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const KEY = process.argv[3] || 'lyonart';

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 220)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 220)); });
  const URL = 'file://' + gamePath(process.argv[2]);
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  /* `all` sweeps every listed origin. Each one gets a fresh page: applyCreation clears the
     player squad but not the world it just wrote into — a search opened by one origin would
     still be open for the next, and the verdict would be a lie. */
  const keys = KEY === 'all' ? await p.evaluate(() => Object.keys(ORIGINS)) : [KEY];
  const run = (key) => p.evaluate((key) => {
    const R = {};
    R.listed = !!ORIGINS[key] && ORIGINS[key].label;
    const me = applyCreation('human', 'dark', key);

    const mine = chars.filter(c => c.faction === 'player');
    /* every origin, named or not, owes the same three things: somebody to play, a squad
       standing on open ground, and a camera looking at them. The `soldier` branch failed
       all three for months behind a duplicated `else if` head and nobody noticed, because
       nothing else in the suite ever clicks Start with a particular origin selected. */
    R.you = me && me.name ? me.name : 'NOBODY TO PLAY';
    R.standing = mine.length && mine.every(c => Number.isFinite(c.x) && Number.isFinite(c.y) && !isBlocked(c.x | 0, c.y | 0)) ?
      'all on open ground' : 'SOMEBODY IS IN A WALL';
    R.camera = (me && Math.abs(camX - me.x) < 0.01 && Math.abs(camY - me.y) < 0.01) ? 'on them' : 'CAMERA ELSEWHERE';
    if (key === 'saga') {
      R.squad = mine.length + ' of them';
      R.cats = cats;
      const him = me;
      R.he = him && him.name === 'Saga Wordsworth' ? him.name : 'THE GODKILLER IS MISSING';
      /* ---------- HE DOES NOT START ALONE ----------
         Reported from play: the start reads "obviously stronger than a basic starter, but not
         really worth it for the disadvantages of not taking another path." The disadvantages
         are deliberate; paying for them with a single body was not. One body is a run that
         ends the first time it goes down, and Lyonart's start has seven.
         Everything asserted about Czarina here is a thing that would silently stop being true
         and leave the origin still booting: she can be alive but not standing next to him, or
         standing next to him with no medicine, or a Hollow who cannot do the one thing Hollows
         are here to make up for. */
      {
        const cz = chars.find(c => c.name === 'Czarina');
        R.czarina = cz ? 'Czarina walked out with him' : '!! CZARINA IS NOT THERE';
        if (cz) {
          R.czLiving = (!cz.undead && cz.state === 'ok') ? 'living, and on her feet' : '!! CZARINA IS NOT A LIVING BODY';
          R.czHollow = cz.race === 'hollow' ? 'a Hollow, like him' : `!! CZARINA IS A ${String(cz.race).toUpperCase()}`;
          R.czFights = (cz.stats.atk >= 18 && cz.stats.def >= 20 && cz.stats.blades >= 25)
            ? `skilled in combat — atk ${cz.stats.atk}, def ${cz.stats.def}, blades ${Math.round(cz.stats.blades)}`
            : `!! CZARINA CANNOT FIGHT (atk ${cz.stats.atk}, def ${cz.stats.def})`;
          /* she is the hands he does not have: a Hollow with no medic is two of the same
             problem rather than a squad */
          R.czTends = cz.stats.medic >= 8 ? `and she can bandage (medic ${cz.stats.medic})`
            : `!! NOBODY IN THIS START CAN BANDAGE (${cz.stats.medic})`;
          R.czGuards = (cz.job === 'guard' && cz.guardTarget === him)
            ? 'set to stand between him and whatever comes' : '!! CZARINA IS NOT GUARDING HIM';
          R.czStands = !isBlocked(cz.x, cz.y, cz.floor || 0) && dist(cz.x, cz.y, him.x, him.y) < 6
            ? 'and she starts beside him, on open ground'
            : `!! CZARINA STARTS ${isBlocked(cz.x, cz.y, cz.floor || 0) ? 'INSIDE GEOMETRY' : Math.round(dist(cz.x, cz.y, him.x, him.y)) + ' TILES AWAY'}`;
          /* a face nobody wrote is a hash-rolled stranger wearing her name */
          R.czLooks = (cz.face === 'czarina' && FACES.czarina && FACES.czarina.hair)
            ? 'dark-haired, and lit behind the eyes like him' : '!! CZARINA HAS NO FACE OF HER OWN';
        }
        R.twoOfThem = mine.filter(c => !c.undead && c.state !== 'dead').length >= 2
          ? 'two living bodies, so one of them going down is not the end of the run'
          : '!! THE GODKILLER STILL STARTS ALONE';
      }
      /* he is a Hollow whatever the picker said — the race is not a choice on this one */
      R.race = him && him.race === 'hollow' ? 'hollow (overrode the picker)' : 'NOT A HOLLOW';
      /* already one rung up: the thirty percent is spent, the ceiling is raised, and the
         things beyond take more from him. Tier I must be a fact, not something to buy. */
      R.awake = (him && him.hollowTier === 1) ? 'awakened, tier I' : 'NOT AWAKENED';
      R.ceiling = (him && skillCap(him) === 125) ? 'ceiling 125' : 'WRONG CEILING ' + (him && skillCap(him));
      R.gift = him && him.gift === 'dust' ? 'dust' : 'WRONG GIFT';
      R.dustAdept = (him && attOf(him, 'dust') === 2) ? 'adept of the dust art' : 'NOT ADEPT';
      R.canMaster = (him && attCap(him, 'dust') === 3) ? 'dust is his to master' : 'CANNOT MASTER DUST';
      /* The godkiller bonus is the whole premise, so measure it rather than trusting it. It
         lives in applyDamage, NOT in mitigate — the first version of this probe called
         mitigate and reported the premise broken when it was only looking in the wrong
         place. Two identical targets, one of them a thing from beyond, and read the blood.
         Note makeChar does not push to `chars`; these two never join the world. */
      const twin = (faction) => {
        const t = makeChar('probe', faction, him.x + 3, him.y, {atk: 5, def: 5, tough: 20});
        t.blood = 4000; t.maxBlood = 4000; t.armor = null;   /* must not die mid-probe */
        return t;
      };
      const beyond = twin('gaunt'); beyond.gauntKind = 'gaunt'; beyond.beast = true;
      const living = twin('bandit');
      /* the hit lands on the PART, not on the blood — blood only follows later, through
         bleed. Read parts.chest.hp, which is where applyDamage actually subtracts. */
      applyDamage(him, beyond, 'chest', 100, 'cut', false, true);
      applyDamage(him, living, 'chest', 100, 'cut', false, true);
      const hitG = 100 - beyond.parts.chest.hp, hitP = 100 - living.parts.chest.hp;
      R.godkiller = (hitG > hitP * 1.2) ?
        'hits the things beyond ' + Math.round((hitG / hitP - 1) * 100) + '% harder' :
        'GODKILLER BONUS NOT REACHING THE MATH (' + hitG.toFixed(1) + ' vs ' + hitP.toFixed(1) + ')';

      /* --- the descent --- */
      R.descentOpen = mother.on ? 'open' : 'NOT STARTED';
      const cv = motherCave();
      R.cellChosen = cv ? 'a sealed bunker under a mountain' : 'NO CELL';
      /* the price must not already be payable: the next rung costs him the dust */
      R.priceStillOwed = (him && him.hollowTier < 2) ? 'still a rider' : 'ALREADY FINISHED (should not)';

      /* --- the pull: vague far off, sharp in the right hole, wrong in the wrong one --- */
      if (cv) {
        const back = { x: him.x, y: him.y, f: him.floor || 0 };
        const readAt = (x, y, f) => {
          him.x = x; him.y = y; him.floor = f; him.bubble = null;
          selected = [him];
          listenForMother();
          return (him.bubble && him.bubble.text) || '';
        };
        const far = readAt(cv.mouth.x + 120, cv.mouth.y, 0);
        const nearMouth = readAt(cv.mouth.x + 2, cv.mouth.y + 2, 0);
        R.pullFar = /Almost nothing|out there/.test(far) ? 'faint at distance' : 'FAR READING WRONG: ' + far.slice(0, 40);
        R.pullNear = /Under my feet|Closer/.test(nearMouth) ? 'unmistakable at the mouth' : 'NEAR READING WRONG: ' + nearMouth.slice(0, 40);
        R.pullBearing = /north|south|east|west/.test(far) ? 'an adept gets a bearing' : 'NO BEARING FOR AN ADEPT';
        /* the wrong hole must say so, or the sense solves the map for free */
        const other = caves.find(c2 => c2.id !== cv.id);
        if (other && other.rooms.length) {
          const rm = other.rooms[0];
          R.wrongHole = /Wrong hole/.test(readAt(rm.cx, rm.cy, rm.f)) ? 'the wrong hole reads as wrong' : 'WRONG HOLE READS AS RIGHT';
        }
        him.x = back.x; him.y = back.y; him.floor = back.f;

        /* --- reaching her --- */
        const v = cv.vault;
        R.vaultAtBottom = (v && v.f === -cv.depth) ? 'at the bottom, ' + cv.depth + ' floors down' : 'NO VAULT';
        if (v) {
          him.x = v.x; him.y = v.y; him.floor = v.f; him.bubble = null;
          for (let i = 0; i < 20 && !mother.spoken; i++) motherTick(3);
          R.sheSpoke = mother.spoken ? 'she is awake behind it' : 'SILENCE AT THE SEAL';
          R.asARider = (him.bubble && him.bubble.text || '').slice(0, 44) + '...';
          R.priceNamed = mother.toldPrice ? 'the rite is named as the price' : 'PRICE NEVER NAMED';
          /* she must read the man, not a quest step: finish him and the seal answers */
          mother.spoken = false; him.hollowTier = 2; him.bubble = null;
          for (let i = 0; i < 20 && !mother.spoken; i++) motherTick(3);
          R.asFinished = (him.bubble && him.bubble.text || '').slice(0, 44) + '...';
          R.sheReadsHim = (R.asFinished !== R.asARider) ? 'she reads what he became' : 'SAME LINE REGARDLESS';
          him.hollowTier = 1;
        }
      }
      /* --- a nine-hundred-year wait must survive a save --- */
      const cellWas = mother.caveId;
      restore(JSON.parse(JSON.stringify(snapshot())));
      R.descentKept = (mother.on && mother.caveId === cellWas && mother.found) ?
        'the cell holds through a save' : 'DESCENT RESET BY LOAD';
      return R;
    }
    if (key !== 'lyonart') { R.squad = mine.length + ' of them'; R.cats = cats; return R; }

    const him = mine.find(c => c.name && c.name.indexOf('Lyonart') === 0);
    R.he = him ? him.name : 'THE PRINCE IS MISSING';
    R.squad = mine.length + ' of them';
    R.household = mine.filter(c => c.undead).length + ' dead following';
    R.allBound = mine.filter(c => c.undead).every(c => c.master === him) ? 'all sworn to him' : 'SOME ANSWER TO NOBODY';
    /* THE LIVING ONE. Six dead cannot bandage, study, craft, eat or be spoken to by a town,
       so an all-undead retinue leaves this origin unable to do half of what the game asks. */
    {
      const alive = mine.filter(c => !c.undead && c !== him);
      const att = alive.find(c => c.attendant);
      R.attendant = att ? `${att.name}, alive, ${Math.floor(att.stats.medic)} medic` : '!! NO LIVING COMPANION';
      R.attendantGuards = att && att.guardTarget === him && att.job === 'guard'
        ? 'set to guard the prince from the first frame' : '!! THE ATTENDANT GUARDS NOBODY';
      R.attendantStands = att && !isBlocked(att.x, att.y) ? 'on open ground' : '!! SPAWNED IN GEOMETRY';
    }
    R.crown = (campHas('crown') >= 1) ? 'has the Sunken Crown' : 'NO CROWN';
    R.cats = cats;
    R.gift = him && him.gift === 'dark' ? 'dark' : 'WRONG GIFT';

    /* the crown must be a key he cannot yet turn: the rite still wants its price */
    R.riteStillGated = (him && him.stats.magic < 25) ? 'MAG ' + Math.floor(him.stats.magic) + ' — not yet' :
      'ALREADY QUALIFIES (should not)';

    /* --- the search --- */
    R.searchOpen = search.on ? 'open' : 'NOT STARTED';
    const ts = towns.slice(0, 4);
    for (const t of ts) askAfterLyre(t, t.leader);
    R.afterThree = search.found ? 'they placed her after ' + search.leads : 'NO LEAD AFTER ' + search.leads;
    /* asking the same hall twice must not count */
    const l0 = search.leads;
    askAfterLyre(ts[0], ts[0].leader);
    R.noDoubleDipping = search.leads === l0 ? 'a hall tells you once' : 'ASKED TWICE FOR CREDIT';

    /* --- finding her: THREE LEGS, not one ---
       The halls say where she was PUT OUT. What is out there is a cairn and a field of tears
       closed by hand — she lived there for years and moved on. A scholar keeps a ledger of the
       fields that stopped giving up marrow and names the one that went quiet last, and that is
       where she is standing now. Walking to the first field must NOT produce her. */
    const site = corpseSites[search.siteId];
    R.siteChosen = site ? 'a corpse-field' : 'NO SITE';
    if (site && him) {
      him.x = site.x; him.y = site.y;
      for (let i = 0; i < 20 && !search.cairn; i++) lyreTick(4);
    }
    R.theCairn = search.cairn ? 'a cairn and a field of sealed tears' : 'NO CAIRN AT THE FIRST FIELD';
    R.notThereYet = !search.met ? 'and she is not standing in it' : 'THE FIRST FIELD HANDS HER OVER';
    /* the scholar's ledger */
    const site2 = corpseSites[search.siteId2 >= 0 ? search.siteId2 : search.siteId];
    if (him) {
      const sc = makeChar('Ledger Scholar', 'town', him.x + 2, him.y, { magic: 30 });
      sc.scholar = true; sc.neutral = true; chars.push(sc);
      tellScholarOfTheCairn(sc);
    }
    R.theLedger = search.told ? 'a scholar names the field that went quiet last' : 'NO LEDGER, NO SECOND LEG';

    /* ---------- CAN IT ACTUALLY BE FOUND? ----------
       Everything above teleports the player onto the exact tile, which is why this harness
       passed for months while the quest was, in play, unfinishable: "I've had my risen scour
       every inch and CANNOT find her." The mechanism was never broken. The DIRECTIONS were.
       `placeHint` only names a landmark when a town is within 70 tiles of the target, and the
       fields the exiled were put out at are deliberately further out than that — so for
       exactly the destinations that need directing to, it fell through to "east of here", and
       "east" in a world 1440 tiles across is not a direction, it is a quarter of the map.
       Worse, the bearing was baked into the journal line at the moment the scholar spoke, off
       wherever the player happened to be standing, so it was wrong the moment they walked. */
    {
      const th = threads.find(t => t.key === 'lyre');
      R.theStepIsPlaced = th && th.mark && Math.abs(th.mark.x - site2.x) < 1 && Math.abs(th.mark.y - site2.y) < 1
        ? 'the journal step carries the field\'s coordinates, not a frozen sentence'
        : '!! THE LYRE STEP CARRIES NO PLACE — THE BEARING IS BAKED IN AND GOES STALE';
      if (th && th.mark) {
        /* the live leg has to move when the player does, and has to name a fixed anchor */
        him.x = 60; him.y = 60;
        const a = wayTo(th.mark.x, th.mark.y);
        him.x = W - 60; him.y = H - 60;
        const b2 = wayTo(th.mark.x, th.mark.y);
        R.bearingIsLive = a !== b2
          ? 'and the bearing is worked out fresh from where you are standing'
          : '!! THE BEARING READS THE SAME FROM OPPOSITE CORNERS OF THE MAP';
        R.bearingNamesAPlace = towns.some(t => a.includes(t.name))
          ? `and it names a town to steer by — "${a}"`
          : `!! THE DIRECTIONS NAME NO PLACE AT ALL: "${a}"`;
      }
      /* And the mark has to be WRITTEN to a save, or reloading loses the directions. Read the
         snapshot object rather than restoring from it: `restore` rebuilds `chars`, which
         detaches every reference this harness is still holding — the first version did the
         full round trip here and knocked over the four assertions after it, none of which had
         anything to do with saving. The read side is already covered by the reload check at
         the end of this file. */
      const snapT = (snapshot().threads || []).find(t => t.key === 'lyre');
      R.placeRidesTheSave = snapT && snapT.mark && Math.abs(snapT.mark.x - site2.x) < 1
        ? 'and the save carries it' : '!! THE PLACE IS NOT WRITTEN TO THE SAVE';
    }

    /* ARRIVING AT THE FIELD IS ARRIVING. A corpse-field carries r:12; the old test was 14, a
       two-tile skin around a circle nobody can see. Walk to the edge, not the centre pixel. */
    if (site2 && him) {
      him.x = site2.x + 18; him.y = site2.y;
      for (let i = 0; i < 40 && !search.met; i++) lyreTick(4);
      R.theEdgeCounts = search.met
        ? 'standing at the edge of the field finds her, not just the centre tile'
        : '!! WALKING TO WITHIN 18 TILES OF THE FIELD FINDS NOTHING';
      him.x = site2.x; him.y = site2.y;
      for (let i = 0; i < 40 && !search.met; i++) lyreTick(4);
    }
    const her = chars.find(c => c.bossKey === 'lyre');
    R.sheIsThere = her ? her.name + ', alive' : 'SHE NEVER APPEARED';
    /* Not `her.neutral` — that flag was set and she was still going to shoot. She is faction
       'exile', which carries Sister Ash's standing order to hunt any dead in sight, and he
       arrives with six of them. Ask the function that actually decides. */
    const dead = mine.filter(c => c.undead);
    R.sheIsNeutral = her && her.neutral ? 'not hostile' : 'HOSTILE OR MISSING';
    R.sheHoldsFire = her && him && !hostile(her, him) && dead.every(u => !hostile(her, u) && !hostile(u, her)) ?
      'she does not shoot the household' : 'SHE OPENS FIRE ON HIS DEAD';

    /* --- she reacts to what he became, not to a flag ---
       ASKED WITHOUT BEING ANSWERED. This used to call `talkTo` twice and read her speech
       bubble, which worked only for as long as the conversation had no consequences. It has
       one now — one conversation and she is in the squad — so the second `talkTo` would have
       read a squad line and the comparison would have gone green on two lines that differ for
       a completely different reason. `sisterGreeting` is the world-reading half on its own. */
    if (her) {
      const plain = sisterGreeting();
      if (him) him.lich = true;
      const asLich = sisterGreeting();
      if (him) him.lich = false;
      R.plainGreeting = plain.slice(0, 46) + '...';
      R.asALich = asLich.slice(0, 46) + '...';
      R.sheNoticed = (asLich !== plain) ? 'she reads the man' : 'SAME LINE REGARDLESS';
      /* AND THE CONVERSATION GOES SOMEWHERE. "After going through everything to find Lyre —
         she doesn't even join the party?" The arc itself is tools/sister.js; this is the one
         assertion that belongs to the origin, because the origin is what promised her. */
      talkTo(her);
      R.andSheJoins = (her.faction === 'player' && (her.regard || 0) < -10)
        ? `she comes, at ${(her.regard || 0).toFixed(0)} — ${regardBand(her.regard || 0).label}`
        : `SHE DOES NOT JOIN (faction '${her.faction}', regard ${(her.regard || 0).toFixed(0)})`;
    }

    /* --- an eleven-year search must survive a save --- */
    restore(JSON.parse(JSON.stringify(snapshot())));
    R.searchKept = (search.on && search.found && search.met) ?
      'search intact (' + search.leads + ' leads)' : 'SEARCH RESET BY LOAD';
    return R;
  }, key);

  let broken = 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (i > 0) {
      await p.goto(URL, { waitUntil: 'load' });
      await p.waitForTimeout(2500);
      await p.evaluate(() => document.getElementById('btn-start').click());
      await p.waitForTimeout(2500);
    }
    let out;
    try { out = await run(key); }
    catch (e) { console.log('=== ' + key + ' ===\n\n*** THREW: ' + String(e.message).split('\n')[0] + ' ***\n'); broken++; continue; }
    console.log('=== ' + key + ' ===\n');
    for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
    const bad = Object.values(out).map(String).filter(v => /[A-Z]{3,}\s+[A-Z]{2,}|MISSING|NO CROWN|NO SITE|NO LEAD/.test(v));
    const ok = key === 'lyonart' ? 'THE PRINCE IS WHOLE' : key === 'saga' ? 'THE GODKILLER IS WHOLE' : 'THIS LIFE STARTS';
    console.log('\n' + (bad.length ? '*** NOT WIRED: ' + bad.join(' | ') + ' ***' : ok) + '\n');
    if (bad.length) broken++;
  }
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (broken) process.exitCode = 1;
})();
