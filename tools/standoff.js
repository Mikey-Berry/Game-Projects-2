#!/usr/bin/env node
/* TWO WAYS TO BE IN A FIGHT AND NOT BE FIGHTING.
 *
 * "Sometimes AI set to ranged pause JUST outside their own attack range while engaged with an
 *  enemy. Battle stance, the red target line drawn, but not attacking. I have to manually move
 *  them forward a bit before they will attack."
 *
 * "Sometimes fighting enemies get stuck in a weird sliding animation where neither side is
 *  attacking, simply sliding around. Seems to especially happen with extremely large enemies."
 *
 * These are the same shape of fault twice: a body walks to where the code told it to stand, and
 * where it told it to stand is outside where it is allowed to swing or shoot. Nothing is stuck
 * in the sense of a hang — every part is working, and the two numbers disagree.
 *
 * So this file never asks "did it win". It asks, for a body that HAS a target and is standing
 * still: is the place it settled inside the range it needs? A fight nobody can start is a
 * distance, and a distance is measurable.
 *
 *   node tools/standoff.js [game.html]
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
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };
    const step = (secs, dt = 1 / 30) => { for (let i = 0; i < secs / dt; i++) update(dt); };
    /* ---------- THE POST HAS TO STAY WHERE IT WAS PUT ----------
       A `wild` body with nothing to do still wanders, and a wandering post walks into the
       archer measuring its stand-off distance: a Hunting Bow "settled at 1.47" of a 7-tile
       range because the target came to it. Where the distance is the measurement, the target
       does not get a vote. */
    const stepPinned = (secs, post, dt = 1 / 30) => {
      const px = post.x, py = post.y;
      for (let i = 0; i < secs / dt; i++) { post.x = px; post.y = py; post.vx = post.vy = 0; update(dt); }
      post.x = px; post.y = py;
    };

    let gx = 0, gy = 0;
    outer:
    for (let y = 90; y < H - 90; y += 7) for (let x = 90; x < W - 90; x += 7) {
      if (nearestTownDist(x, y) < 90) continue;
      let ok = true;
      for (let dy = -10; dy <= 10 && ok; dy++) for (let dx = -10; dx <= 10; dx++) if (isBlocked(x + dx, y + dy)) { ok = false; break; }
      if (ok) { gx = x; gy = y; break outer; }
    }
    R._where = `staged on open waste at ${gx},${gy}`;
    const wipe = () => { for (let i = chars.length - 1; i >= 0; i--) if (dist(chars[i].x, chars[i].y, gx, gy) < 70) chars.splice(i, 1); };
    const putAt = (fac, x, y, o) => {
      const c = makeChar(o.name || fac, fac, x, y, { atk: 20, def: 12, tough: 16, ath: 8, ...o });
      c.state = 'ok'; c.x = x; c.y = y; chars.push(c); return c;
    };

    /* ================== 1. THE SLIDE, AND WHAT SIZE IT STARTS AT ==================
       A body that cannot be reached does not report an error; it reports a fight. So the
       measurement is landed blows over a fixed stretch of simulation, swept across sizes, with
       the ordinary-sized case as its own control — if the small one also lands nothing then
       the staging is what is broken, not the reach. */
    guard(['aManCanHitAMan', 'andAManCanHitAMonster', '_bySize'], () => {
      const rows = [], landed = {};
      for (const big of [1, 1.15, 1.3, 1.6, 2.2]) {
        wipe();
        const foe = putAt('wild', gx + 2, gy, { name: 'Big' + big, tough: 60, def: 6, weapon: null });
        foe.big = big; foe.blood = foe.maxBlood = 4000; foe.noFight = true;   /* a post, not a fight */
        const me = putAt('player', gx, gy, { name: 'Me', weapon: 'w_kat', armor: 'a_lea' });
        me.blood = me.maxBlood = 4000;
        me.target = foe; me.targetManual = true;
        const b0 = foe.blood;
        step(30);
        const hit = b0 - foe.blood;
        landed[big] = hit;
        rows.push(`big ${big}: slot ${slotRadius(foe).toFixed(2)}, settled ${dist(me.x, me.y, foe.x, foe.y).toFixed(2)}, ${hit > 0 ? hit.toFixed(0) + ' blood off it' : 'NOT ONE BLOW'}`);
      }
      R._bySize = rows.join(' | ');
      R.aManCanHitAMan = landed[1] > 0
        ? `an ordinary fight lands blows (${landed[1].toFixed(0)} blood in thirty seconds), so the staging is sound`
        : '!! A MAN CANNOT HIT A MAN IN THIS STAGING — nothing below means anything';
      /* A RATE, NOT A YES/NO. The old build was not stalled, it was nearly stalled — 104 blood
         off an ordinary body and EIGHT off a wyrm over the same thirty seconds, the eight
         being the frames a shove happened to push him inside 1.0. "Did any blow land" is green
         for that; "is this a fight" is not. Half the ordinary rate is the bar. */
      const thin = [1.15, 1.3, 1.6, 2.2].filter(k => landed[k] < landed[1] * 0.5);
      R.andAManCanHitAMonster = thin.length === 0
        ? `and so does every size up to a wyrm, at a comparable rate — ${[1, 1.15, 1.3, 1.6, 2.2].map(k => landed[k].toFixed(0)).join('/')} blood`
        : `!! SIZE ${thin.join(', ')} TAKES UNDER HALF WHAT A MAN DOES (${[1, 1.15, 1.3, 1.6, 2.2].map(k => landed[k].toFixed(0)).join('/')}) — they stand where they can barely swing`;
    });

    /* AND THE TWO NUMBERS AGREE BY CONSTRUCTION. The slide is what happens when the place a
       body is sent to stand is further off than the distance it is allowed to swing from. That
       is not a tuning question, it is an invariant, and it is worth pinning directly so the
       next person to change one of them cannot break the other quietly. */
    guard(['whereItStandsIsWhereItCanSwing'], () => {
      const bad = [];
      for (const big of [1, 1.15, 1.3, 1.6, 2.2, 3, 4]) {
        const t = { big };
        if (!(slotRadius(t) < meleeReach(t))) bad.push(`big ${big}: stands at ${slotRadius(t).toFixed(2)}, reaches ${meleeReach(t).toFixed(2)}`);
        /* and the swing must still resolve — `windup` throws the blow away past 1.7 tiles */
        if (meleeReach(t) > 1.7) bad.push(`big ${big}: reach ${meleeReach(t).toFixed(2)} is past the 1.7 the blow resolves at`);
      }
      R.whereItStandsIsWhereItCanSwing = bad.length === 0
        ? 'and at every size the slot is inside the reach, and the reach inside the 1.7 a blow resolves at'
        : `!! ${bad.join(' | ')}`;
    });

    /* ================== 2. THE RANGED STAND-OFF ==================
       Battle stance, target line drawn, no shot. Measured as: where does it settle, and did
       anything leave the string. */
    guard(['everyRangedWeaponCloses', '_byWeapon'], () => {
      const rows = [], stalled = [];
      for (const wk of ['w_bow', 'w_sinew', 'w_xbow', 'w_lance']) {
        if (!ITEMS[wk] || !ITEMS[wk].range) continue;
        wipe();
        const foe = putAt('wild', gx + 6, gy, { name: 'Post', tough: 60, def: 6 });
        foe.blood = foe.maxBlood = 6000; foe.noFight = true;
        const me = putAt('player', gx - 4, gy, { name: 'Archer', weapon: wk, armor: 'a_lea' });
        me.stance = 'ranged'; me.blood = me.maxBlood = 4000;
        me.target = foe; me.targetManual = true;
        addItem('aether_cell', 40);   /* the key is aether_cell — a bogus one poisons every later stash read */
        /* ---------- COUNT WHAT LEAVES THE STRING, NOT WHAT IT DOES ----------
           Damage is not the question and it lies about the answer: the Sinew-Drawn Bow is
           dmg 9 at ap 0.04, and against a padded post it read as NOTHING FIRED while shooting
           perfectly well. Spy on `fireRanged`, which is the event. */
        const real = window.fireRanged;
        let shots = 0;
        window.fireRanged = function (a, b3, c3) { if (a === me) shots++; return real.apply(this, arguments); };
        stepPinned(30, foe);
        window.fireRanged = real;
        const d = dist(me.x, me.y, foe.x, foe.y), rng = ITEMS[wk].range;
        rows.push(`${ITEMS[wk].name}: range ${rng}, settled ${d.toFixed(2)}, ${shots} shots`);
        if (shots < 4) stalled.push(`${ITEMS[wk].name} loosed ${shots} in thirty seconds from ${d.toFixed(2)} of ${rng}`);
      }
      R._byWeapon = rows.join(' | ');
      R.everyRangedWeaponCloses = stalled.length === 0
        ? 'every ranged weapon closes to inside its own range and fires'
        : `!! ${stalled.join(' | ')} — IN STANCE, TARGET SET, NOTHING FIRED`;
    });

    /* AND A CASTER ON RANGED IS NOT A STATUE. The band a gifted body holds is a constant 7,
       and what it can do from there depends entirely on which gift it has — the branch only
       ever reaches for a firebolt or a darkbolt. */
    guard(['everyGiftDoesSomethingOnRanged', '_byGift'], () => {
      const rows = [], mute = [];
      for (const g of ['destruction', 'dark', 'divine', 'dust']) {
        wipe();
        const foe = putAt('wild', gx + 6, gy, { name: 'Post', tough: 60, def: 6 });
        foe.blood = foe.maxBlood = 6000; foe.noFight = true;
        const me = putAt('player', gx - 4, gy, { name: 'Caster', weapon: null, armor: 'a_lea', gift: g, magic: 30 });
        me.stance = 'ranged'; me.blood = me.maxBlood = 4000; me.mana = 200; me.maxMana = 200;
        me.target = foe; me.targetManual = true;
        const b0 = foe.blood, m0 = me.mana;
        stepPinned(30, foe);
        const d = dist(me.x, me.y, foe.x, foe.y);
        /* MANA SPENT IS NOT WORK DONE — a divine caster on RANGED burns forty-five mana
           healing itself and never touches the enemy, which is exactly the reported picture.
           Ask whether the thing it was pointed at is worse off, or whether it at least closed
           to arm's length and started swinging. */
        /* AND DAMAGE IS NOT THE ONLY WAY TO TOUCH SOMETHING. A darkbolt is deliberately a
           MARKER rather than a gun — its damage was pulled back to a token on purpose — so a
           dark caster throwing thirty-two of them read as "STANDS THERE" on a damage test
           while working exactly as designed. Ask whether the target is worse off by any
           measure the game has, or whether the body at least closed and started swinging. */
        const did = (b0 - foe.blood) > 0 || (foe.markT || 0) > 0 || d < 2.2;
        rows.push(`${g}: settled ${d.toFixed(2)}, dmg ${(b0 - foe.blood).toFixed(0)}, mark ${(foe.markT || 0).toFixed(1)}, mana ${(m0 - me.mana).toFixed(0)} spent — ${did ? 'in the fight' : 'STANDS THERE'}`);
        if (!did) mute.push(g);
      }
      R._byGift = rows.join(' | ');
      R.everyGiftDoesSomethingOnRanged = mute.length === 0
        ? 'and a caster on RANGED works from the band, whichever gift it has'
        : `!! A ${mute.join(' AND A ').toUpperCase()} CASTER ON RANGED SPENDS THIRTY SECONDS DOING NOTHING`;
    });

    wipe();
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THEY ARE IN A FIGHT AND NOT FIGHTING (${bad.length + errs.length})`
                                        : 'A BODY THAT HAS PICKED A FIGHT IS STANDING WHERE IT CAN HAVE ONE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
