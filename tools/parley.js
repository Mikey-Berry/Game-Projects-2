#!/usr/bin/env node
/* WHO YOU CAN TALK TO, WHAT THEY SAY BACK, AND WHAT A HELD CLICK OFFERS INSTEAD.
 *
 * Five reports, and two of them turned out to share a root:
 *   "Encountered a glitch where a gaunt was treated as a guard (?) or random civilian."
 *   "The dialogue is unreadable sometimes. Black text on a brown background."
 *   "'What is the news hereabouts?' shouldn't return basic barks."
 *   "A long right click on a named, non-hostile NPC should open up the menu."
 *   "Buying/selling the same items should not increase charisma."
 *
 * `c.guard` HOLDS A POST — `{x, y}` — NOT A RANK. It is set on cave dwellers, wyrm keepers,
 * reclusive scholars, the guildmaster, and the Watcher that moves into the Bastion yard after
 * day 45, which is the gaunt in the report. Five other reads in the game pair it with
 * `faction === 'town'`; the two that did not were the conversation router and its title line.
 * And the second consequence is worse than the reported one: `npcNecro` bodies are given a post
 * too, and the guard test runs FIRST, so every necromancer in the world was getting the watch
 * conversation and the necromancer tree was unreachable in play.
 *
 *   node tools/parley.js [game.html]
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

  const out = await p.evaluate(async () => {
    const R = {};
    paused = true;
    rebuildCharGrid();
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    const made = [];
    const wipe = () => { while (made.length) { const c = made.pop(); const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); } };
    /* ---------- EMPTY IT, NOT JUST HIDE IT ----------
       `shut` hid the modal and left its contents in the DOM, so when the Watcher correctly
       opened NOTHING the probe read the PREVIOUS body's buttons and reported a gaunt holding a
       necromancer's conversation. Same family as the notes already in the ledger: a correct
       silence and the bug it is meant to catch both look like "no new buttons", so the probe has
       to make the absence visible rather than inheriting the last thing that worked. */
    const shut = () => {
      document.getElementById('modal').style.display = 'none';
      document.getElementById('modalbody').innerHTML = '';
      modalOpen = false; if (typeof talkState !== 'undefined') talkState = null;
    };
    const me = player()[0];
    const put = (name, faction, tweak) => {
      const c = makeChar(name, faction, me.x + 40, me.y + 40, { atk: 3, def: 3 });
      c.state = 'ok'; c.__probe = true; if (tweak) tweak(c); chars.push(c); made.push(c); return c;
    };
    const askedOf = (t) => { shut(); talkTo(t); const l = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.trim()); const title = document.getElementById('modalsub').textContent; shut(); return { l, title }; };

    /* ---------- 1. A POST IS NOT A RANK ---------- */
    guard(['aPostIsNotARank', 'andTheOtherNecromancerIsReachableAtAll', 'andAGauntHasNothingToSay'], () => {
      wipe();
      /* a reclusive scholar: standing at a post, faction drifter, nothing to do with the watch */
      const sc = put('Hedge Scholar', 'drifter', c => { c.scholar = true; c.guard = { x: c.x, y: c.y }; });
      /* a real town watchman */
      const wm = put('Watchman', 'town', c => { c.guard = { x: c.x, y: c.y }; c.homeTown = towns[0]; });
      R._watch = `scholar-with-a-post reads as watch: ${typeof isWatch === 'function' ? isWatch(sc) : 'n/a'} · real watchman: ${typeof isWatch === 'function' ? isWatch(wm) : 'n/a'}`;
      R.aPostIsNotARank = (typeof isWatch === 'function' && !isWatch(sc) && isWatch(wm))
        ? 'a body standing at a post is not the watch — the scholar keeps their post and stops being a guardsman, while the town watchman still is one'
        : `!! A POST IS STILL A RANK (scholar ${typeof isWatch === 'function' ? isWatch(sc) : 'no isWatch'})`;
      /* THE ONE THAT MATTERS: every npcNecro in the world carries a post, so the guard test
         running first made the necromancer conversation unreachable in play. */
      const nk = put('Bonewright', 'guild', c => { c.npcNecro = true; c.neutral = true; c.guard = { x: c.x, y: c.y }; });
      const got = askedOf(nk);
      R._necro = `necromancer standing at their post: "${got.title}" — ${got.l.length} options: ${got.l.slice(0, 2).join(' / ')}`;
      R.andTheOtherNecromancerIsReachableAtAll = (!/Watch/.test(got.title) && got.l.some(x => /art|circle|watch the|Teach|quiet|holding/i.test(x)))
        ? `and a necromancer at their post gets the necromancer's conversation rather than the watch's — which is the tree that shipped last round and could not be reached by anybody in play`
        : `!! THE NECROMANCER STILL ANSWERS AS THE WATCH: "${got.title}" ${JSON.stringify(got.l)}`;
      /* and the reported body itself: a gaunt wearing a post, non-hostile, standing about */
      const gt = put('Watcher', 'purge', c => { c.gauntKind = 'messenger'; c.neutral = true; c.guard = { x: c.x, y: c.y }; });
      const g2 = askedOf(gt);
      R._gaunt = `Watcher in the yard: ${g2.l.length} conversation options`;
      R.andAGauntHasNothingToSay = g2.l.length === 0
        ? 'and the thing in the Bastion yard opens no conversation at all — it is a gaunt wearing a post, and it does not answer'
        : `!! A GAUNT IS STILL TALKING: ${JSON.stringify(g2.l)}`;
      wipe();
    });

    /* ---------- 2. THE LINE THEY SAY HAS TO BE LEGIBLE ----------
       One token: `--ink` in this palette is the darkest BACKGROUND (#0d0b09), not the text. */
    guard(['whatTheySayCanBeRead'], () => {
      wipe();
      const v = put('Villager', 'town', c => { c.homeTown = towns[0]; });
      shut(); talkTo(v);
      const said = document.querySelectorAll('#modalbody div')[0];
      const col = said ? getComputedStyle(said).color : '';
      const bg = getComputedStyle(document.getElementById('modal')).backgroundColor;
      const lum = (s2) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(s2 || ''); if (!m) return null;
        const f = (x) => { const c2 = x / 255; return c2 <= 0.03928 ? c2 / 12.92 : Math.pow((c2 + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]); };
      const l1 = lum(col), l2 = lum(bg);
      const ratio = (l1 === null || l2 === null) ? null : (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      shut();
      R._contrast = `spoken line ${col} on modal ${bg} — contrast ${ratio === null ? '?' : ratio.toFixed(2)}:1`;
      /* 4.5:1 is the readable-body-text line. The broken build measured 1.24:1, which is not
         "a bit dim", it is the same colour twice. */
      R.whatTheySayCanBeRead = (ratio !== null && ratio >= 4.5)
        ? `the line they actually say reads at ${ratio.toFixed(1)}:1 against the panel behind it`
        : `!! THE SPOKEN LINE IS ${ratio === null ? 'UNMEASURABLE' : ratio.toFixed(2) + ':1'} — ${col} ON ${bg}`;
      wipe();
    });

    /* ---------- 3. A RUMOUR IS NOT A BARK ---------- */
    guard(['askingForNewsGetsNews', 'andADrifterHasTheBestNewsOfAnybody', 'andTheBarksStillFireOnTheirOwn'], () => {
      wipe();
      const v = put('Villager', 'town', c => { c.homeTown = towns[0]; });
      const barks = new Set([...towns.flatMap(t => t.def.civBarks), ...(typeof DRIFTER_BARKS !== 'undefined' ? DRIFTER_BARKS : [])]);
      const sample = (spk, n) => { const out = []; for (let i = 0; i < n; i++) out.push(makeRumor(spk)); return out; };
      const townSaid = sample(v, 400);
      const bad = townSaid.filter(x => barks.has(x));
      R._rumours = `400 rumours from a townsman: ${bad.length} were ambient barks`;
      R.askingForNewsGetsNews = bad.length === 0
        ? 'asking a townsman for news never answers with ambient chatter — 400 asks, not one bark among them'
        : `!! ${bad.length} OF 400 WERE BARKS, e.g. "${bad[0]}"`;
      const dr = put('Drifter', 'drifter', c => { c.homeTown = null; });
      const drSaid = sample(dr, 400);
      const drBad = drSaid.filter(x => barks.has(x));
      R._drifter = `400 from a drifter with no home town: ${drBad.length} barks, ${new Set(drSaid).size} distinct lines`;
      R.andADrifterHasTheBestNewsOfAnybody = (drBad.length === 0 && new Set(drSaid).size > 8)
        ? `and a drifter — who walks the roads between every town on the map — answers with ${new Set(drSaid).size} distinct pieces of news rather than begging for a coin`
        : `!! DRIFTER GAVE ${drBad.length} BARKS / ${new Set(drSaid).size} distinct: ${JSON.stringify(drSaid.slice(0, 3))}`;
      /* AND THE BARKS MUST STILL EXIST, which is the other half of the note: somebody standing
         in a square should still collect chatter without opening a conversation. */
      R.andTheBarksStillFireOnTheirOwn = (typeof makeBark === 'function' && barks.has(makeBark(v)) && barks.has(makeBark(dr)))
        ? 'and the ambient chatter is still there under its own name — a body in a square still says its piece to the air'
        : `!! THE BARKS ARE GONE (${typeof makeBark})`;
      wipe();
    });

    /* ---------- 4. HOLD IT AND THEY ARE A PERSON, NOT A CONVERSATION ---------- */
    guard(['aHeldClickOffersMore', 'andYouCanPutSomebodyOnThem'], () => {
      wipe();
      const sc = put('Quill', 'drifter', c => { c.scholar = true; c.neutral = true; });
      const mate = chars.find(c => c.faction === 'player' && c.state === 'ok');
      hideCtxMenu();
      if (typeof npcOptions !== 'function') { R.aHeldClickOffersMore = '!! THERE IS NO HELD-CLICK MENU'; return; }
      npcOptions(sc, [mate], 200, 200);
      const labels = [...document.querySelectorAll('#ctxmenu button')].map(x => x.textContent.trim());
      R._held = `${labels.length} options: ${labels.join(' / ')}`;
      R.aHeldClickOffersMore = (labels.length >= 4 && labels.some(x => /^TALK/.test(x)) && labels.some(x => /^GUARD/.test(x)) && labels.some(x => /EXAMINE/.test(x)))
        ? `holding the button on somebody with something to say offers ${labels.length} things to do about them rather than only talking to them`
        : `!! ${JSON.stringify(labels)}`;
      /* the one the note actually asked for: put a body on them so you know where they are */
      const gb = [...document.querySelectorAll('#ctxmenu button')].find(x => /^GUARD/.test(x.textContent));
      if (gb) gb.click();
      hideCtxMenu();
      R._ward = `${mate.name}: job ${mate.job}, guarding ${mate.guardTarget ? mate.guardTarget.name : 'nobody'}`;
      R.andYouCanPutSomebodyOnThem = (mate.guardTarget === sc)
        ? `and one of yours will keep station on somebody who is not yours — ${mate.name} shadows ${sc.name}, which is how you keep track of a body a quest still needs alive`
        : `!! GUARDING A NON-SQUAD NPC DID NOT TAKE (${mate.guardTarget ? mate.guardTarget.name : 'nobody'})`;
      mate.guardTarget = null; mate.job = null;
      wipe();
    });

    /* ---------- 5. CHURNING THE SAME STACK IS NOT COMMERCE ----------
       Measured before the fix: buy ten of something dear, sell the same ten straight back,
       shift-clicking — a hundred clicks took charisma from 6 to 31.6. */
    guard(['theSameStackTeachesNothing', 'butRealCommerceStillDoes'], () => {
      wipe();
      const t = towns[0];
      const c = put('Trader', 'player', () => {});
      const run = (fn) => { t._trade = null; const w = c.stats.charisma = 6; fn(); const got = c.stats.charisma; c.stats.charisma = w; t._trade = null; return got - w; };
      const churn = run(() => { for (let i = 0; i < 50; i++) { tradeLearned(c, 14000, t, 'x', 'buy'); tradeLearned(c, 7700, t, 'x', 'sell'); } });
      const real = run(() => { const ks = Object.keys(t.stock || {}).slice(0, 10); for (const k of ks) tradeLearned(c, 400, t, k, 'buy'); });
      R._farm = `100 clicks round-tripping one dear stack: +${churn.toFixed(2)} charisma · ten different goods bought once each: +${real.toFixed(2)}`;
      R.theSameStackTeachesNothing = churn < 0.6
        ? `selling a vendor back what you just bought from them teaches almost nothing — a hundred clicks of it is worth ${churn.toFixed(2)} charisma, against 25.6 on the build before this`
        : `!! CHURNING ONE STACK STILL PAYS ${churn.toFixed(2)} CHARISMA PER HUNDRED CLICKS`;
      R.butRealCommerceStillDoes = real > 0.6
        ? `while ten genuine deals with the same town still teach ${real.toFixed(2)} — the fix is aimed at the round trip, not at trading`
        : `!! REAL COMMERCE STOPPED TEACHING TOO (${real.toFixed(2)})`;
      wipe();
    });

    /* ---------- 6. THE BENCH IS BEHIND A DOOR ---------- */
    guard(['theSlidersAreNotOnTheFrontPage', 'andTheCircleSaysWhatItIsSetTo'], () => {
      wipe();
      const rit = player().find(c => c.gift === 'dark' && !c.undead && c.state === 'ok') || player()[0];
      rit.gift = 'dark';
      const circle = placeStructure ? placeStructure('circle', Math.round(rit.x + 3), Math.round(rit.y + 3)) : null;
      if (!circle) { R.theSlidersAreNotOnTheFrontPage = '!! COULD NOT PLACE A CIRCLE'; return; }
      circle.progress = 1;
      research.done.rites_binding = true;
      rit.x = circle.x + 1; rit.y = circle.y + 1;
      shut(); openBinding(circle);
      const front = document.getElementById('modalbody').textContent;
      const sliders = [...document.querySelectorAll('#modalbody button')].filter(x => x.textContent.trim() === '+' || x.textContent.trim() === '−').length;
      R._front = `front page: ${sliders} slider buttons, ${/BIND/.test(front) ? 'bindings listed' : 'no bindings'}`;
      R.theSlidersAreNotOnTheFrontPage = (sliders === 0 && /THE SHAPING/.test(front) && /BINDINGS/.test(front))
        ? 'the front page of the circle is the work — no shaping sliders on it, and the bench is behind a door'
        : `!! ${sliders} SLIDER BUTTONS STILL ON THE FRONT PAGE`;
      /* AND IT HAS TO SAY WHAT IT IS SET TO, which is the actual complaint: a shape set once and
         forgotten silently shaped everything bound afterwards. */
      circle.shape = { ...(typeof SHAPE_NEUTRAL !== 'undefined' ? SHAPE_NEUTRAL : {}) };
      const ax = (typeof SHAPE_AXES !== 'undefined' && SHAPE_AXES[0]) ? SHAPE_AXES[0].k : null;
      if (ax) circle.shape[ax] = 4;
      shut(); openBinding(circle);
      const warned = document.getElementById('modalbody').textContent;
      const evenBtn = [...document.querySelectorAll('#modalbody button')].some(x => /SET EVEN/.test(x.textContent));
      R._warn = `with one axis pushed to 4: ${/SET TO COME OUT/.test(warned) ? 'the circle says so' : 'silent'}${evenBtn ? ', and offers a way back' : ''}`;
      R.andTheCircleSaysWhatItIsSetTo = (/SET TO COME OUT/.test(warned) && evenBtn)
        ? 'and a circle left set to shape something states it on the front page with one click back to even — which is the half of the complaint a door alone would not have answered'
        : `!! A FORGOTTEN SHAPE IS STILL SILENT (${/SET TO COME OUT/.test(warned)}, even button ${evenBtn})`;
      shut();
      const i = pBuilds.indexOf(circle); if (i >= 0) pBuilds.splice(i, 1);
      wipe();
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(36) : k.padEnd(36)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE WRONG PEOPLE ARE TALKING AND YOU CANNOT READ THEM (${bad.length + errs.length})`
                                        : 'THE RIGHT PEOPLE TALK, LEGIBLY, AND A HELD CLICK OFFERS MORE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
