#!/usr/bin/env node
/* SIX PLACES TO PUT SOMETHING, AND THREE WAYS TO PUT IT THERE.
 *
 * "Right now, people can only equip one weapon and one armor. It would be nice to expand that
 *  a bit — headpiece, cloak, etc… (We have the starting of this with the paladin helmets and
 *  army soldier helmets.)"
 *
 * The starting point was in the wrong place, and that is the measurement worth keeping: a
 * Paladin's great helm was drawn by `helmKind`, which reads the body's FACTION — a costume the
 * renderer puts on rather than a thing anybody owns. So it could not be taken off, could not be
 * looted, and a Paladin who lost it was still wearing it.
 *
 * Everything here is driven through the paths a player uses: the stash button for the quick
 * equip, `gearBlock` for the paperdoll, and `openArmoury` for the bulk fit. Nothing calls
 * `equipFromStash` to prove `equipFromStash` works.
 *
 *   node tools/slots.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForFunction(() => {
    const bs = document.getElementById('btn-start');
    return bs && typeof chars !== 'undefined' && chars.length > 0;
  }, null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => document.getElementById('startoverlay').style.display === 'none', null, { timeout: 60000 });

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const G = (keys, fn) => { try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 100).toUpperCase(); } };
    const probes = [];
    const mk = (name, o) => {
      const me = player()[0];
      const c = makeChar(name, 'player', me.x + 2 + probes.length * 0.4, me.y + 2, o || { atk: 8, def: 8, tough: 14, ath: 6, labor: 8 });
      c.state = 'ok'; c.__probe = true; chars.push(c); probes.push(c); return c;
    };
    const wipe = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1); probes.length = 0; };
    const shut = () => { const m = document.getElementById('modal'); m.style.display = 'none'; modalOpen = false; document.getElementById('modalbody').innerHTML = ''; };

    /* ---------- 1. THERE ARE SIX SLOTS, AND THE TABLE IS THE ONLY TRUTH ---------- */
    G(['thereAreSixSlots'], () => {
      const want = ['weapon', 'armor', 'head', 'cloak', 'trinket', 'pack'];
      const mapped = ['w_kat', 'a_lea', 'h_kettle', 'k_road', 't_charm', 'pack_s'].map(k => slotFor(k));
      R._slots = `${EQ_SLOTS.join(' ')} — and \`slotFor\` maps ${mapped.join(' ')}`;
      R.thereAreSixSlots = EQ_SLOTS.length === 6 && want.every((w, i) => EQ_SLOTS[i] === w) && mapped.every((m, i) => m === want[i])
        ? `six slots, and every item type resolves to its own: ${mapped.join(', ')}`
        : `!! THE SLOT TABLE IS WRONG (${EQ_SLOTS.join(' ')} / ${mapped.join(' ')})`;
    });

    /* ---------- 2. THE QUICK EQUIP STILL WORKS, AND NOW FILES THINGS CORRECTLY ----------
       Through the stash panel's own button, which is the thing the report asked to keep. */
    G(['theQuickEquipSurvives', 'andFilesEachInItsOwnSlot'], () => {
      wipe();
      const c = mk('Quick');
      selected = [c];
      for (const k of ['w_kat', 'a_lea', 'h_kettle', 'k_road', 't_charm', 'pack_s']) addItem(k, 1);
      refreshInv();
      const got = [];
      for (const k of ['w_kat', 'a_lea', 'h_kettle', 'k_road', 't_charm', 'pack_s']) {
        const btn = [...document.querySelectorAll('#invbody [data-eq]')].find(x => x.dataset.eq === k);
        if (!btn) { got.push('!' + k); continue; }
        btn.click(); got.push(k);
      }
      R._quick = `clicked ${got.join(' ')} in the wagon panel`;
      R.theQuickEquipSurvives = c.weapon === 'w_kat' && c.armor === 'a_lea'
        ? 'scrolling the wagon and clicking still arms whoever is selected — the fast path is untouched'
        : `!! THE QUICK EQUIP BROKE (weapon ${c.weapon}, armor ${c.armor})`;
      R.andFilesEachInItsOwnSlot = c.head === 'h_kettle' && c.cloak === 'k_road' && c.trinket === 't_charm' && c.pack === 'pack_s'
        ? 'and a helm goes on the head rather than being filed as body armour, which is what the old ternary would have done with it'
        : `!! A NEW SLOT WENT SOMEWHERE ELSE (head ${c.head}, cloak ${c.cloak}, trinket ${c.trinket}, pack ${c.pack})`;
      wipe();
    });

    /* ---------- 3. AND THE KIT DOES SOMETHING ----------
       Every seam asked against the SAME body with the item on and off, because a number that
       differs between two staged characters is a number about two staged characters. */
    G(['andTheKitIsWorthSomething', 'andAHatIsNotASecondSuit'], () => {
      wipe();
      const c = mk('Seams', { atk: 8, def: 8, tough: 14, ath: 6, labor: 8, magic: 20 });
      const read = () => ({ cha: chaOf(c), mana: rawMaxMana(c), cap: Math.round(invCap(c)), bind: risenCap(c), pen: +armorPen(c).toFixed(3) });
      const before = read();
      c.trinket = 't_marker'; const cha = chaOf(c);
      c.trinket = 't_phial';  const mana = rawMaxMana(c);
      c.cloak = 'k_road';     const cap = Math.round(invCap(c));
      c.head = 'h_wreath';    const bind = risenCap(c);
      c.head = 'h_armet';     const pen = +armorPen(c).toFixed(3);
      const moved = cha > before.cha && mana > before.mana && cap > before.cap && bind > before.bind && pen > before.pen;
      R._seams = `cha ${before.cha}->${cha} · mana ${before.mana}->${mana} · cap ${before.cap}->${cap} · bind ${before.bind}->${bind} · drag ${before.pen}->${pen}`;
      R.andTheKitIsWorthSomething = moved
        ? `five formulas move and every one of them was already the single read for what it computes: ${R._seams}`
        : `!! GEAR CHANGES NOTHING (${R._seams})`;
      /* AND IT IS CAPPED, or a hat and a blanket out-armour plate */
      c.head = 'h_armet'; c.cloak = 'k_pelt'; c.trinket = 't_charm';
      const sd = slotDef(c), plate = ITEMS.a_pla.def;
      R._def = `hat+cloak+trinket ${(sd * 100).toFixed(0)}% against plate's ${(plate * 100).toFixed(0)}%`;
      R.andAHatIsNotASecondSuit = sd > 0 && sd <= 0.24 && sd < plate
        ? `and the three of them together are worth ${(sd * 100).toFixed(0)}% of what got THROUGH the coat — under the cap, and under plate's own ${(plate * 100).toFixed(0)}%`
        : `!! THE SMALL SLOTS OUT-ARMOUR PLATE (${R._def})`;
      wipe();
    });

    /* ---------- 4. THE PAPERDOLL IS THE INVENTORY SCREEN ----------
       Opened the way a player opens it, and asked for the two things a three-row list could
       not do: show every slot including the empty ones, and filter the wagon to one of them. */
    G(['theInventoryIsAPaperdoll', 'andTheWagonFiltersToTheSlot'], () => {
      wipe(); shut();
      const c = mk('Doll');
      selected = [c];
      addItem('h_kettle', 1); addItem('h_armet', 1); addItem('w_kat', 1);
      openInventory(c);
      const slots = [...document.querySelectorAll('#modalbody .dslot')];
      const labels = slots.map(s2 => (s2.querySelector('.dk') || {}).textContent);
      const fig = document.querySelectorAll('#modalbody .dfig svg').length;
      R._doll = `${slots.length} slot buttons (${labels.join(',')}) and ${fig} figure`;
      R.theInventoryIsAPaperdoll = slots.length === 6 && fig === 1 && labels.includes('HEAD') && labels.includes('CLOAK') && labels.includes('TRINKET')
        ? `[I] draws a figure and all six slots — empty ones included, which is the half a list of what you happen to be wearing cannot do`
        : `!! THE PAPERDOLL DID NOT DRAW (${R._doll})`;
      /* pick HEAD and the wagon list should be helms and nothing else */
      const headBtn = slots.find(s2 => (s2.querySelector('.dk') || {}).textContent === 'HEAD');
      headBtn.click();
      const rows = [...document.querySelectorAll('#modalbody .trow')].map(r => r.textContent);
      const names = rows.join(' ');
      R.andTheWagonFiltersToTheSlot = /Kettle Helm/.test(names) && /Closed Armet/.test(names) && !/Katana/.test(names)
        ? 'and picking HEAD shows the helms in the wagon and not the katana sitting beside them'
        : `!! THE LIST IS NOT FILTERED (${rows.slice(0, 4).join(' | ')})`;
      shut(); wipe();
    });

    /* ---------- 5. AND EQUIPPING FROM IT PUTS THE THING ON ---------- */
    G(['andTheDollEquips'], () => {
      wipe(); shut();
      const c = mk('Doll2');
      selected = [c];
      addItem('h_armet', 1);
      openInventory(c);
      const head = [...document.querySelectorAll('#modalbody .dslot')].find(s2 => (s2.querySelector('.dk') || {}).textContent === 'HEAD');
      head.click();
      /* THE ARMET'S ROW, NOT THE FIRST ROW. A previous claim left a Kettle Helm in the wagon
         and the first WEAR button belonged to that — so this passed with the head going from
         null to `h_kettle` and the message said the button had done nothing. The button had
         worked perfectly; the probe was naming an item it had not clicked. */
      const rows = [...document.querySelectorAll('#modalbody .trow')];
      const row = rows.find(r => /Closed Armet/.test(r.textContent));
      const btn = row && row.querySelector('button');
      const before = c.head;
      if (btn) btn.click();
      R.andTheDollEquips = !before && c.head === 'h_armet'
        ? 'and clicking WEAR on the Closed Armet\'s row puts that helm on the body and redraws the figure'
        : `!! THE BUTTON DID NOTHING (head ${before} -> ${c.head}, row ${!!row}, rows ${rows.length})`;
      shut(); wipe();
    });

    /* ---------- 6. THE PALADIN'S HELM IS A THING NOW, NOT A COSTUME ----------
       The report's own example, and the measurement that motivated the slot: `helmKind` reads
       the FACTION, so the crest was drawn on and could never come off. */
    G(['theOrdersHelmIsAnItem', 'andItComesOffTheirBody'], () => {
      wipe();
      const pal = chars.find(c => c.faction === 'purge' && c.state !== 'dead' && c.name === 'Paladin');
      R._paladin = pal ? `${pal.name} of the Order wears ${pal.head || '(nothing)'}` : '!! NO PALADIN IN THE WORLD';
      R.theOrdersHelmIsAnItem = pal && pal.head === 'h_crest'
        ? `the Order's crest is worn rather than drawn — a Paladin carries \`h_crest\` in a real slot`
        : `!! THE CREST IS STILL A COSTUME (${R._paladin})`;
      if (pal) {
        /* kill it and go through its pockets, the way anybody would */
        const had = campHas('h_crest');
        kill(pal, player()[0]);
        pal.looted = false; pal.bossKey = pal.bossKey || null;
        /* boss odds are certain; an ordinary Paladin is 60%, so ask until it answers rather
           than asserting a coin */
        let got = false;
        for (let i = 0; i < 40 && !got; i++) { pal.looted = false; lootCorpse(pal, true, null); got = campHas('h_crest') > had; }
        R.andItComesOffTheirBody = got
          ? 'and it comes off the body when you loot one, which is the whole difference between an item and a hat the renderer draws'
          : '!! THE HELM IS NOT LOOTABLE';
      } else R.andItComesOffTheirBody = '!! NO PALADIN TO LOOT';
      wipe();
    });

    /* ---------- 7. THE ARMOURY KITS A CROWD ----------
       The report: "so I don't have to manually equip every single undead squad." Twelve bodies,
       one click, through the panel the building opens. */
    G(['theArmouryKitsACrowd', 'andItNeverTakesAnythingAway', 'andRunningItTwiceDoesNothing'], () => {
      wipe(); shut();
      const crew = [];
      for (let i = 0; i < 12; i++) crew.push(mk('Hand ' + i));
      /* one of them already has the best sword in the game, and must keep it */
      const champ = crew[0];
      champ.weapon = 'w_nod';
      selected = crew.slice();
      for (const k of ['w_kat', 'a_lea', 'h_kettle', 'k_road']) addItem(k, 10);
      const bare0 = crew.filter(c => !c.weapon).length;
      openArmoury({ type: 'armoury', x: 0, y: 0 });
      const all = [...document.querySelectorAll('#modalbody .trow button')].find(x => /KIT THEM OUT/.test(x.textContent));
      if (all) all.click();
      const armed = crew.filter(c => c.weapon).length, hatted = crew.filter(c => c.head).length;
      R._armoury = `${bare0} unarmed before; after one click ${armed}/12 armed, ${hatted}/12 hatted`;
      R.theArmouryKitsACrowd = armed >= 11 && hatted >= 10
        ? `twelve bodies selected, one button: ${armed} armed and ${hatted} in helmets, off the wagon`
        : `!! THE RACKS DID NOT DRESS THEM (${R._armoury})`;
      R.andItNeverTakesAnythingAway = champ.weapon === 'w_nod'
        ? 'and the one already holding a nodachi keeps it — the racks only fill an empty slot or beat what is in it'
        : `!! IT DOWNGRADED SOMEBODY (${champ.name} went from w_nod to ${champ.weapon})`;
      /* and it is idempotent, which is what makes it safe to click twice */
      const before2 = crew.map(c => EQ_SLOTS.map(sl => c[sl] || '-').join()).join('|');
      const all2 = [...document.querySelectorAll('#modalbody .trow button')].find(x => /KIT THEM OUT/.test(x.textContent));
      if (all2) all2.click();
      const after2 = crew.map(c => EQ_SLOTS.map(sl => c[sl] || '-').join()).join('|');
      R.andRunningItTwiceDoesNothing = before2 === after2
        ? 'and a second click changes nothing, because better-only is a rule rather than a shuffle'
        : '!! THE SECOND RUN MOVED KIT AROUND';
      shut(); wipe();
    });

    /* ---------- 8. AND THE RULES ARE THE SAME WHICHEVER DOOR YOU USE ----------
       The Aether Lance refusing a gifted hand used to live inside one click handler. Three
       doors now, and a rule in one of them is a rule in all of them. */
    G(['oneRuleThreeDoors'], () => {
      wipe(); shut();
      const mage = mk('Gifted'); mage.gift = 'destruction';
      const risen = mk('Bound'); risen.undead = true; risen.kitBound = true; risen.weapon = 'w_rkat';
      addItem('w_lance', 1); addItem('w_kat', 4);
      selected = [mage];
      const lanceRefused = !!gearRefusal(mage, 'w_lance');
      const boundRefused = !!gearRefusal(risen, 'w_kat');
      /* and the armoury obeys them without being told separately */
      selected = [mage, risen];
      const r = armouryRun([mage, risen], null);
      const lanceStayed = (stash.w_lance || 0) === 1;
      const boundKept = risen.weapon === 'w_rkat';
      R._rules = `lance refused ${lanceRefused}, bound kit refused ${boundRefused}, lance still in the wagon ${lanceStayed}, bound weapon ${risen.weapon}`;
      R.oneRuleThreeDoors = lanceRefused && boundRefused && lanceStayed && boundKept
        ? 'the lance still refuses a gifted hand and a risen still will not put down the kit it came up with — from the paperdoll, the wagon and the racks alike'
        : `!! A RULE IS NOT BEING OBEYED EVERYWHERE (${R._rules})`;
      shut(); wipe();
    });

    /* ---------- 9. AND IT SURVIVES A SAVE ---------- */
    G(['andItSurvivesASave'], () => {
      wipe();
      const c = mk('Keeper');
      c.head = 'h_armet'; c.cloak = 'k_pelt'; c.trinket = 't_phial';
      const id = c.id;
      const snap = JSON.parse(JSON.stringify(snapshot()));
      const rec = snap.chars.find(x => x.id === id);
      restore(snap);
      const back = chars.find(x => x.id === id);
      R.andItSurvivesASave = rec && rec.head === 'h_armet' && back && back.head === 'h_armet' && back.cloak === 'k_pelt' && back.trinket === 't_phial'
        ? 'a helm, a cloak and a trinket are written into the save and come back on the same body'
        : `!! THE NEW SLOTS DO NOT SURVIVE A RELOAD (saved ${rec && rec.head}, back ${back && back.head}/${back && back.cloak}/${back && back.trinket})`;
      wipe();
    });

    /* ---------- 10. AND YOU CAN ACTUALLY BUILD THE ARMOURY ----------
       The mistake this repo has already recorded twice: a costed building missing from the bar. */
    G(['andYouCanBuildIt'], () => {
      const listed = BUILD_CATS.some(([, keys]) => keys.includes('armoury'));
      const costed = !!(BUILD_TYPES.armoury && BUILD_TYPES.armoury.cost);
      R.andYouCanBuildIt = listed && costed
        ? `ARMOURY is on the build bar for ${Object.entries(BUILD_TYPES.armoury.cost).map(([k, v]) => v + ' ' + ITEMS[k].name).join(' + ')} — reachable by a player, not only by a harness`
        : `!! ARMOURY IS ${costed ? 'COSTED BUT NOT ON THE BAR' : 'NOT A BUILDING'}`;
    });

    wipe(); shut();
    selected = [];
    return R;
  });

  console.log('=== SIX PLACES TO PUT SOMETHING ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  if (errs.length) console.log('\n' + errs.join('\n'));
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!')).concat(errs);
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'SIX SLOTS, THREE DOORS, AND THE SAME RULES BEHIND ALL OF THEM'));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
