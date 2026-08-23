#!/usr/bin/env node
/* WHOSE NAME IT IS, AND WHAT THAT SAYS ABOUT THEM.
 *
 * "Would be nice to have race-specific naming conventions. Also some dialogue as well."
 *
 * Everything in the world drew its given name from one pool, so a golem that has been holding
 * a door since before the Fracture was called Juno Marchant and a homunculus poured in a vat
 * had a family name. A name is the first thing you learn about somebody and it was saying
 * nothing at all.
 *
 * Measured in a LIVE WORLD, off the bodies worldgen actually built, rather than by calling
 * the namer in a loop — because the fault was never in the namer. It was in the callers: the
 * race was rolled AFTER the name in three places and patched on afterwards in a fourth, so
 * a namer that knew about races would still have produced human names for every homunculus in
 * Copperhold and every hollow in Hollowmere.
 *
 * And then the invariant this file has been bitten by four times: BUILDING A BODY COSTS THE
 * SAME NUMBER OF DRAWS WHATEVER THE BODY IS. Six naming conventions is six new chances to
 * spend a different number of numbers on a golem than on a farm girl, which skews every roll
 * downstream of it in the same town.
 *
 *   node tools/names.js [game.html]
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
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const given = (n) => String(n || '').trim().split(' ')[0];

    /* ---------- 1. THE WORLD, AS BUILT ----------
       Only people the game NAMED. `Warden`, `Mercenary`, `Pauper` and the rest are ROLE
       LABELS deliberately shared by everyone holding that role, and a first pass at this
       counted six Paupers as a naming collision — which is the probe being wrong about what
       a name is, not the game. So: townsfolk, your own squad, and town lords, and nothing
       else. */
    const named = chars.filter(c => c.name && !c.beast && !c.undead && c.faction !== 'gaunt' &&
      (c.civ || c.faction === 'player' || c.isLeader >= 0));
    /* AND THE HIRING BOARDS, which is the only place in a fresh world you meet a golem or a
       chimera at all — worldgen puts a handful of made people in the streets and the rest of
       them behind a bar, waiting to be paid. A probe that reads only the streets checks three
       homunculi and calls it a population. */
    const roster = [...named.map(c => ({name: c.name, race: c.race || 'human'}))];
    for (const t of towns) for (const r of (t.recruits || [])) roster.push({name: r.name, race: r.race || 'human'});
    const byRace = {};
    for (const c of roster) (byRace[c.race] = byRace[c.race] || []).push(c);
    R.world = Object.entries(byRace).map(([k, v]) => `${k} ${v.length}`).join(', ');

    /* the human given-name pool, which is what everything used to draw from */
    const humanGiven = new Set([...NAMES_M, ...NAMES_F, ...NAMES_N]);
    const ownPool = (race) => {
      if (typeof RACE_NAMES !== 'object') return null;
      if (race === 'mimic') return null;
      const L = RACE_NAMES[race];
      return L && L.given ? new Set(L.given) : null;
    };

    /* ---------- 2. EVERY MADE RACE NAMES ITS OWN ----------
       Asked of the bodies in the world and not of the table, so a namer that works and a
       caller that never tells it the race still fails. */
    {
      const wrong = [];
      let checked = 0;
      for (const race of ['homunculus', 'golem', 'chimera']) {
        const pool = ownPool(race);
        const folk = byRace[race] || [];
        if (!pool) { wrong.push(race + ': no pool'); continue; }
        for (const c of folk) { checked++; if (!pool.has(given(c.name))) wrong.push(`${race}: ${c.name}`); }
      }
      R.everyMadeRaceNamesItsOwn = (checked >= 6 && wrong.length === 0)
        ? `${checked} homunculi, golems and chimera in the world and every one of them is named the way its kind is named`
        : `!! ${wrong.length}/${checked} CARRY A NAME FROM SOMEBODY ELSE'S POOL: ${wrong.slice(0, 4).join(' · ')}`;
    }

    /* ---------- 3. AND A GOLEM'S NAME IS NOT A NAME ----------
       The clearest case in the report and the one worth naming out loud: a golem was never
       given a name, it was given a LABEL by an owner who has been dead for centuries. */
    {
      /* ---------- A GOLEM MAY SIMPLY NOT EXIST TODAY ----------
       Golems are 1.8% of what walks (races.js measures it), so whether one turns up in a given
       world is a coin flip — one on the first run of this file and none on the second, which
       reported "THERE ARE NO GOLEMS TO CHECK" about a naming convention that works perfectly.
       A probe whose subject may not exist is not a probe. So the CLAIM is asked of the namer
       directly, twelve times, and whatever golems the world happens to be carrying are
       reported beside it as colour rather than as the test. */
      const pool = ownPool('golem');
      const made = [];
      for (let i = 0; i < 12; i++) made.push(pickNameFor(i % 2 ? 'f' : 'm', true, 'golem'));
      const wrong = pool ? made.filter(n => !pool.has(given(n))) : made;
      const gs = byRace.golem || [];
      R.andAGolemsNameIsALabel = wrong.length === 0
        ? `and twelve golems out of the namer are called things like "${made.slice(0, 2).join('", "')}"` +
          (gs.length ? ` — and the ${gs.length} in this world are ${gs.map(c => '"' + c.name + '"').join(', ')}` : ' (this world happens to have none walking about)')
        : `!! ${wrong.length}/12 GOLEM NAMES CAME OUT OF SOMEBODY ELSE'S POOL: ${wrong.slice(0, 3).join(', ')}`;
      /* and none of them is a human given name, which is the actual complaint */
      R.andNotOneOfThemIsBoskDrybones = made.every(n => !humanGiven.has(given(n)))
        ? 'and not one of the twelve is a name a person in this world would answer to'
        : `!! A GOLEM IS CALLED ${made.find(n => humanGiven.has(given(n)))}`;
    }

    /* ---------- 4. AND A TOWN LEADER IS NAMED FOR WHAT IT IS ----------
       `makeLeader` built one object literal in which the name was drawn BEFORE the race was
       rolled, in the same expression. Nothing about that reads as wrong until you meet a
       golem lord called Bess Tolliver. */
    {
      const bad = towns.filter(t => t.leader && t.leader.race && t.leader.race !== 'human' &&
        ownPool(t.leader.race) && !ownPool(t.leader.race).has(given(t.leader.name)));
      const made = towns.filter(t => t.leader && t.leader.race !== 'human');
      R.andSoIsALordInAHall = bad.length === 0
        ? (made.length
            ? `and the ${made.length} lord(s) who are not human are named for what they are: ${made.map(t => t.leader.name).slice(0, 3).join(', ')}`
            : 'and every lord in the world happens to be human this run, which is not a failure')
        : `!! ${bad.length} LORD(S) ARE NAMED AS HUMANS: ${bad.map(t => t.leader.race + ' ' + t.leader.name).join(', ')}`;
    }

    /* ---------- 5. AND A NAME STILL COSTS WHAT A NAME COSTS ----------
       The invariant. Six conventions is six chances to spend a different number of draws on a
       golem than on a farm girl, and every roll after it in that town moves. Measured off the
       seeded counter itself and not off a fingerprint. */
    {
      const cost = {};
      for (const race of ['human', 'homunculus', 'golem', 'chimera', 'hollow', 'mimic']) {
        const s0 = seed;
        for (let i = 0; i < 50; i++) pickNameFor(i % 2 ? 'f' : 'm', true, race, race === 'mimic' ? 'succubus' : null);
        cost[race] = ((seed - s0) >>> 0);
      }
      const s1 = seed;
      for (let i = 0; i < 50; i++) pickNameFor('m', false, 'golem');
      cost.__short = ((seed - s1) >>> 0);
      const full = new Set(['human', 'homunculus', 'golem', 'chimera', 'hollow', 'mimic'].map(k => cost[k]));
      R.andANameCostsWhatANameCosts = (full.size === 1 && cost.__short !== cost.human)
        ? `and fifty full names cost the seeded stream the same on all six races, and a bare given name costs less`
        : `!! A NAME COSTS A DIFFERENT NUMBER OF DRAWS BY RACE: ${JSON.stringify(cost)}`;
    }

    /* ---------- 6. CONTROL: THE NAMES ARE STILL DISTINCT ----------
       Splitting one pool six ways is the obvious way to make every third person share a name,
       which is the fault the two-part name was introduced to fix in the first place. */
    {
      /* ONE-NAME PEOPLE ARE SUPPOSED TO COLLIDE. `full` is the whole distinction the namer
         draws: "townsfolk and bandits are known by two names because you will meet them
         twice, and children by one because they have not earned the second yet." There are
         forty-seven given names and three children called Ash is the design working. The
         claim worth defending is the one the two-part name was introduced to make. */
      const twoPart = named.filter(c => String(c.name).trim().includes(' '));
      const counts = {};
      for (const c of twoPart) counts[c.name] = (counts[c.name] || 0) + 1;
      const rate = 1 - Object.keys(counts).length / twoPart.length;
      const worst = Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])[0];
      R.andNobodySharesANameWithAStranger = rate < 0.03
        ? `and ${twoPart.length} people known by two names collide ${(rate * 100).toFixed(1)}% of the time, split six ways or not`
        : `!! ${(rate * 100).toFixed(1)}% OF ${twoPart.length} TWO-PART NAMES ARE SHARED, WORST "${worst && worst[0]}" x${worst && worst[1]}`;
    }

    /* ---------- 7. AND EVERY RACE HAS SOMETHING TO SAY ABOUT BEING ONE ----------
       The other half of the report. Six races shared one set of tables, so a golem that has
       held a door for nine hundred years and a farm girl out of Greenrest had the same eight
       opinions about you and the larder. */
    if (typeof raceBark === 'function') {
      const born = [];
      const seen = {};
      const races = ['human', 'homunculus', 'golem', 'chimera', 'hollow'];
      for (const race of races) {
        const c = makeChar('T', 'player', 500, 500, { race });
        c.__probe = true; c.state = 'ok'; c.race = race; chars.push(c); born.push(c);
        const sset = new Set();
        for (let i = 0; i < 60; i++) { const l = raceBark(c); if (l) sset.add(l); }
        seen[race] = sset;
      }
      const empty = races.filter(r => seen[r].size < 2);
      const shared = [];
      for (let i = 0; i < races.length; i++) for (let j = i + 1; j < races.length; j++)
        if ([...seen[races[i]]].some(l => seen[races[j]].has(l))) shared.push(races[i] + '/' + races[j]);
      R.andEveryRaceHasAViewOnBeingOne = (empty.length === 0 && shared.length === 0)
        ? `and five races say ${races.reduce((a, r) => a + seen[r].size, 0)} things between them with no two sharing a line`
        : `!! ${empty.length ? 'SILENT: ' + empty.join(', ') + '. ' : ''}${shared.length ? 'SHARED: ' + shared.join(', ') : ''}`;

      /* and the three mimic lines are three different things to be, which is the whole point
         of there being three of them */
      const mim = {};
      for (const sub of ['succubus', 'doppelganger', 'fallen']) {
        const c = makeChar('M', 'player', 501, 501, { race: 'mimic', sub });
        c.__probe = true; c.state = 'ok'; c.race = 'mimic'; c.sub = sub; chars.push(c); born.push(c);
        const sset = new Set();
        for (let i = 0; i < 60; i++) { const l = raceBark(c); if (l) sset.add(l); }
        mim[sub] = sset;
      }
      const mk = Object.keys(mim);
      const mShared = [];
      for (let i = 0; i < mk.length; i++) for (let j = i + 1; j < mk.length; j++)
        if ([...mim[mk[i]]].some(l => mim[mk[j]].has(l))) mShared.push(mk[i] + '/' + mk[j]);
      R.andTheThreeMimicsAreThreeThings = (mShared.length === 0 && mk.every(k => mim[k].size >= 2))
        ? `and the succubus, the doppelganger and the fallen share nothing at all (${mk.map(k => mim[k].size).join('/')} lines)`
        : `!! THE MIMIC LINES OVERLAP: ${mShared.join(', ') || mk.map(k => k + ':' + mim[k].size).join(' ')}`;

      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    } else {
      R.andEveryRaceHasAViewOnBeingOne = '!! THERE IS NO raceBark';
      R.andTheThreeMimicsAreThreeThings = '!! THERE IS NO raceBark';
    }

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE NAMES STILL SAY NOTHING (${bad.length + errs.length})`
    : 'EVERY KIND NAMES ITS OWN');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
