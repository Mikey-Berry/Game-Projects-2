#!/usr/bin/env node
/* WHAT A GOLEM EATS, AND WHETHER ANYTHING WILL GIVE IT ANY.
 *
 * "Bug: Golems cannot eat properly — they get hungry with a message that their etching craves
 *  ore, but it doesn't automatically take from the ore storage to feed them. What's more, they
 *  can only be fed manually, and cannot eat ore at all, but only normal food."
 *
 * THREE FAULTS, AND THEY COMPOSE INTO ONE ABSURDITY. The hunger tick said "the etchings want
 * ore" and would only accept INGOTS, so a camp with a full bin of Iron Ore off the new MINE job
 * watched its golem seize up standing next to it. The hand-feeding button is gated on
 * `it.type === 'food'`, and metal is 'mat' or 'trade', so there was no way to give a vessel an
 * ingot at all. And that same button never checked WHO it was feeding — so the only thing you
 * could put into a golem was bread, which is the one thing the sigil-bound line has always said
 * it does not eat.
 *
 * Every claim here is asserted through the thing a player actually touches — the stores panel's
 * own buttons, and `campTake` from a real bin — because "the mechanism works if you call it
 * correctly" was true of all three of these on the build before the fix.
 *
 *   node tools/vessels.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
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
    const wipe = () => {
      while (made.length) { const c = made.pop(); const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      for (const k of ['iron_ore', 'copper', 'iron', 'c_ingot', 'lead', 'meat']) stash[k] = 0;
    };
    const me = player()[0];
    const vessel = (name) => {
      const c = makeChar(name, 'player', me.x + 2, me.y, { atk: 6, def: 6, tough: 20, ath: 5, race: 'golem', sub: 'clay' });
      c.state = 'ok'; c.race = 'golem';
      chars.push(c); made.push(c);
      return c;
    };

    /* ---------- 1. ORE IS FOOD ---------- */
    guard(['oreFeedsAVessel', 'andSoDoTheIngots', 'andItTakesTheCheapestFirst'], () => {
      wipe();
      const g = vessel('Doorkeep');
      R.oreFeedsAVessel = (GOLEM_FEED.iron_ore > 0 && GOLEM_FEED.copper > 0)
        ? `raw ore is on the diet: Iron Ore +${GOLEM_FEED.iron_ore}, Copper Ore +${GOLEM_FEED.copper}`
        : `!! RAW ORE IS NOT FOOD (${JSON.stringify(GOLEM_FEED)})`;
      R.andSoDoTheIngots = (GOLEM_FEED.c_ingot > GOLEM_FEED.iron_ore && GOLEM_FEED.iron > GOLEM_FEED.copper)
        ? `and a smelted ingot still goes further than the rock it came out of (${GOLEM_FEED.c_ingot} against ${GOLEM_FEED.iron_ore}) — smelting is still worth doing`
        : `!! AN INGOT IS NOT WORTH MORE THAN THE ORE (${JSON.stringify(GOLEM_FEED)})`;
      /* AND THE ORDER MATTERS. Written the other way round it eats the ingots you were saving
         for a wall while a bin of ore sits beside it. */
      stash.iron_ore = 5; stash.c_ingot = 5;
      g.hunger = 20;
      bodyTick(g, 1);
      R.andItTakesTheCheapestFirst = (stash.c_ingot === 5 && stash.iron_ore === 4)
        ? 'and it reaches for the raw rock before the ingots — ore 5 to 4 with the ingots untouched'
        : `!! IT ATE THE WRONG THING FIRST (ore ${stash.iron_ore}, ingots ${stash.c_ingot})`;
    });

    /* ---------- 2. AND THE CAMP FEEDS IT WITHOUT BEING ASKED ----------
       "It doesn't automatically take from the ore storage." Out of a REAL BIN, because that is
       where a mining job puts what it digs and `campTake` is what has to reach into it. */
    guard(['theCampFeedsItFromABin', 'andItStarvesWithNothingToEat'], () => {
      wipe();
      const g = vessel('Bellows');
      const bin = placeStructure('bin', Math.round(me.x) + 4, Math.round(me.y) + 4);
      if (bin) { bin.store = {}; binPut(bin, 'iron_ore', 6); }
      const inBin = bin && bin.store ? (bin.store.iron_ore || 0) : 0;
      g.hunger = 10;
      const h0 = g.hunger;
      bodyTick(g, 1);
      const left = bin && bin.store ? (bin.store.iron_ore || 0) : 0;
      R.theCampFeedsItFromABin = (inBin > 0 && g.hunger > h0 && left < inBin)
        ? `a hungry golem takes ore out of a storage bin on its own — ${inBin} to ${left}, hunger ${h0} to ${Math.round(g.hunger)}`
        : `!! bin ${inBin} -> ${left}, hunger ${h0} -> ${Math.round(g.hunger)}`;
      /* and with nothing to eat it says what is actually wrong */
      if (bin) { bin.store = {}; const i = pBuilds.indexOf(bin); if (i >= 0) pBuilds.splice(i, 1); }
      wipe();
      const g2 = vessel('Anvil');
      g2.hunger = 0.4;
      for (let i = 0; i < 6; i++) bodyTick(g2, 1);
      R.andItStarvesWithNothingToEat = g2.hunger === 0
        ? 'and with no metal anywhere it sits at zero rather than quietly topping itself up'
        : `!! IT FED ITSELF FROM NOTHING (${g2.hunger})`;
    });

    /* ---------- 3. AND YOU CAN HAND IT ONE ----------
       Through the panel's own buttons. `it.type === 'food'` is the gate, and metal is 'mat' or
       'trade' — so on the build before this there was no button of any kind. */
    guard(['thePanelOffersToFeedIt', 'andTheButtonWorks', 'andItWillNotEatBread'], () => {
      wipe();
      const g = vessel('Ledger');
      selected = [g];
      stash.iron_ore = 4; stash.meat = 4;
      refreshInv();
      const body = document.getElementById('invbody') || document.getElementById('modalbody') || document.body;
      const feed = [...document.querySelectorAll('[data-feed]')].find(x => x.dataset.feed === 'iron_ore');
      R.thePanelOffersToFeedIt = feed
        ? `the stores panel offers "${feed.textContent.trim()}" on Iron Ore while a golem is the one selected`
        : '!! THERE IS NO WAY TO HAND A VESSEL AN INGOT OR A LUMP OF ORE';
      if (feed) {
        g.hunger = 30;
        feed.click();
        R.andTheButtonWorks = (g.hunger > 30 && stash.iron_ore === 3)
          ? `and pressing it puts the rock in: hunger 30 to ${Math.round(g.hunger)}, ore 4 to ${stash.iron_ore}`
          : `!! THE BUTTON IS DEAD (hunger ${g.hunger}, ore ${stash.iron_ore})`;
      } else R.andTheButtonWorks = '!! not reached';
      /* AND BREAD IS REFUSED. The only thing you could feed a golem before this was food, and
         the sigil-bound line has always said it never eats bread. */
      refreshInv();
      const eat = [...document.querySelectorAll('[data-eat]')].find(x => x.dataset.eat === 'meat');
      const before = g.hunger, meat0 = stash.meat;
      if (eat) eat.click();
      /* THE BUTTON HAS TO BE THERE TO BE REFUSED BY. Written as `!eat || ...` this passes on a
         panel that simply does not render EAT — which is the wrong reason, and would hide the
         day somebody makes meat un-eatable for the whole squad. */
      R.andItWillNotEatBread = (eat && g.hunger === before && stash.meat === meat0)
        ? 'and pressing EAT on a joint of meat with a golem selected does nothing to it and spends nothing'
        : `!! button=${!!eat} hunger ${before} -> ${g.hunger}, meat ${meat0} -> ${stash.meat}`;
    });

    /* ---------- 4. AND THE SAME RULE FOR THE SIGIL-BOUND ----------
       `eatsMetal` covers both, because the ascension's own message has always promised it. */
    guard(['theSigilBoundEatTheSame'], () => {
      wipe();
      const s = makeChar('Etched', 'player', me.x + 3, me.y, { atk: 8, def: 8, tough: 20 });
      s.state = 'ok'; s.immortal = 'transmute';
      chars.push(s); made.push(s);
      stash.iron = 3;
      s.hunger = 20;
      bodyTick(s, 1);
      R.theSigilBoundEatTheSame = (eatsMetal(s) && s.hunger > 20 && stash.iron === 2)
        ? 'a Sigil-Bound is fed off the same table as a golem — iron 3 to 2, which is what its own ascension line promises'
        : `!! eatsMetal=${eatsMetal(s)} hunger ${s.hunger} iron ${stash.iron}`;
      wipe();
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE ETCHINGS ARE STILL BEING OFFERED BREAD (${bad.length + errs.length})`
                                        : 'A VESSEL EATS ORE, AND THE CAMP FEEDS IT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
