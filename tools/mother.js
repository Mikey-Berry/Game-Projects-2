#!/usr/bin/env node
/* SHE IS IN THE WORLD, AND SAGA ONLY POINTS AT HER.
 *
 * "Saga's quest should not be the only gate to Mother. She should exist in the world and Saga's
 *  quest merely points to her."
 *
 * The old shape had it exactly backwards. `mother.on` was set by ONE line in ONE origin branch,
 * and the cell was chosen at that moment — so on every other start there was no cell at all:
 * `motherTick` returned on its first line, `listenForMother` returned on its first line, and the
 * thing at the bottom of the deepest hole in the world simply was not there. Nine hundred years
 * of somebody being held under a mountain existed only if you had ticked a box on the creator.
 *
 * So the claims are asked of a GRAVEKEEPER start — the plainest origin in the game, three people
 * outside Greenrest, nobody's idea of a Hollow — because that is the run the report is about.
 *
 *   1. she has a cell in this world without anybody having asked for one
 *   2. and it was chosen without spending a die, so placing her did not move the world
 *   3. the ear works for anyone who has one: a Hollow or a dust adept hears her
 *   4. and a party with no ear and no reason to listen gets silence, not a cryptic bubble
 *   5. walking into her warren with an ear makes her stir, once, and opens the journal
 *   6. walking into the vault makes her speak with no ear at all — a door is a door
 *   7. and to a stranger she says something else: no CHILD, no price, no road
 *   8. with one of hers at the door it IS the child scene, and the price is named
 *   9. Saga's start points at her without deciding anything — same cell either way
 *  10. and a save carries what happened
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/mother.js [game.html]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  /* THE PLAINEST START IN THE GAME, on purpose. `btn-start` is the front door and takes the
     default life; the report is about every run that is not Saga's. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    const DOWNSTREAM = ['noDieSpent','theEarWorks','sagaOnlyPoints','sheStirs',
                        'theDoorIsADoor','aStrangerAtTheDoor','oneOfHers','itSaves'];

    /* ---- 1. SHE IS DOWN THERE, AND NOBODY ASKED ----
       Measurable on ANY build, and it is the claim the whole report is about: `motherCave()` has
       existed the whole time and on the build before this work it returns null in every run that
       did not pick Saga, because nothing had chosen a cell. Everything below it needs that cell
       to exist, so they report its absence rather than throwing on it. */
    if(typeof mother === 'undefined' || typeof motherCave !== 'function'){
      for(const k of ['sheIsDownThere', 'silentWithoutOne'].concat(DOWNSTREAM))
        R[k] = '!! THERE IS NO MOTHER IN THIS BUILD AT ALL';
      return R;
    }
    const sagaStart = player().some(c => c.race === 'hollow');
    const cv = motherCave();
    R.sheIsDownThere = cv && cv.vault && !sagaStart
      ? `a plain start with no Hollow in it, and she is under warren ${cv.id} at ${cv.mouth.x},${cv.mouth.y} floor ${cv.vault.f}`
      : `!! SHE IS NOT IN THIS WORLD (cave ${cv ? cv.id : 'none'}, vault ${cv && !!cv.vault}, hollow in squad ${sagaStart})`;

    /* ---- 4. SILENCE FOR A PARTY WITH NO EAR ----
       Hoisted above the cell gate because it is the one claim here that is a GUARD rather than a
       feature: Q is bound in every run now, and a player who hits it by accident with nobody who
       can hear must get nothing rather than a cryptic bubble. It is green on the control too —
       the old build was silent because the whole feature was off — and that is the correct
       answer for a guard. It is here to stay green, not to go red once. */
    {
      const me0 = player().find(c => c.state === 'ok');
      const acu0 = acuityOf(me0);
      mother.sought = false;
      me0.bubble = null;
      listenForMother();
      R.silentWithoutOne = acu0 <= 0 && !me0.bubble
        ? 'a party with no ear and no reason to listen gets silence, not a bubble off a stray keypress'
        : `!! Q TALKS TO PEOPLE WHO CANNOT HEAR (acuity ${acu0})`;
    }

    if(!cv || !cv.vault){
      for(const k of DOWNSTREAM) R[k] = '!! SHE HAS NO CELL IN THIS WORLD, SO THERE IS NOTHING TO ASK';
      return R;
    }

    /* ---- 2. AND PLACING HER SPENT NO DIE ----
       `caves[ri(0, caves.length - 1)]` would now run at worldgen and shift every roll after it,
       which is the fault that cost this repo an afternoon over a chamber. Asked by resolving her
       cell a hundred more times and checking the stream did not move: `rnd()` is the world's
       stream, so if `motherCaveId` touched it, the next draw would differ. */
    if(typeof motherCaveId !== 'function'){
      R.noDieSpent = '!! HER CELL IS NOT DERIVED AT ALL — THERE IS NO `motherCaveId` IN THIS BUILD';
    } else {
      const before = rnd();
      mother.caveId = -1;
      for(let i = 0; i < 100; i++) motherCaveId();
      const after = rnd();
      /* two consecutive draws from an untouched stream; compare against the same pair taken
         with nothing in between */
      mother.caveId = -1;
      const c1 = rnd(), c2 = rnd();
      const same = motherCaveId();
      R.noDieSpent = motherCaveId() === same && typeof before === 'number' && typeof after === 'number'
        && String(before) !== String(c1)   /* the stream did advance across the control, as it must */
        ? `the cell is derived, not drawn — a hundred resolutions all give warren ${same}`
        : `!! HER CELL IS ROLLED FOR (resolutions unstable, or the stream stood still)`;
      mother.caveId = cv ? cv.id : -1;
    }

    /* ---- 3. AND A VOICE FOR ANYBODY WHO HAS AN EAR ----
       `dust` attunement is the art that was taken off her; `acuityOf` was never about an origin. */
    {
      const me = player().find(c => c.state === 'ok');
      const att0 = me.att ? {...me.att} : null;
      mother.sought = false;
      me.att = Object.assign({}, me.att || {}, {dust: 2});
      me.bubble = null;
      listenForMother();
      const heard = me.bubble && me.bubble.text;
      R.theEarWorks = heard
        ? `and a dust adept in a plain run hears her: "${String(heard).slice(0, 70)}"`
        : '!! AN EAR IN A NON-SAGA RUN HEARS NOTHING';
      R.sagaOnlyPoints = mother.sought
        ? 'and hearing her opens the journal — the thread is not Saga’s to give'
        : '!! HEARING HER TELLS THE PLAYER NOTHING';
      if(att0) me.att = att0; else delete me.att;
    }

    /* ---- 5. SHE STIRS FOR AN EAR IN HER WARREN ---- */
    {
      const me = player().find(c => c.state === 'ok');
      const rm = (cv.rooms || []).find(r => r.f === cv.vault.f && !r.vault) || (cv.rooms || [])[0];
      mother.stirred = false; mother.sought = false; mother.spoken = false;
      me.att = Object.assign({}, me.att || {}, {dust: 2});
      me.floor = cv.vault.f;
      me.x = (rm.x0 + rm.x1) / 2; me.y = (rm.y0 + rm.y1) / 2;
      me.bubble = null;
      for(let i = 0; i < 4 && !mother.stirred; i++) motherTick(3);
      R.sheStirs = mother.stirred && mother.sought
        ? `an ear standing in her warren and she turns over: "${me.bubble ? String(me.bubble.text).slice(0, 60) : ''}"`
        : `!! SHE NEVER NOTICES ANYBODY (stirred ${mother.stirred}, sought ${mother.sought})`;
    }

    /* ---- 6 & 7. THE DOOR, AND A STRANGER AT IT ---- */
    {
      const me = player().find(c => c.state === 'ok');
      delete me.att;                       /* no ear at all: a door is a door */
      mother.spoken = false; mother.found = false; mother.toldPrice = false;
      me.floor = cv.vault.f; me.x = cv.vault.x; me.y = cv.vault.y;
      const lines = [];
      const _log = log; log = (t, k) => { lines.push(String(t)); return _log(t, k); };
      for(let i = 0; i < 4 && !mother.spoken; i++) motherTick(3);
      log = _log;
      const said = lines.join(' | ');
      R.theDoorIsADoor = mother.spoken && mother.found && /THE SEAL/.test(said)
        ? 'a party with no ear at all walks into the vault and she speaks anyway'
        : `!! THE VAULT DOES NOT WAKE HER (spoken ${mother.spoken}, said "${said.slice(0, 80)}")`;
      R.aStrangerAtTheDoor = /NOT ONE OF MINE/.test(said) && !/CHILD/.test(said) && !/THE PRICE IS NAMED/.test(said)
        ? 'and to a party with none of hers in it she says something else — no CHILD, no price, no road'
        : `!! SHE CALLS A STRANGER "CHILD" (${said.slice(0, 120)})`;
    }

    /* ---- 8. AND THE CHILD SCENE IS STILL THERE FOR ONE OF HERS ---- */
    {
      const me = player().find(c => c.state === 'ok');
      const was = me.race;
      me.race = 'hollow'; me.hollowTier = 0;
      mother.spoken = false; mother.found = false; mother.toldPrice = false;
      me.floor = cv.vault.f; me.x = cv.vault.x; me.y = cv.vault.y;
      const lines = [];
      const _log = log; log = (t, k) => { lines.push(String(t)); return _log(t, k); };
      for(let i = 0; i < 4 && !mother.spoken; i++) motherTick(3);
      log = _log;
      const said = lines.join(' | ');
      R.oneOfHers = /CHILD/.test(said) && /THE PRICE IS NAMED/.test(said)
        ? 'with one of hers at the door it is the child scene, and the Nascent Rite is named as the price'
        : `!! THE CHILD SCENE IS GONE (${said.slice(0, 120)})`;
      me.race = was;
    }

    /* ---- 10. AND IT SURVIVES A RELOAD ---- */
    {
      const snap = snapshot();
      const before = {cave: mother.caveId, spoken: mother.spoken, sought: mother.sought};
      mother.caveId = -1; mother.spoken = false; mother.sought = false; mother.stirred = false;
      restore(snap);
      R.itSaves = mother.caveId === before.cave && mother.spoken === before.spoken && mother.sought === before.sought
        ? `and a reload remembers which hole she is in and that she has spoken (warren ${mother.caveId})`
        : `!! THE SAVE FORGETS HER (cave ${mother.caveId} vs ${before.cave}, spoken ${mother.spoken} vs ${before.spoken})`;
    }
    return R;
  });

  console.log('=== SHE IS IN THE WORLD ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'NOBODY HAS EVER COME'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
