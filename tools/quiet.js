#!/usr/bin/env node
/* THE FEED IS THE PLAYER'S, NOT THE WORLD'S.
 *
 *   "The gravekeepers in Hollowmere keep updating me on their raising of corpses and that their
 *    binding is maxed out etc etc. That's info I don't really need and it's completely clogging
 *    up the feed."
 *
 * Two faults behind one symptom, and this file holds both.
 *
 *   · NOT ONE LINE IN `castRaise` ASKED WHO WAS CASTING. Hollowmere's gravekeepers, the road
 *     roamers and the Guild's own are all `npcNecro`, all working a corpse every three seconds
 *     forever, and every refusal and every success went into the player's log.
 *   · AND THE TWO CAPS DISAGREED. The keeper tick gated on `risenCount >= 7`; the rite gates on
 *     `risenLoad + 1 > risenCap`, which for a town keeper is about six. A keeper who reached six
 *     passed the first, failed the second, dropped the claim and came back for the same corpse
 *     three seconds later — forever. Silencing the log alone would have hidden that loop rather
 *     than fixed it, so the claims below measure the WORK as well as the words.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/quiet.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);
  const R = {};
  const NOTHING = '!! NOTHING TO MEASURE — this build has no npc necromancers';

  /* ---- 1. THERE ARE KEEPERS, AND THEY ARE WORKING ----
     The claim below is "you are not told about it", which is worthless if nothing is happening.
     So first: prove the world really does have somebody raising the dead who is not you. */
  const who = await p.evaluate(() => {
    if (typeof castRaise !== 'function') return null;
    const necros = chars.filter(c => c.npcNecro && c.state === 'ok');
    return { n: necros.length, byFaction: necros.reduce((a, c) => { a[c.faction] = (a[c.faction]||0)+1; return a; }, {}),
             keepers: necros.filter(c => !c.roamNecro).length,
             corpses: corpses.length };
  });
  R.somebodyElseIsRaising = !who || !who.n ? NOTHING
    : (who.n >= 2)
    ? `${who.n} necromancers in the world who are not you — ${Object.entries(who.byFaction).map(([k,v]) => k+' '+v).join(', ')} — ${who.keepers} of them posted keepers`
    : `!! NOBODY ELSE IS RAISING ANYTHING (${JSON.stringify(who)})`;

  /* ---- 2. AND NOT A WORD OF IT REACHES THE FEED ----
     Driven rather than reasoned about: every keeper in the world is stuffed to its binding cap
     and handed a fresh corpse at its feet, which is precisely the state that produced the
     complaint, and then the real `castRaise` is called on each. The log is watched throughout.

     WHAT IS COUNTED IS THE RAISE PATH'S OWN VOCABULARY, not the whole feed. The first cut of
     this claim counted every line and came back red on two of them — "Dax is having second
     thoughts", "Dax will not take another order much longer" — which are REGARD tells off the
     band table, fired because a hand of yours stood there and watched somebody else's
     necromancy. Those are the player's business and must keep arriving. The total is reported
     alongside the verdict rather than discarded, so a raise line worded in some way this list
     does not know still shows up in the pass message instead of vanishing behind a green. */
  const RAISE_WORDS = [
    "binding is full", "cannot bind another lieutenant", "into undeath", "will not take a binding",
    "it is BROKEN", "raised the dead", "raised a ", "ground here is", "nobody else can carry it",
    "raising the dead", "under cover of night",
  ];
  const spam = await p.evaluate((words) => {
    if (typeof castRaise !== 'function') return null;
    const seen = [];
    const realLog = log;
    log = (m, k) => { seen.push(String(m)); realLog(m, k); };
    const necros = chars.filter(c => c.npcNecro && c.state === 'ok').slice(0, 6);
    let refused = 0, raised = 0;
    for (const c of necros) {
      /* a body at their feet, and the binding already full — the exact complaint. Filled by
         standing bodies up, because that is the only thing `risenLoad` counts: a probe that
         sets `_bindW` here gets a SUCCESS and never exercises the refusal at all. */
      const held = [];
      for (let i = 0; i < 3; i++) {
        const r = makeChar('Risen', c.faction, c.x + 2 + i, c.y + 2, { tough: 8 });
        r.undead = true; r.master = c; r.bindWeight = Math.ceil(risenCap(c) / 2) + 1;
        chars.push(r); held.push(r);
      }
      const body = makeChar('Pauper', 'town', c.x + 1, c.y, { tough: 10 });
      body.state = 'dead'; body.deadAt = day; body.looted = true;
      chars.push(body); corpses.push(body);
      c.mana = 999; c.castCd = 0;
      if (castRaise(c, body) === false) refused++;
      /* and the happy path, once the binding has room again */
      for (const r of held) r.master = null;
      c.mana = 999; c.castCd = 0;
      if (castRaise(c, body)) raised++;
    }
    log = realLog;
    const tried = refused + raised;
    const raiseLines = seen.filter(m => words.some(w => m.indexOf(w) >= 0));
    const other = seen.filter(m => !words.some(w => m.indexOf(w) >= 0));
    return { tried, refused, raised, lines: raiseLines.length, sample: raiseLines.slice(0, 4),
             other: other.length, otherSample: other.slice(0, 3) };
  }, RAISE_WORDS);
  R.andNotAWordOfItReachesYou = !spam ? NOTHING
    : (spam.refused > 2 && spam.raised > 2 && spam.lines === 0)
    ? `${spam.tried} raisings by somebody else — ${spam.refused} refused for a full binding, ${spam.raised} stood up — and the feed took none of it` +
      (spam.other ? ` (${spam.other} unrelated lines went through, which is right: ${JSON.stringify(spam.otherSample)})` : '')
    : (spam.refused < 3 || spam.raised < 3)
    ? `!! THE STAGING NEVER EXERCISED BOTH PATHS (${JSON.stringify({refused: spam.refused, raised: spam.raised})})`
    : `!! AN NPC RAISING IS STILL IN THE PLAYER'S FEED (${spam.lines} lines from ${spam.tried} tries: ${JSON.stringify(spam.sample)})`;

  /* ---- 3. BUT YOUR OWN STILL TELLS YOU ----
     The failure mode of a fix like this is silencing the thing wholesale. A necromancer of
     YOURS hitting a full binding is exactly the line the player needs. */
  const mine = await p.evaluate((words) => {
    if (typeof castRaise !== 'function') return null;
    const seen = [];
    const realLog = log;
    log = (m, k) => { seen.push(String(m)); realLog(m, k); };
    const me = player().find(c => !c.undead) || player()[0];
    const body = makeChar('Pauper', 'town', me.x + 1, me.y, { tough: 10 });
    body.state = 'dead'; body.deadAt = day; body.looted = true;
    chars.push(body); corpses.push(body);
    me.gift = 'dark'; me.att = me.att || {}; me.att.dark = 2;
    /* the binding filled the way claim 4 fills it — `_bindW` is `bindStrain`'s number, not
       `risenLoad`'s, and setting it here let the rite succeed and say so, which reads exactly
       like the fix having worked when nothing was being refused at all */
    for (let i = 0; i < 3; i++) {
      const r = makeChar('Risen', me.faction, me.x + 2 + i, me.y + 2, { tough: 8 });
      r.undead = true; r.master = me; r.bindWeight = Math.ceil(risenCap(me) / 2) + 1;
      chars.push(r);
    }
    me.mana = 999; me.castCd = 0;
    castRaise(me, body);
    log = realLog;
    /* the same vocabulary claim 2 counts to zero. Counted rather than merely non-empty because
       a raising also trips `crime`, and "GREENREST wants you for raising the dead" arriving on
       its own would pass a bare length check while the binding line stayed silenced. So the
       verdict rides on the refusal line itself, by name. */
    const raiseLines = seen.filter(m => words.some(w => m.indexOf(w) >= 0));
    /* and the one line this claim is actually about, named rather than inferred */
    const theLine = seen.filter(m => m.indexOf('binding is full') >= 0);
    return { onFull: theLine.length, raiseLines: raiseLines.length, all: seen.length,
             sample: theLine.concat(raiseLines).slice(0, 2) };
  }, RAISE_WORDS);
  R.butYourOwnStillTellsYou = !mine ? NOTHING
    : (mine.onFull > 0)
    ? `your own caster with a full binding still says so — ${JSON.stringify(mine.sample[0] || '').slice(0, 90)}`
    : `!! THE FIX WENT TOO FAR AND SILENCED YOUR OWN WORK (${JSON.stringify(mine)})`;

  /* ---- 4. AND THE KEEPER STOPS TRYING ----
     The loop under the noise. A keeper at its real ceiling must not keep claiming a corpse it
     cannot raise: that is what made the line repeat every three seconds in the first place. */
  const loop = await p.evaluate(() => {
    if (typeof castRaise !== 'function') return null;
    const k = chars.find(c => c.npcNecro && !c.roamNecro && c.state === 'ok');
    if (!k) return null;
    /* the scan measures the corpse against the keeper's GROUND, not against the keeper — a body
       dropped at the feet of a keeper posted out at the edge of its leash is fourteen tiles from
       the town centre and is never a candidate, which is how the first cut of this claim came
       back green on the broken build */
    const hm = k.homeTown || (k.faction === 'guild' ? guild : null);
    if (!hm) return null;
    k.x = hm.x; k.y = hm.y; k.moveTarget = null; k.target = null;
    /* AND THE OTHER KEEPERS HAVE TO BE TAKEN OFF THE YARD. Hollowmere posts several within
       fourteen tiles of the same centre, and on the broken build one of them with room simply
       raised the staged corpse a few seconds in — so the body under test stopped existing and
       the count came back at one. This claim is about what ONE keeper does with a corpse it
       cannot take; the rest are stood down for the length of it. */
    for (const o of chars) if (o !== k && o.npcNecro) { o.npcNecro = false; o.necroBody = null; }
    /* ---------- FILL THE BINDING THE WAY THE BINDING IS ACTUALLY FILLED ----------
       The first cut set `k._bindW` and read `wouldRite: false` for its trouble: `_bindW` is
       what `bindStrain` reads, and `risenLoad` has never heard of it — it walks `chars` and
       sums `bindWeight` over the bodies whose master this is. So stand some bodies up. Three
       heavy ones put the LOAD past the rite's ceiling while leaving the COUNT well under the
       flat seven — which is the exact disagreement between the two gates that made the keeper
       walk to a corpse it could not raise. */
    const cap = risenCap(k);
    for (let i = 0; i < 3; i++) {
      const r = makeChar('Risen', k.faction, k.x + 2 + i, k.y + 2, { tough: 8 });
      r.undead = true; r.master = k; r.bindWeight = Math.ceil(cap / 2) + 1;
      r.floor = k.floor || 0;
      chars.push(r);
    }
    const cnt = risenCount(k), load = risenLoad(k);
    const wouldRite = load + 1 > risenCap(k);
    const body = makeChar('Pauper', 'town', hm.x + 1, hm.y, { tough: 10 });
    body.state = 'dead'; body.deadAt = day; body.looted = true; body.floor = k.floor || 0;
    chars.push(body); corpses.push(body);
    /* ---------- COUNT THE RITE BEING ATTEMPTED, NOT THE CLAIM BEING HELD ----------
       `necroBody` is cleared on the same tick the rite runs, and a refused keeper drops it and
       waits three seconds before taking it up again — so any sampling of the claim is a coin
       toss that a broken build passes. What the complaint actually was is the rite being tried
       over and over on a body it cannot take; count that. */
    let tries = 0;
    const realRaise = castRaise;
    castRaise = (c, b, o) => { if (c === k) tries++; return realRaise(c, b, o); };
    k.necroBody = null; k.necroScanT = 0; k.mana = 999; k.castCd = 0;
    for (let i = 0; i < 60; i++) update(0.25);
    castRaise = realRaise;
    return { cap, cnt, load, wouldRite, tries, flatCapWouldAllow: cnt < 7,
             stillCorpse: corpses.indexOf(body) >= 0 };
  });
  R.andTheKeeperStopsTrying = !loop ? NOTHING
    : !(loop.wouldRite && loop.flatCapWouldAllow && loop.stillCorpse)   /* the corpse has to survive the run, or nothing was refused */
    ? `!! THE STAGING DID NOT PUT THE KEEPER BETWEEN THE TWO CAPS (${JSON.stringify(loop)})`
    : (loop.tries === 0)
    ? `a keeper past the rite's ceiling tries nothing in fifteen seconds — the flat count would have let it (${loop.cnt} of 7) and the rite would have refused it (load ${loop.load} over ${loop.cap}), which is the loop that wrote the line every three seconds`
    : `!! THE KEEPER IS STILL WORKING A CORPSE IT CANNOT RAISE (${loop.tries} attempts in fifteen seconds: ${JSON.stringify(loop)})`;

  console.log('=== THE FEED ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(28) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE WORLD RAISES ITS DEAD IN SILENCE, AND YOURS STILL SPEAKS'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
