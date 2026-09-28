#!/usr/bin/env node
/* THE OLD KING'S COURT, CHECKED IN PLAY (2026-09-27). Four, one to an Art, each come through
 * onto the ground that Art made, and each one put down first is an Art the old king comes down
 * without.
 *
 *   1. nobody of the court is in the world before the Fracture brings them
 *   2. they come one at a time as it climbs: the Master onto the rust barrens at 60, the Keeper
 *      into the vat bog at 75, the Unremembered out onto the salt flats at 90, each well clear
 *      of anybody's walls
 *   3. the Chancellor comes when the Door opens, into the colonnade under it
 *   4. each fights with its Art: the Chancellor mends, the Master's blows go through armour, the
 *      Keeper feeds on what it takes, and eyes slide off the Unremembered in a fight
 *   5. with the whole court standing the old king would come down with all four; put two down
 *      first and he comes down with the other two, and the log says which
 *   6. the court, and what the king carries, survive a save
 *   7. nothing the player reads calls him the Hanged King
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/kingscourt.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    if (typeof courtTick !== 'function') { R.nobodyYet = '!! THERE IS NO COURT IN THIS BUILD'; return R; }
    paused = true; hour = 12;
    const heard = [];
    { const orig = log; log = function (t) { heard.push(String(t)); return orig.apply(this, arguments); }; }
    const saidNow = (fn) => { const a = heard.length; fn(); return heard.slice(a).join(' '); };
    const tick = (n) => { for (let i = 0; i < n; i++) { _courtT = 0; courtTick(1); } };
    const court = () => chars.filter(c => c.courtKey && c.state !== 'dead');
    const of = (key) => chars.find(c => c.courtKey === key && c.state !== 'dead');
    const me = player()[0];
    towns.forEach(t => { t.sacked = 0; t.order = 70; });

    /* ---- 1. not yet ---- */
    fracture = 30; fractureStage = fractureStageOf(fracture);
    tick(1);
    R.nobodyYet = (court().length === 0 && Object.keys(courtCame).length === 0)
      ? 'at Fracture 30 there is nobody of the court anywhere in the world'
      : `!! ${court().length} OF THE COURT ARE ALREADY OUT: ${court().map(c => c.name).join(', ')}`;

    /* ---- 2. as it climbs, each onto its ground ---- */
    {
      const bits = [], seen = [];
      const want = { master: [60, BIOME_RUST, 'rust barrens'], keeper: [75, BIOME_VAT, 'vat bog'], unremembered: [90, BIOME_SALT, 'salt flats'] };
      for (const [key, [at, bio, where]] of Object.entries(want)) {
        fracture = at - 1; tick(1);
        if (of(key)) bits.push(`${key} came before ${at}`);
        fracture = at;
        const said = saidNow(() => tick(1));
        const c = of(key);
        if (!c) { bits.push(`${key} did not come at ${at}`); continue; }
        if (biomeAt(c.x, c.y) !== bio) bits.push(`${key} is not on the ${where}`);
        const near = towns.find(t => dist(c.x, c.y, t.x, t.y) < (t.clearR || 20) + 20);
        if (near) bits.push(`${key} came through inside ${near.name}`);
        if (!/masked|somebody out on the salt/i.test(said)) bits.push(`${key} arrived unannounced`);
        seen.push(`${c.name} (${where}, ${Math.round(dist(c.x, c.y, CRATER.x, CRATER.y))} tiles off the crater)`);
      }
      R.theyComeAsItClimbs = bits.length ? '!! ' + bits.join('; ').toUpperCase()
        : `one at a time as the Fracture climbs, each onto its own ground and clear of every town: ${seen.join('; ')}`;
    }

    /* ---- 3. the Chancellor, with the Door ---- */
    let d = null;
    {
      for (const k of Object.keys(DOOR_SEAL_COST)) stash[k] = (stash[k] || 0) + 999;
      fracture = 100; fractureStage = fractureStageOf(fracture); ruin = false; theDoor = null;
      tick(1);
      const early = of('chancellor');
      d = openTheDoor();
      tick(1);
      const ch = of('chancellor');
      R.theChancellorComesWithTheDoor = (!early && ch && dist(ch.x, ch.y, CRATER.x, CRATER.y) < 24)
        ? `not before the Door, and then under it: ${ch.name}, ${dist(ch.x, ch.y, CRATER.x, CRATER.y).toFixed(1)} tiles from the middle, in the colonnade`
        : `!! EARLY ${!!early}, CHANCELLOR ${!!ch}${ch ? ' AT ' + dist(ch.x, ch.y, CRATER.x, CRATER.y).toFixed(1) : ''}`;
    }

    /* ---- 4. the arts ---- */
    {
      const bits = [], good = [];
      /* the Chancellor mends */
      const ch = of('chancellor');
      if (ch) { ch.blood = ch.maxBlood * 0.5; const b0 = ch.blood; tick(8);
        if (ch.blood > b0) good.push(`the Chancellor mends ${Math.round(ch.blood - b0)} in eight seconds`); else bits.push('the Chancellor does not mend'); }
      /* the Master's blows go through armour: the same blow, with and without the art */
      const ms = of('master');
      const v = makeChar('Target', 'town', ms ? ms.x + 1 : 5, ms ? ms.y : 5, { tough: 20, armr: 10 });
      v.armor = 'a_pla'; chars.push(v);
      const loss = (a, n) => { let t = 0; for (let i = 0; i < n; i++) { v.parts.chest.hp = 100; v.blood = v.maxBlood; v.state = 'ok';
        applyDamage(a, v, 'chest', 30, 'cut'); t += 100 - v.parts.chest.hp; } return t / n; };
      if (ms) {
        const withArt = loss(ms, 20); const keep = ms.courtArts; ms.courtArts = null;
        const without = loss(ms, 20); ms.courtArts = keep;
        if (withArt > without * 1.2) good.push(`the Master's blow takes ${withArt.toFixed(1)} through plate, where the same blow without the art takes ${without.toFixed(1)}`);
        else bits.push(`the master's blow is no worse through plate (${withArt.toFixed(1)} vs ${without.toFixed(1)})`);
      }
      /* the Keeper feeds */
      const kp = of('keeper');
      if (kp) { kp.blood = kp.maxBlood * 0.5; const b0 = kp.blood; v.parts.chest.hp = 100; v.state = 'ok';
        applyDamage(kp, v, 'chest', 40, 'cut');
        if (kp.blood > b0) good.push(`the Keeper takes ${Math.round(kp.blood - b0)} back out of what it did`); else bits.push('the keeper does not feed'); }
      /* eyes slide off the Unremembered, in a fight */
      const un = of('unremembered');
      if (un) { un.veilT = 0; un.target = null; tick(14); const idle = un.veilT > 0;
        un.target = me; tick(14);
        if (!idle && un.veilT > 0) good.push(`the Unremembered folds out of sight in a fight (${un.veilT.toFixed(0)}s) and not out of one`);
        else bits.push(`the unremembered: idle fold ${idle}, fighting fold ${un.veilT}`);
        un.target = null; un.veilT = 0; }
      { const i = chars.indexOf(v); if (i >= 0) chars.splice(i, 1); }
      R.eachFightsWithItsArt = bits.length ? '!! ' + bits.join('; ').toUpperCase() : good.join('; ');
    }

    /* ---- 5. what the king comes down with ---- */
    {
      /* the whole court standing: what he WOULD carry, read off a throwaway door */
      const d0 = { x: d.x, y: d.y, r: d.r };
      oldKingComesDown(d0);
      const k0 = chars.filter(c => c.bossKey === 'oldking').pop();
      const full = k0 ? [...(k0.courtArts || [])] : [];
      { const i = chars.indexOf(k0); if (i >= 0) chars.splice(i, 1); }
      /* now put two of them down first, and bring him down for real */
      const lost = saidNow(() => { kill(of('master'), me); kill(of('keeper'), me); });
      const br = broodAlive(); if (br) kill(br, me);
      me.x = theDoor.x; me.y = theDoor.y; me.mana = 999; me.gift = me.gift || 'dark'; me.stats.magic = 25;
      theDoor.kingDown = false; theDoor.work = DOOR_WORK;
      const down = saidNow(() => workTheDoor(me, 1 / 30));
      const k = oldKingAlive();
      const arts = k ? (k.courtArts || []) : [];
      const ok = full.length === 4 && arts.length === 2 && arts.includes('divine') && arts.includes('dust')
        && /without the Master's unmaking/.test(lost) && /without the Keeper's hunger/.test(lost)
        && /absolution/.test(down) && /fold/.test(down) && !/unmaking|hunger/.test(down);
      R.eachOneDownIsAnArtHeLoses = ok
        ? `with the whole court up he would carry all four; with the Master and the Keeper put down first he comes down with ${arts.join(' and ')}, and the log says so`
        : `!! FULL ${full.join(',')} — AFTER TWO DOWN ${arts.join(',')} — LOST "${lost.slice(0, 80)}" — DOWN "${down.slice(0, 120)}"`;
    }

    /* ---- 6. through a save ---- */
    {
      const came = Object.keys(courtCame).sort().join(',');
      restore(JSON.parse(JSON.stringify(snapshot())));
      const k2 = oldKingAlive();
      const alive = court().map(c => c.courtKey).sort().join(',');
      const ok = Object.keys(courtCame).sort().join(',') === came && alive === 'chancellor,unremembered'
        && k2 && (k2.courtArts || []).length === 2 && court().every(c => c.courtArts && c.courtArts.length === 1);
      R.itSurvivesASave = ok
        ? 'a save and a reload keep who has come through, the two still standing with their arts, and the two the king carries'
        : `!! CAME ${Object.keys(courtCame).join(',')} (WAS ${came}), ALIVE ${alive}, KING ARTS ${k2 && k2.courtArts}`;
    }

    /* ---- 7. outwardly ---- */
    {
      const all = [...Object.values(COURT_COMES), ...Object.values(ART_TELL), ...Object.values(COURT).map(c => c.name), heard.join(' ')].join(' ');
      R.outwardlyOnlyTheOldKing = !/hanged king/i.test(all)
        ? 'and nothing a player reads calls him anything but the old king'
        : '!! "HANGED KING" IS IN PLAYER-FACING TEXT';
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  const which = Object.keys(out).filter(k => typeof out[k] === 'string' && out[k].startsWith('!!'));
  console.log(bad.length || errs.length ? `*** THE COURT IS WRONG (${bad.length + errs.length}): ${[...which, ...errs.map(() => 'pageerror')].join(', ')} ***`
                                        : 'THE COURT COMES THROUGH, AND EACH ONE DOWN IS AN ART HE LOSES');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
