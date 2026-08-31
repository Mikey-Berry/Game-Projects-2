#!/usr/bin/env node
/* WHAT A DISGUISE HIDES A RISEN FROM, AND WHAT IT DOES NOT.
 *
 * "Casting shroud the dead seems to only work while the caster is extremely close. However,
 *  the purple 'concentration' circle persists atop the undead/caster's heads, making it seem
 *  like its active when it really isn't."
 *
 * THERE IS NO RANGE GATE, AND THE RING IS NOT LYING. Measured first, because both halves of
 * the report name a cause and neither one is the cause: the shroud holds at a hundred and
 * twenty tiles, and the marker is driven off `c.shrouded`, which is the same flag the rules
 * read — if the bead is up, the disguise is on.
 *
 * WHAT WAS REALLY HAPPENING is that the town had TWO eyes and only one of them had been told.
 * The alarm ("get the risen out, or the guards will handle it") asks `revealedUndead` and was
 * fooled correctly. The LAW — the `walkdead` crime, a bounty and 25 standing a time — asked
 * `c.undead`, the raw flag, and could not be fooled by anything. So a shrouded risen standing
 * in a town collected fines nobody could explain until the ledger passed -50, at which point
 * `hostile` turns the town on you wholesale — a REPUTATION rule, which does not care about
 * disguises and never did. The guards then kill the risen, the subject dies, and the shroud
 * drops with it, exactly as designed. Every visible symptom, one line up from where anyone
 * would look.
 *
 * THE CONTROL IS THE WHOLE PROOF HERE. An empty town drifts not at all (0 rep over 100 ticks),
 * a bare risen costs 75, and before this a shrouded one cost 82 — which is how you know the
 * disguise was doing nothing rather than doing something small.
 *
 *   node tools/cloak.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

/* one fresh world per arm: reputation is world state and a second staging in the same world
   inherits whatever the first one did to the ledger */
const arm = async (kind, file) => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 620 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(file), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);
  const out = await p.evaluate((kind) => {
    const t = towns.find(x => !x.playerRuled && !x.def.undeadFriendly);
    const me = player()[0];
    let a = null;
    if (kind !== 'empty') {
      me.gift = 'dark'; me.stats.magic = 30; me.mana = 100; me.castCd = 0;
      a = makeChar('Walker', 'player', t.x + 2, t.y, { atk: 5, def: 5, tough: 12 });
      a.state = 'ok'; a.undead = true; a.lich = false; a.master = me;
      chars.push(a);
      me.x = t.x + 2; me.y = t.y;
      if (kind === 'shrouded') castShroud(me, a);
      if (kind === 'gravecloth') a.armor = 'a_shroud';
      /* AND THE CASTER LEAVES. The report is about what happens when he is not standing there,
         and a caster in the ring fights back and muddies every number below. */
      me.x = t.x + 90; me.y = t.y + 90;
    }
    const held = kind === 'shrouded' ? !!(a && a.shrouded) : null;
    /* THREE HUNDRED, NOT A HUNDRED. The fines land inside the first ten ticks, but the thing
       the player actually reported — the guards killing it — needs the ledger to cross -50 AND
       a guard to walk over, which measured out at tick 261. At 100 the last assertion below
       passed on the broken build too, because the body had not been reached yet. */
    paused = false; for (let i = 0; i < 300; i++) update(0.1); paused = true;
    return {
      town: t.name, rep: t.rep, bounty: t.bounty || 0,
      held, stillHeld: kind === 'shrouded' ? !!(a && a.shrouded) : null,
      revealed: a ? revealedUndead(a) : null,
      alive: a ? a.state !== 'dead' : null,
    };
  }, kind);
  await b.close();
  out.errs = errs;
  return out;
};

(async () => {
  const file = process.argv[2];
  const R = {};
  const empty = await arm('empty', file);
  const bare = await arm('bare', file);
  const shrouded = await arm('shrouded', file);
  const cloth = await arm('gravecloth', file);
  const errs = [...empty.errs, ...bare.errs, ...shrouded.errs, ...cloth.errs];

  R._ledger = `over 300 ticks in ${empty.town}: nobody ${empty.rep}, a bare risen ${bare.rep}, a shrouded one ${shrouded.rep}, one in a Gravecloth ${cloth.rep}`;
  /* THE BASELINE IS AN ASSERTION, not a comment. If an empty town drifts on its own, every
     number below it is measuring the weather. */
  R.anEmptyTownKeepsItsLedger = empty.rep === 0
    ? 'a town with none of your dead anywhere near it does not move a point in three hundred ticks — so the drift below is the risen and nothing else'
    : `!! THE CONTROL TOWN DRIFTED TO ${empty.rep} ON ITS OWN`;
  R.aBareRisenIsACrime = bare.rep < -40
    ? `walking an undisguised risen through a town still costs you: ${bare.rep} standing, bounty ${bare.bounty} — the law is not being softened here, only taught to look`
    : `!! A BARE RISEN COST ONLY ${bare.rep}`;
  R.butAShroudedOneIsNot = shrouded.rep === 0
    ? 'while a risen under Shroud the Dead costs nothing at all — the town cannot fine what it cannot see'
    : `!! A SHROUDED RISEN STILL COST ${shrouded.rep} STANDING AND ${shrouded.bounty} BOUNTY`;
  /* AND THE SAME PREDICATE COVERS THE ARMOUR. The Gravecloth has said `conceal` on it since it
     was written and had never once been consulted by the law; this is the assertion that says
     the fix was made in the shared place rather than special-cased for the spell. */
  R.andNeitherIsAGravecloth = cloth.rep === 0
    ? 'and a Gravecloth Shroud does the same, because the fix is the one predicate every watching eye already shares rather than a clause about one spell'
    : `!! A GRAVECLOTH STILL COST ${cloth.rep} STANDING`;
  /* AND THE CONSEQUENCE THE PLAYER ACTUALLY SAW. Rep past -50 turns the whole town hostile —
     which is a reputation rule that does not consult disguises — so the risen was killed by
     guards that were never meant to notice it, and the shroud dropped because its subject died. */
  R.andItIsAliveAtTheEnd = (shrouded.alive && shrouded.stillHeld && !shrouded.revealed)
    ? 'and it is still standing at the end with the shroud still on it — which is the whole report, because before this the guards killed it and the spell ended with its subject'
    : `!! alive=${shrouded.alive} held=${shrouded.stillHeld} revealed=${shrouded.revealed}`;

  for (const [k, v] of Object.entries(R)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(30) : k.padEnd(30)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  const bad = Object.values(R).filter(v => typeof v === 'string' && v.startsWith('!!'));
  console.log('');
  console.log(bad.length || errs.length ? `THE LAW STILL SEES WHAT NOBODY ELSE CAN (${bad.length + errs.length})`
                                        : 'A FACE DRAWN OVER THE DEAD FOOLS THE WATCH AND THE LAW ALIKE');
  process.exit(bad.length || errs.length ? 1 : 0);
})();
