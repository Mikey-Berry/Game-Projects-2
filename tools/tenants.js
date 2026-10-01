#!/usr/bin/env node
/* WHAT MOVES INTO A VESSEL.
 *
 * "These are good ideas for the Homonculi -- let's build it out. Those tenants and rates are good.
 *  (Edit: Overflow should work with Nullborn, yes. Workings should not cost more attention though,
 *  but I do like the risk of discharge/feedback.) The Watcher tenant maybe should have a chance of
 *  turning."
 *
 * About a third of homunculi are not alone in there, and nobody knows which until it shows. Each
 * of the four tenants is a promise about a body, and each is checked on a body:
 *
 *   1. the rates: rolled off ten thousand ids, each tenant lands within a point of its odds, and
 *      the same id always rolls the same tenant; Nine never has one
 *   2. an Overflow shows as a gift at I, a Nullborn included, and a working can crack out of it and
 *      burn whoever is beside it; it draws no more Attention than the same working without it
 *   3. a dreamer learns its dream's skill twice as fast, walks toward Sundered ground in its sleep,
 *      and the things of that ground do not touch it
 *   4. an echo answers to another name, is haunted, and will not raise the dead
 *   5. a Watcher sees in the dark, gaunts pass it by until it strikes one, the Order knows it, and
 *      from THE WATCHERS WAKE it can turn
 *   6. Tallow is in Copperhold with her echo already shown; she asks to SEE a formula, and does not
 *      keep it
 *   7. all of it survives a save
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/tenants.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => { try { return player().length > 0; } catch (e) { return false; } }, null, { timeout: 180000, polling: 1000 });
  await p.waitForTimeout(1500);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const me = player()[0];
    const vessel = (sub, tenant, dx) => {
      const c = makeChar('Vessel', 'player', me.x + (dx || 1), me.y + 1, { atk: 20, def: 20, tough: 20, magic: 20 });
      c.race = 'homunculus'; c.sub = sub || 'vatborn'; fitLine(c);
      c.tenant = tenant; c.tenantKnown = false;
      if (tenant === 'dream') c.dreamSkill = 'crafting';
      if (tenant === 'echo') c.echoName = 'Ilse Carrow';
      if (tenant === 'overflow') c.overflowArt = 'destruction';
      chars.push(c);
      return c;
    };
    const gone = (c) => { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); };

    /* ---- 1. the rates ---- */
    {
      const n = 10000, got = { overflow: 0, dream: 0, echo: 0, watcher: 0, none: 0 };
      let same = true;
      for (let i = 0; i < n; i++) {
        const c = { id: 100000 + i, race: 'homunculus' };
        rollTenant(c);
        got[c.tenant || 'none']++;
        const c2 = { id: 100000 + i, race: 'homunculus' }; rollTenant(c2);
        if (c2.tenant !== c.tenant) same = false;
      }
      const bad = TENANT_ODDS.filter(([k, pr]) => Math.abs(got[k] / n - pr) > 0.01);
      const nine = { id: 7, race: 'homunculus', wanderKey: 'nine' }; rollTenant(nine);
      R.theRates = !bad.length && same && nine.tenant === null
        ? `across ${n} ids: ${TENANT_ODDS.map(([k, pr]) => `${k} ${(got[k] / n * 100).toFixed(1)}% (odds ${pr * 100}%)`).join(', ')}; the same id rolls the same tenant every time, and Nine has nobody in him`
        : `!! THE RATES ARE OFF: ${JSON.stringify(got)} over ${n}, same-id ${same}, Nine ${nine.tenant}`;
    }

    /* ---- 2. the Overflow ---- */
    {
      const c = vessel('nullborn', 'overflow');
      const foe = makeChar('Foe', 'bandit', c.x + 1, c.y, { atk: 5, def: 5, tough: 5 }); chars.push(foe);
      c.target = foe;
      _tenantT = 0; tenantTick(1);
      const shown = c.tenantKnown && c.gift === 'destruction' && (c.att.destruction || 0) >= 1;
      /* the discharge: force the roll, count who is burned */
      const side = makeChar('Beside', 'player', c.x + 0.8, c.y + 0.3, { atk: 10, def: 10, tough: 10 }); chars.push(side);
      rebuildCharGrid();           /* the crack reaches whoever `charsNear` says is there, and that is the grid */
      const hp0 = Object.values(side.parts).reduce((a, q) => a + q.hp, 0);
      let cracked = false;
      for (let i = 0; i < 40 && !cracked; i++) { tenantDischarge(c); cracked = Object.values(side.parts).reduce((a, q) => a + q.hp, 0) < hp0; }
      /* the Attention: the same working, with and without the tenant */
      const att = (t) => { c.tenant = t; c.mana = 99; c.castCd = 0; noticed = 0; const n0 = noticed; const s0 = seed; spendCast(c, 'firebolt'); seed = s0; return noticed - n0; };
      const withT = att('overflow'), withoutT = att(null); c.tenant = 'overflow';
      R.theOverflow = shown && cracked && Math.abs(withT - withoutT) < 1e-9
        ? `a Nullborn with an Overflow shows it in its first fight, as ${c.gift} at I; a working can crack out and burn the one beside it; and it draws ${withT.toFixed(2)} Attention, the same as without`
        : `!! THE OVERFLOW: shown ${shown} (gift ${c.gift}), cracked ${cracked}, attention ${withT} against ${withoutT}`;
      gone(side); gone(foe); gone(c);
    }

    /* ---- 3. the dreamer ---- */
    {
      const c = vessel('vatborn', 'dream');
      const x0 = c.stats.crafting; xpGain(c, 'crafting', 5); const withD = c.stats.crafting - x0;
      c.tenant = null; const x1 = c.stats.crafting; xpGain(c, 'crafting', 5); const withoutD = c.stats.crafting - x1; c.tenant = 'dream';
      /* a night it walks: force the roll by trying nights until it goes */
      hour = 23; let walked = false;
      for (let i = 0; i < 60 && !walked; i++) { c.dreamNight = -1; c.target = null; c.moveTarget = null; _tenantT = 0; tenantTick(1); walked = !!c.sleepwalkUntil; }
      const site = corpseSites.slice().sort((a, b2) => dist(a.x, a.y, c.x, c.y) - dist(b2.x, b2.y, c.x, c.y))[0];
      const toward = walked && c.moveTarget && site && dist(c.moveTarget.x, c.moveTarget.y, site.x, site.y) < 1;
      const mite = { faction: 'wild', siteId: site ? site.id : 0 };
      const spared = !hostile(c, mite) && !hostile(mite, c);
      hour = 12;
      R.theDreamer = withD > withoutD * 1.8 && toward && spared && c.tenantKnown
        ? `a dreamer learns ${c.dreamSkill} ${(withD / withoutD).toFixed(1)}x as fast, gets up in the night and walks toward the nearest Sundered ground, and the things there leave it alone`
        : `!! THE DREAMER: learns ${withD} vs ${withoutD}, walked ${walked} toward ${toward}, spared ${spared}, shown ${c.tenantKnown}`;
      c.sleepwalkUntil = 0; gone(c);
    }

    /* ---- 4. the echo ---- */
    {
      const c = vessel('vatborn', 'echo');
      c.tenantSince = day - 31; _tenantT = 0; tenantTick(1);
      const renamed = c.name === 'Ilse Carrow' && c.formerName === 'Vessel' && c.conviction === 'haunted';
      c.gift = 'dark'; c.att = { divine: 0, destruction: 0, dark: 2, dust: 0 }; c.mana = 99; c.stats.magic = 30; c.castCd = 0;
      const body = makeChar('Corpse', 'bandit', c.x + 1, c.y, {}); chars.push(body); kill(body, null);
      const before = chars.filter(o => o.faction === 'player' && o.undead).length;
      const said = []; const lg = log; log = (m) => said.push(m);
      try { resolveCastAt(c, 'raise', body.x, body.y); } finally { log = lg; }
      const after = chars.filter(o => o.faction === 'player' && o.undead).length;
      R.theEcho = renamed && after === before && said.length
        ? `after a season an echo answers to ${c.name} (poured as ${c.formerName}) and is haunted; asked to raise the dead it will not ("${said[0].slice(0, 70)}")`
        : `!! THE ECHO: renamed ${renamed} (${c.name}/${c.formerName}/${c.conviction}), risen ${before}->${after}, said ${said.join(' | ').slice(0, 120)}`;
      gone(c);
    }

    /* ---- 5. the Watcher ---- */
    {
      const c = vessel('vatborn', 'watcher');
      c.tenantKnown = true;
      const g = makeChar('Gaunt', 'gaunt', c.x + 2, c.y, {}); chars.push(g);
      const passBy = !hostile(g, c);
      c.gauntStruckH = nowH() + 6; const struck = hostile(g, c); c.gauntStruckH = 0;
      const pal = makeChar('Paladin', 'purge', c.x + 3, c.y, {}); chars.push(pal);
      const known = hostile(pal, c);
      hour = 1; const sees = seesInDark(c); hour = 12;
      /* turning: from THE WATCHERS WAKE, at TENANT_TURN_DAILY a day */
      const fs0 = fractureStage; fractureStage = 3;
      let days = 0; const d0 = day;
      while (c.faction === 'player' && days < 3000) { day++; days++; c.turnDay = -1; _tenantT = 0; tenantTick(1); }
      const turned = c.faction === 'gaunt';
      const early = vessel('vatborn', 'watcher', 2); early.tenantKnown = true; fractureStage = 2;
      for (let i = 0; i < 400; i++) { day++; early.turnDay = -1; _tenantT = 0; tenantTick(1); }
      const stayed = early.faction === 'player';
      day = d0; fractureStage = fs0;
      R.theWatcher = passBy && struck && known && sees && turned && stayed
        ? `a Watcher is passed by until it strikes a gaunt, the Order knows it on sight, it sees in the dark, and from THE WATCHERS WAKE it turned after ${days} days (1 in ${Math.round(1 / TENANT_TURN_DAILY)} a day); before it, four hundred days and it did not`
        : `!! THE WATCHER: passed ${passBy}, struck ${struck}, known ${known}, sees ${sees}, turned ${turned} after ${days}, stayed early ${stayed}`;
      gone(g); gone(pal); gone(c); gone(early);
    }

    /* ---- 6. Tallow ---- */
    {
      const t = chars.find(c => c.wanderKey === 'tallow');
      const cop = towns.find(x => x.def.key === 'copperhold');
      const where = t && cop && dist(t.x, t.y, cop.x, cop.y) < 30;
      const shown = t && t.tenant === 'echo' && t.tenantKnown && t.echoName === 'Ilse Carrow' && t.name === 'Tallow';
      for (const k of ['formula_t', 'formula_w', 'formula_p']) { delete stash[k]; for (const bn of bins()) if (bn.store) delete bn.store[k]; }
      for (const o of player()) for (const k of ['formula_t', 'formula_w', 'formula_p']) if (o.inv) delete o.inv[k];
      const g0 = t ? wandererGate(t) : { ok: true };
      stash.formula_w = 1;
      const g1 = t ? wandererGate(t) : { ok: false };
      const joined = t && recruitWanderer(t);
      const kept = campHas('formula_w') === 1;
      R.tallow = where && shown && !g0.ok && /formula/.test(g0.why) && g1.ok && joined && kept && t.faction === 'player' && t.name === 'Tallow'
        ? `Tallow is in Copperhold with her echo already known (${t.echoName}); she refuses with "${g0.why}", opens for a Worn Formula, joins, keeps her own name, and the formula is still in the stores`
        : `!! TALLOW: in Copperhold ${where}, echo ${shown}, gate ${g0.ok}/${g0.why} then ${g1.ok}, joined ${joined}, formula kept ${kept}`;
    }

    /* ---- 7. a save ---- */
    {
      const c = vessel('vatborn', 'dream'); c.tenantKnown = true; c.tenantSince = day - 3;
      const id = c.id;
      restore(JSON.parse(JSON.stringify(snapshot())));
      const c2 = chars.find(o => o.id === id);
      const t2 = chars.find(o => o.wanderKey === 'tallow');
      R.itSurvivesASave = c2 && c2.tenant === 'dream' && c2.tenantKnown && c2.dreamSkill === 'crafting' && t2 && t2.tenant === 'echo' && t2.tenantKnown
        ? 'a save and a reload keep who is in which vessel, whether it has shown, and what it dreams'
        : `!! AFTER A SAVE: ${c2 ? `${c2.tenant}/${c2.tenantKnown}/${c2.dreamSkill}` : 'the vessel is gone'}; Tallow ${t2 && t2.tenant}`;
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE VESSELS ARE WRONG (${bad.length + errs.length}) ***` : 'EVERY VESSEL HOLDS WHOEVER IT HOLDS');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
