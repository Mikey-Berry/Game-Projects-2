#!/usr/bin/env node
/* WHAT THE WORLD HAS HEARD, AND WHAT IT SAYS TO YOU ABOUT IT.
 *
 * "Like M&B2, I think a fame/reputation system would be nice. Not just per town, but like a
 *  global recognition type thing."
 * "Branching dialogue trees, with additional options based on your race/gift etc."
 *
 * TWO NUMBERS, NOT ONE, and that is the assertion that matters most here. A single
 * good-to-evil axis has nowhere to put the corpse-thief everyone has heard of and nobody
 * approves of — which is the more interesting half of the note. `known` only rises; `repute`
 * moves both ways; the BAND comes off `known` and only the WORD comes off `repute`. Get that
 * backwards and famous-and-hated collapses into unknown.
 *
 * AND THE DIALOGUE IS ASSERTED THROUGH THE RENDERED BUTTONS, never off the tree data. "The
 * option exists in the table" was true of every gated line before any of this was wired to
 * `talkTo`; what the report asks for is that the right person sees it, so the probe opens the
 * real conversation and reads what is actually on screen.
 *
 *   node tools/discourse.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 620 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    const made = [];
    const wipe = () => { while (made.length) { const c = made.pop(); const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); } };
    /* ---------- READ DEFENSIVELY WHERE THERE IS PRIOR BEHAVIOUR TO MEASURE ----------
       The fame sections cannot degrade — there is no earlier version of a thing that does not
       exist, and "!! FAME IS NOT DEFINED" is the honest answer for them. But `talkTo` DID
       something before this: it barked. So the dialogue sections have a real before-and-after
       to measure, and they must not be taken down by a ReferenceError from touching `fame` in
       their own setup. */
    const hasFame = (typeof fame === 'object' && fame);
    const zero = () => { if (hasFame) { fame.known = 0; fame.repute = 0; } };
    const label = () => (typeof fameLabel === 'function' ? fameLabel() : 'unknown to this build');
    /* and the same for shutting the conversation: a build with no conversation to shut should
       report the empty menu it really has, not a ReferenceError from the probe's own cleanup */
    const shut = () => { if (typeof closeTalk === 'function') closeTalk();
                         else { const m = document.getElementById('modal'); if (m) m.style.display = 'none'; modalOpen = false; } };
    const me = player()[0];

    /* ---------- 1. FAME IS TWO AXES, AND IT RIDES THE DEEDS THAT ALREADY FIRE ---------- */
    guard(['deedsMakeAName', 'andTheTwoAxesAreIndependent', 'knownNeverFalls'], () => {
      zero();
      deed('rift_sealed', 1);
      const afterGood = { k: fame.known, r: fame.repute };
      R._good = `one tear sealed: known ${afterGood.k.toFixed(2)}, repute ${afterGood.r.toFixed(2)}`;
      R.deedsMakeAName = (afterGood.k > 0 && afterGood.r > 0)
        ? `an act the world would talk about moves both numbers without anything new being remembered to do it — sealing one tear is worth ${afterGood.k.toFixed(1)} known and ${afterGood.r.toFixed(1)} repute`
        : `!! A SEALED TEAR MOVED known ${afterGood.k} repute ${afterGood.r}`;
      /* THE PAIR THAT PROVES IT IS TWO AXES. A dark deed has to make you MORE known and LESS
         well thought of at the same time; on one axis those cancel and you vanish. */
      zero();
      for (let i = 0; i < 6; i++) deed('civkill', 1);
      R._dark = `six killings of civilians: known ${fame.known.toFixed(2)}, repute ${fame.repute.toFixed(2)}, band "${fameLabel()}"`;
      R.andTheTwoAxesAreIndependent = (fame.known > 0 && fame.repute < 0)
        ? `and a black deed makes you MORE known and worse thought of at once — ${fame.known.toFixed(1)} known against ${fame.repute.toFixed(1)} repute, which on one axis would have cancelled to nothing`
        : `!! known ${fame.known.toFixed(1)}, repute ${fame.repute.toFixed(1)}`;
      /* AND A STORY DOES NOT UNHAPPEN */
      const wasKnown = fame.known;
      for (let i = 0; i < 8; i++) deed('town_saved', 1);
      R.knownNeverFalls = fame.known >= wasKnown
        ? `and doing good afterwards does not make people forget: known went ${wasKnown.toFixed(1)} to ${fame.known.toFixed(1)} while repute climbed to ${fame.repute.toFixed(1)}`
        : `!! KNOWN FELL FROM ${wasKnown.toFixed(1)} TO ${fame.known.toFixed(1)}`;
    });

    /* ---------- 2. AND THE BAND IS ABOUT HOW WIDELY, NOT HOW WELL ---------- */
    guard(['famousAndHatedIsAPlaceOnTheScale', 'andItSaturates'], () => {
      zero();
      for (let i = 0; i < 12; i++) deed('conquer', 1);
      const dark = { k: fame.known, r: fame.repute, label: fameLabel(), band: fameBand().key };
      zero();
      for (let i = 0; i < 12; i++) deed('town_saved', 1);
      const light = { k: fame.known, r: fame.repute, label: fameLabel(), band: fameBand().key };
      R._bands = `twelve conquests → ${dark.k.toFixed(0)} known, "${dark.label}" · twelve towns saved → ${light.k.toFixed(0)} known, "${light.label}"`;
      /* ---------- HOLD `known` STILL AND FLIP ONLY `repute` ----------
         The first version of this ran twelve conquests against twelve towns saved and compared
         the bands — but a conquest is worth 8 known and a saved town 7, so the two arms landed
         on different RUNGS and it reported a design failure that was really a difference in
         deed weights. The claim is about the axes, so the test has to move one axis. */
      fame.known = 70; fame.repute = -55;
      const hated = { band: fameBand().key, label: fameLabel() };
      fame.repute = 55;
      const loved = { band: fameBand().key, label: fameLabel() };
      R._axes = `at the same 70 known: repute -55 reads "${hated.label}", repute +55 reads "${loved.label}"`;
      R.famousAndHatedIsAPlaceOnTheScale = (hated.band === loved.band && hated.label !== loved.label)
        ? `held at the same 70 known, the hated and the admired stand on the same rung — both "${hated.band}" — and are described differently: "${hated.label}" against "${loved.label}". Famous-and-loathed is a place on this scale, which is the whole reason there are two numbers`
        : `!! at one known: hated ${hated.band} "${hated.label}", loved ${loved.band} "${loved.label}"`;
      /* saturation: the hundredth deed cannot be worth the first, or the scale runs out in a week */
      zero();
      deed('gaunt_killed', 1);
      const first = fame.known;
      fame.known = 90;
      const before = fame.known;
      deed('gaunt_killed', 1);
      const late = fame.known - before;
      R._sat = `the first kill adds ${first.toFixed(3)} known; the same kill at 90 adds ${late.toFixed(3)}`;
      R.andItSaturates = late < first * 0.4
        ? `and the same act adds less the better known you are — ${first.toFixed(2)} at the start against ${late.toFixed(2)} at ninety, so the scale does not run out in a week`
        : `!! early ${first.toFixed(3)} against late ${late.toFixed(3)} — fame is linear`;
      zero();
    });

    /* ---------- 3. THE GREETING IS WHERE IT LANDS ---------- */
    guard(['theyGreetYouByWhatTheyHeard'], () => {
      wipe(); zero();
      const t = makeChar('Villager', 'town', me.x + 2, me.y, { atk: 2, def: 2 });
      t.state = 'ok'; t.__probe = true; chars.push(t); made.push(t);
      const unknown = fameGreeting(t, me);
      for (let i = 0; i < 14; i++) deed('conquer', 1);
      const feared = fameGreeting(t, me);
      zero();
      for (let i = 0; i < 14; i++) deed('town_saved', 1);
      const admired = fameGreeting(t, me);
      R._greet = `unknown: "${unknown.slice(0, 40)}…" · feared: "${feared.slice(0, 40)}…" · admired: "${admired.slice(0, 40)}…"`;
      R.theyGreetYouByWhatTheyHeard = (unknown !== feared && feared !== admired && admired !== unknown)
        ? 'a stranger greets you three different ways depending on what has reached them — unknown, feared, and admired are three lines, not one line with a number in it'
        : `!! unknown="${unknown}" feared="${feared}" admired="${admired}"`;
      zero();
    });

    /* ---------- 4. THE CONVERSATION OPENS, AND IT IS THE RIGHT ONE ---------- */
    guard(['talkingOpensAConversation', 'andTheSeatGetsItsOwn'], () => {
      wipe(); zero();
      const t = makeChar('Villager', 'town', me.x + 2, me.y, { atk: 2, def: 2 });
      t.state = 'ok'; t.homeTown = towns[0]; t.__probe = true; chars.push(t); made.push(t);
      selected = [me];
      talkTo(t);
      const open = document.getElementById('modal').style.display === 'flex';
      const btns = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.trim());
      R._talk = `villager: modal ${open ? 'open' : 'shut'}, ${btns.length} options — ${btns.slice(0, 3).join(' / ')}`;
      R.talkingOpensAConversation = (open && btns.length >= 2)
        ? `talking to somebody on the street opens a conversation with ${btns.length} things you might say, where before it was one bark and the end of it`
        : `!! open=${open} options=${btns.length}`;
      shut();
      /* and a seat is a different conversation, not the same one with a different name on it */
      const lead = chars.find(o => o.isLeader >= 0 && o.state === 'ok');
      if (!lead) { R.andTheSeatGetsItsOwn = '(no seated leader in this world)'; return; }
      talkTo(lead);
      const lbtns = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.trim());
      R.andTheSeatGetsItsOwn = (lbtns.length && lbtns.join('|') !== btns.join('|'))
        ? `and a town's seat opens a different one — ${lbtns.length} options, none of them the villager's`
        : `!! THE LEADER AND THE VILLAGER GET THE SAME MENU`;
      shut();
    });

    /* ---------- 5. AND THE GATED LINES BELONG TO WHO IS STANDING THERE ----------
       Read off the RENDERED BUTTONS. Every one of these options existed in the table on the
       build before this and none of them could be reached, which is the whole report. */
    guard(['whoYouSendChangesWhatYouCanSay', 'andTheButtonSaysWhyYouCanSayIt', 'thereIsAlwaysAWayOut'], () => {
      wipe(); zero();
      const t = makeChar('Villager', 'town', me.x + 40, me.y + 40, { atk: 2, def: 2 });
      t.state = 'ok'; t.homeTown = towns[0]; t.__probe = true; chars.push(t); made.push(t);
      const put = (name, tweak) => {
        const c = makeChar(name, 'player', t.x + 1, t.y, { atk: 5, def: 5, magic: 20 });
        c.state = 'ok'; c.__probe = true; tweak(c); chars.push(c); made.push(c); return c;
      };
      const opts = (c) => {
        for (const o of made) if (o.faction === 'player') o.x = t.x + 60;   /* get the others out of the way */
        c.x = t.x + 1; c.y = t.y;
        talkTo(t);
        const l = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.trim());
        shut();
        return l;
      };
      const plain = put('Plain Hand', c => {});
      const succ = put('Bel', c => { c.race = 'mimic'; c.sub = 'succubus'; });
      const dark = put('Rook', c => { c.gift = 'dark'; });
      const plainL = opts(plain), succL = opts(succ), darkL = opts(dark);
      R._gated = `plain ${plainL.length} · succubus ${succL.length} · dark-gifted ${darkL.length}`;
      const hasTag = (list, tag) => list.some(x => x.startsWith('[' + tag + ']'));
      R.whoYouSendChangesWhatYouCanSay = (hasTag(succL, 'SUCCUBUS') && !hasTag(plainL, 'SUCCUBUS') &&
                                          hasTag(darkL, 'DARK') && !hasTag(plainL, 'DARK'))
        ? 'the succubus is offered a line nobody else is, and so is the one who holds the dark gift — send a different body and the conversation is a different conversation'
        : `!! plain=${JSON.stringify(plainL)} succubus=${JSON.stringify(succL)}`;
      R.andTheButtonSaysWhyYouCanSayIt = succL.some(x => /^\[[A-Z-]+\]/.test(x))
        ? `and the button says which part of you bought it: "${succL.find(x => x.startsWith('[SUCCUBUS]'))}"`
        : `!! NO OPTION IS TAGGED WITH WHAT UNLOCKED IT`;
      /* AND YOU CAN ALWAYS LEAVE. Gated options are exactly the ones that vanish for most
         bodies, so a node whose every line is gated is a conversation with no door. */
      R.thereIsAlwaysAWayOut = plainL.length > 0
        ? `and the plainest hand in the squad still has ${plainL.length} things to say and a way out of the room`
        : '!! A PLAIN SQUADMATE IS OFFERED NOTHING AT ALL';
      wipe(); zero();
    });

    /* ---------- 6. AND FAME ITSELF UNLOCKS LINES ---------- */
    guard(['beingKnownIsItsOwnKey'], () => {
      wipe(); zero();
      const t = makeChar('Villager', 'town', me.x + 2, me.y, { atk: 2, def: 2 });
      t.state = 'ok'; t.homeTown = towns[0]; t.__probe = true; chars.push(t); made.push(t);
      talkTo(t);
      const quiet = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.trim());
      shut();
      for (let i = 0; i < 14; i++) deed('conquer', 1);
      talkTo(t);
      const loud = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.trim());
      shut();
      R._fameOpt = `unknown ${quiet.length} options → ${label()} ${loud.length} options`;
      R.beingKnownIsItsOwnKey = loud.length > quiet.length && loud.some(x => x.startsWith('[NOTORIOUS]'))
        ? `and being known is a key of its own — the same villager offers a line to somebody ${label()} that they never offered a stranger`
        : `!! quiet=${JSON.stringify(quiet)} loud=${JSON.stringify(loud)}`;
      wipe(); zero();
    });

    /* ---------- 7. A LINE YOU MIGHT NOT GET AWAY WITH ----------
       Every option before this batch was a GATE — you have the thing or you do not, and the
       answer never changes. A check is the other half, and it is the reason a charisma build is
       a build rather than a discount: you may attempt it, it may fail, and the odds are on the
       button so the player is choosing a risk rather than pulling a lever in the dark. */
    guard(['aConversationCanBeRisked', 'theOddsAreOnTheButton', 'andATongueMovesThem', 'andTheyRememberBeingWorkedOn'], () => {
      wipe(); zero();
      const t = makeChar('Villager', 'town', me.x + 40, me.y + 40, { atk: 2, def: 2 });
      t.state = 'ok'; t.homeTown = towns[0]; t.__probe = true; chars.push(t); made.push(t);
      const c = makeChar('Talker', 'player', t.x + 1, t.y, { atk: 5, def: 5 });
      c.state = 'ok'; c.__probe = true; chars.push(c); made.push(c);
      for (const o of made) if (o.faction === 'player' && o !== c) o.x = t.x + 60;
      const optsAt = (cha) => {
        c.stats.charisma = cha;
        talkTo(t);
        const l = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.trim());
        shut();
        return l;
      };
      const lo = optsAt(0), hi = optsAt(70);
      const pct = (list) => { const m = list.map(x => /^\[TALK (\d+)%\]/.exec(x)).find(Boolean); return m ? +m[1] : null; };
      R._check = `at charisma 0 the persuasion reads ${pct(lo)}%, at 70 it reads ${pct(hi)}%`;
      R.aConversationCanBeRisked = lo.some(x => x.startsWith('[TALK '))
        ? `an ordinary villager offers something you can TRY rather than only things you either have or have not: "${lo.find(x => x.startsWith('[TALK ')).slice(0, 70)}"`
        : `!! NO OPTION IN THIS CONVERSATION IS A CHECK: ${JSON.stringify(lo)}`;
      R.theOddsAreOnTheButton = (pct(lo) !== null)
        ? `and the button carries its own odds — ${pct(lo)}% — so a risk is chosen rather than discovered`
        : '!! A CHECK IS OFFERED WITH NO ODDS ON IT';
      R.andATongueMovesThem = (pct(lo) !== null && pct(hi) !== null && pct(hi) > pct(lo) + 20)
        ? `and the tongue is what moves them: the same line off the same villager reads ${pct(lo)}% for a charmless hand and ${pct(hi)}% for a trained one`
        : `!! CHARISMA DOES NOT MOVE THE CHECK (${pct(lo)} → ${pct(hi)})`;
      /* AND NO FREE REROLLS. Without a memory on the person, a failed persuasion costs nothing:
         shut the window, open it again, ask the same question until it works. */
      c.stats.charisma = 70;
      talkTo(t);
      const btn = [...document.querySelectorAll('#modalbody button')].find(x => x.textContent.trim().startsWith('[TALK '));
      if (btn) btn.click();
      shut();
      const after = optsAt(70);
      const spent = after.find(x => x.startsWith('[TALK ') && /already tried/.test(x));
      R.andTheyRememberBeingWorkedOn = spent
        ? 'and a person remembers being worked on — the line comes back greyed out, so a failed persuasion is not a free reroll off the back of closing the window'
        : `!! THE SAME CHECK CAN BE RUN AGAIN ON THE SAME PERSON: ${JSON.stringify(after.filter(x => x.startsWith('[TALK ')))}`;
      wipe(); zero();
    });

    /* ---------- 8. AND THE OTHER PRACTITIONER HAS SOMETHING TO SAY ----------
       An NPC necromancer had three barks in a game about necromancy — the only other person on
       the map doing the player's own work had less to say than a farmer. */
    guard(['theOtherNecromancerTalks', 'andTheDeepestLinesAreForTheDeepestIn'], () => {
      wipe(); zero();
      const n = makeChar('Bonewright', 'town', me.x + 40, me.y + 40, { atk: 2, def: 2 });
      n.state = 'ok'; n.npcNecro = true; n.homeTown = towns[0]; n.__probe = true; chars.push(n); made.push(n);
      const c = makeChar('Asker', 'player', n.x + 1, n.y, { atk: 5, def: 5 });
      c.state = 'ok'; c.__probe = true; chars.push(c); made.push(c);
      for (const o of made) if (o.faction === 'player' && o !== c) o.x = n.x + 60;
      talkTo(n);
      const plain = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.trim());
      shut();
      c.gift = 'dark'; c.att = { ...(c.att || {}), dark: 3 };
      talkTo(n);
      const deep = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.trim());
      shut();
      R._necro = `plain hand ${plain.length} options · dark adept ${deep.length}`;
      R.theOtherNecromancerTalks = plain.length >= 3
        ? `the other necromancer answers with ${plain.length} ways in rather than one bark and a turned back`
        : `!! THE NECROMANCER STILL ONLY BARKS (${plain.length}): ${JSON.stringify(plain)}`;
      R.andTheDeepestLinesAreForTheDeepestIn = deep.length > plain.length && deep.some(x => x.startsWith('[DARK]'))
        ? `and how far into the art you are decides what is on offer — ${plain.length} for a stranger, ${deep.length} for somebody who has been where they have been`
        : `!! plain ${JSON.stringify(plain)} deep ${JSON.stringify(deep)}`;
      wipe(); zero();
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(32) : k.padEnd(32)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `NOBODY HAS HEARD OF YOU AND NOBODY WILL TALK (${bad.length + errs.length})`
                                        : 'THE WORLD KNOWS YOUR NAME, AND SAYS SOMETHING BACK');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
