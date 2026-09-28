#!/usr/bin/env node
/* WHO COMES BACK OUT OF THE JAR.
 *
 * "Upon rebuilding Lyonart from his phylactery, he takes on the generic reliquary lich model."
 *
 * The phylactery kept a note about the person — name, race, gift, stats, age, gear, spouse —
 * and the rebuild made a brand-new body out of the note. His face was not on it, and the face
 * is the only thing that gives a lich Lyonart's own head; nor were his sex, house, conviction,
 * regard or attunements, and the new body had a new id, so every roll of his look moved too.
 * The husk a Sigil-Bound sheds was the same note and the same rebuild. So:
 *
 *   1. LYONART, SHED AND REBUILT AT A CIRCLE, IS LYONART: the same id, face, sex, house,
 *      conviction, regard and attunements, and the head the game gives him is his own lich
 *      head, not the robe
 *   2. AND SO ACROSS A SAVE: shed, saved and loaded with the jar still on the ground, then
 *      rebuilt — the same person comes out
 *   3. THE HUSK THE SAME: a Sigil-Bound re-etched at a forge keeps who they were and the
 *      vessel they were poured into
 *   4. AND A JAR FROM A SAVE WRITTEN BEFORE THIS still rebuilds, from its note, as it did
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/phylactery.js [game.html]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    paused = true;
    const L = [], bad = (m) => L.push('!! ' + m), ok = (m) => L.push('   ' + m);
    const me = player()[0];
    const spot = findOpenNear(Math.round(me.x) + 8, Math.round(me.y) + 8, 6);
    for (const k of Object.keys(REBUILD_COST)) addItem(k, REBUILD_COST[k] * 4);
    for (const k of Object.keys(HUSK_COST)) addItem(k, HUSK_COST[k] * 4);
    const circle = { type: 'circle', x: Math.round(spot.x), y: Math.round(spot.y), w: 2, h: 2, floor: 0, progress: 1 };
    const forge = { type: 'forge', x: Math.round(spot.x) + 6, y: Math.round(spot.y), w: 2, h: 2, floor: 0, progress: 1 };
    const bearer = makeChar('Bearer', 'player', spot.x + 1, spot.y + 1, { atk: 5, def: 5, tough: 8 });
    bearer.state = 'ok'; chars.push(bearer);

    /* the person, dressed as the origin sets him up */
    const lyonart = () => {
      const c = makeChar('Lyonart Probe', 'player', spot.x + 2, spot.y, { atk: 12, def: 10, tough: 12, magic: 30, race: 'human' });
      c.state = 'ok'; c.sex = 'm'; c.face = 'lyonart'; c.house = 'alagadda'; c.conviction = 'ambitious'; c.regard = 37;
      c.lich = true; c.undead = true; c.att.dark = 6; c.att.destruction = 2;
      chars.push(c); return c;
    };
    const who = (c) => ({ id: c.id, face: c.face, sex: c.sex, house: c.house, conviction: c.conviction, regard: c.regard,
                          dark: c.att && c.att.dark, destruction: c.att && c.att.destruction, magic: Math.round(c.stats.magic) });
    const same = (a, b2) => Object.keys(a).filter(k => a[k] !== b2[k]).map(k => `${k} ${a[k]} -> ${b2[k]}`);
    const rebuiltAt = (name) => chars.find(c => c.name === name && c.state === 'ok' && c !== bearer);

    /* 1 */
    {
      const c = lyonart(); const was = who(c);
      shedPhylactery(c);
      const jar = phylacteries[phylacteries.length - 1];
      bearer.phyl = jar; jar.carried = true;
      const done = rebuildLich(bearer, circle);
      const back = rebuiltAt('Lyonart Probe');
      if (!done || !back) bad(`1. the rebuild ${done ? 'ran but nobody stood up' : 'refused'}`);
      else {
        const diff = same(was, who(back));
        if (diff.length) bad(`1. a different person came back: ${diff.join(', ')}`);
        else if (headKeyOf(back) !== 'lyonlich' || robedLich(back)) bad(`1. he is himself on paper but wears ${robedLich(back) ? 'the robe' : 'head ' + headKeyOf(back)}`);
        else ok(`1. Lyonart comes back as Lyonart: id ${back.id}, ${back.face}, ${back.house}, ${back.conviction}, regard ${back.regard}, Dark ${back.att.dark}, and his own lich head (${headKeyOf(back)})`);
        chars.splice(chars.indexOf(back), 1);
      }
    }

    /* 2 */
    {
      const c = lyonart(); const was = who(c);
      shedPhylactery(c);
      const jarId = phylacteries[phylacteries.length - 1].id;
      restore(JSON.parse(JSON.stringify(snapshot())));
      const jar = phylacteries.find(q => q.id === jarId);
      const b2 = chars.find(o => o.id === bearer.id);
      if (!jar || !b2) bad(`2. after the load the jar ${jar ? 'is there' : 'is gone'} and the bearer ${b2 ? 'is there' : 'is gone'}`);
      else {
        b2.phyl = jar; jar.carried = true;
        const done = rebuildLich(b2, circle);
        const back = rebuiltAt('Lyonart Probe');
        const diff = back ? same(was, who(back)) : ['nobody'];
        if (!done || !back || diff.length) bad(`2. rebuilt from a loaded save: ${back ? diff.join(', ') : 'nobody stood up'}`);
        else if (headKeyOf(back) !== 'lyonlich') bad(`2. after a load he is himself on paper but wears head ${headKeyOf(back)}`);
        else ok(`2. and through a save with the jar on the ground: the same id (${back.id}), face, house, conviction, regard and attunements`);
        if (back) chars.splice(chars.indexOf(back), 1);
      }
    }

    /* 3 */
    {
      const bb = chars.find(o => o.name === 'Bearer');
      const c = makeChar('Vessa', 'player', spot.x + 3, spot.y, { atk: 12, def: 10, tough: 12, race: 'human' });
      c.state = 'ok'; c.sex = 'f'; c.house = 'ferrum'; c.conviction = 'loyal'; c.regard = 21; chars.push(c);
      ascendTransmute(c); c.att.destruction = 5;
      const was = Object.assign(who(c), { vessel: c.vesselPattern });
      shedHusk(c);
      const h = phylacteries[phylacteries.length - 1];
      bb.phyl = h; h.carried = true;
      const done = reEtchHusk(bb, forge);
      const back = rebuiltAt('Vessa');
      const diff = back ? same(was, Object.assign(who(back), { vessel: back.vesselPattern })) : ['nobody'];
      if (!done || !back || diff.length) bad(`3. the re-etched ${back ? 'came back different: ' + diff.join(', ') : 'never stood up'}`);
      else ok(`3. a husk re-etched at a forge is the same person too: id ${back.id}, ${back.sex}, ${back.house}, ${back.conviction}, poured into the ${back.vesselPattern} again`);
      if (back) chars.splice(chars.indexOf(back), 1);
    }

    /* 4 */
    {
      const bb = chars.find(o => o.name === 'Bearer');
      const old = { id: 9901, x: spot.x, y: spot.y,
        soul: { name: 'Old Jar', race: 'human', gift: 'dark', omni: false, stats: { ...me.stats }, age: 40, goal: null,
                weapon: null, armor: null, pack: null, inv: {}, spouse: 0, partner: 0 } };
      phylacteries.push(old);
      bb.phyl = old; old.carried = true;
      const done = rebuildLich(bb, circle);
      const back = rebuiltAt('Old Jar');
      if (!done || !back || !back.lich) bad(`4. a jar from an older save ${done ? 'rebuilt nobody' : 'was refused'}`);
      else ok('4. and a jar from a save written before this still rebuilds from its note');
      if (back) chars.splice(chars.indexOf(back), 1);
    }
    return L;
  });
  for (const l of out) console.log(l);
  for (const e of errs) console.log('!! ' + e);
  const failed = out.some(l => l.startsWith('!!')) || errs.length;
  console.log(failed ? 'FAIL' : 'PASS');
  await b.close();
  process.exit(failed ? 1 : 0);
})();
