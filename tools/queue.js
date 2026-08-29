#!/usr/bin/env node
/* LINING THE BENCHES UP.
 *
 * "The ability to queue up research would be nice."
 *
 * The mechanism was all there; the gate was one line — "Finish the current project first". So
 * almost nothing here is about whether a list can hold strings. It is about the two decisions a
 * queue actually forces:
 *
 *   · WHEN THE BILL FALLS DUE. Paying at the moment you line something up locks gold away for
 *     work that has not started, and refuses the very thing a queue is for — a chain whose
 *     later steps you cannot afford yet.
 *   · WHAT HAPPENS WHEN THE HEAD CANNOT START. A queue that goes quiet is worse than no queue,
 *     because the benches look busy.
 *
 *   node tools/queue.js [game.html]
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
    /* MONEY IS NOT THE ONLY BILL. Smithing wants 10 stone and 8 wood, smelting 20 and 12 — so
       a probe that stocked gold and nothing else watched the queue hold, correctly, and read
       it as the queue failing to advance. Stock the shed too, except where the point of the
       block is that something is missing. */
    const reset = () => {
      research.done = {}; research.active = null; research.left = 0;
      research.queue.length = 0; research._stalled = null; research.rp = 999; cats = 500000;
      for (const k of ['stone', 'wood', 'mats', 'iron', 'c_ingot', 'coal', 'copper', 'fabric', 'vflesh', 'codex', 'iron_ore']) stash[k] = 500;
    };
    /* ---------- SOMEBODY HAS TO BE AT THE BENCH ----------
       `researchTick` returns on the first line when `researchRate()` is zero, and it is zero
       until a body is assigned the STUDY job at a built bench. The first version of this set
       `research.left = 0` and called the tick, and the tick returned before looking — so the
       chain "advanced" through six identical entries and the probe reported the queue broken
       while it worked. The rate curve is study.js's subject, not this file's: stub it, so the
       tick reaches the part that finishes a project and calls the queue on. */
    const realRate = window.researchRate;
    window.researchRate = () => 4;
    const finish = () => { research.left = 0; researchTick(1); };

    /* ---------- 1. A CHAIN, WHICH IS THE WHOLE POINT ----------
       construction -> smithing -> smelting -> ironworking is four deep and each one is gated
       on the last. If a queue cannot hold a chain it is a list of one. */
    guard(['aChainCanBeLinedUp', 'andItWorksItsWayDown'], () => {
      reset();
      /* A CHAIN WITH NOTHING BUT THE CHAIN IN THE WAY. The first version ran
         construction -> smithing -> smelting -> ironworking and stopped one short, because
         `ironworking` wants a built Smelter to study at — the queue holding was correct and
         the probe called it a failure. Four deep, each gated only on the one before it. */
      const chain = ['construction', 'necromancy', 'rites_binding', 'rites_deep'];
      researchBegin('construction');
      for (const k of chain.slice(1)) research.queue.push(k);
      R.aChainCanBeLinedUp = research.queue.length === 3
        ? `three projects lined up behind ${TECHS[research.active].name}`
        : `!! THE QUEUE HOLDS ${research.queue.length}`;
      const order = [];
      for (let i = 0; i < 6 && research.active; i++) { order.push(research.active); finish(); }
      R._order = order.join(' -> ');
      R.andItWorksItsWayDown = order.join(',') === chain.join(',')
        ? `and the benches walk the chain in order: ${order.join(' then ')}`
        : `!! THE BENCHES RAN ${order.join(' then ')}`;
    });

    /* ---------- 2. THE BILL FALLS DUE WHEN IT STARTS ----------
       Queue four projects with the money for one. Nothing may be taken until each begins, and
       the queue must not have refused the chain for being unaffordable at the time. */
    guard(['nothingIsPaidForUpFront', 'andEachIsPaidWhenItBegins'], () => {
      reset();
      const chain = ['construction', 'necromancy', 'rites_binding'];
      const bill = chain.reduce((a, k) => a + TECHS[k].cost, 0);
      cats = TECHS.construction.cost;          /* enough for the first only */
      const before = cats;
      researchBegin('construction');
      const afterStart = cats;
      for (const k of chain.slice(1)) research.queue.push(k);
      R.nothingIsPaidForUpFront = cats === afterStart
        ? `lining up ${research.queue.length} more takes nothing from the purse (${before} -> ${cats}, of a ${bill} bill)`
        : `!! QUEUEING TOOK ${afterStart - cats} GOLD FOR WORK THAT HAS NOT STARTED`;
      /* and with no money the queue holds rather than starting for free */
      finish();
      R.andEachIsPaidWhenItBegins = (research.active === null && research.queue.length === 2 && cats === 0)
        ? 'and with an empty purse the next one waits instead of starting for nothing'
        : `!! active ${research.active}, queued ${research.queue.length}, purse ${cats}`;
    });

    /* ---------- 3. A BLOCKED HEAD DOES NOT GO QUIET, AND DOES NOT BLOCK THE REST ---------- */
    guard(['aStalledQueueSaysSo', 'andTheNextThingStillStarts'], () => {
      reset();
      const said = [];
      const realLog = window.log;
      window.log = (m, k) => { said.push(String(m)); return realLog(m, k); };
      cats = 0;
      research.queue.push('construction');
      researchNext();
      window.log = realLog;
      R.aStalledQueueSaysSo = said.some(m => /waiting on|wants/i.test(m))
        ? `a queue that cannot start says why: "${(said.find(m => /waiting on|wants/i.test(m)) || '').slice(0, 58)}..."`
        : `!! THE QUEUE STALLED IN SILENCE (${said.length} lines, none of them about it)`;
      /* the head wants a bench nobody built; something further down does not */
      reset();
      research.done.construction = true; research.done.benediction = true;
      research.queue.push('unclouding');     /* needs a favour nobody has */
      research.queue.push('necromancy');     /* plain, and affordable */
      researchNext();
      R.andTheNextThingStillStarts = research.active === 'necromancy'
        ? 'and a head it cannot start does not hold up the thing behind it'
        : `!! THE QUEUE IS JAMMED BEHIND ITS FIRST ENTRY (active ${research.active})`;
    });

    /* ---------- 4. AND IT IS REACHABLE FROM THE ACTUAL PANEL ----------
       The holding cell was costed, placeable, described and on no menu. Ask the DOM. */
    guard(['theButtonIsOnThePanel'], () => {
      reset();
      researchBegin('construction');
      openResearch();
      const q = [...document.querySelectorAll('#modalbody [data-q]')];
      const names = q.map(x => x.textContent.trim().slice(0, 5));
      R.theButtonIsOnThePanel = q.length >= 3
        ? `${q.length} projects offer a QUEUE button while the benches are busy`
        : `!! ONLY ${q.length} QUEUE BUTTONS ON THE PANEL (${names.join(',')})`;
      /* clicking one puts it on the list, and clicking it again takes it off */
      q[0].click();
      const on = research.queue.length;
      openResearch();
      const un = document.querySelector('#modalbody [data-unq]');
      if (un) un.click();
      R.andItComesOffAgain = (on === 1 && research.queue.length === 0)
        ? 'and a queued project can be taken back off the list'
        : `!! QUEUED ${on}, AFTER REMOVE ${research.queue.length}`;
      document.getElementById('modalclose').click();
    });

    /* ---------- 5. AND THE LIST SURVIVES A RELOAD ---------- */
    guard(['theListRidesTheSave'], () => {
      reset();
      researchBegin('construction');
      research.queue.push('smithing', 'smelting');
      const want = [...research.queue];
      restore(JSON.parse(JSON.stringify(snapshot())));
      R.theListRidesTheSave = research.queue.join(',') === want.join(',')
        ? `and a reload hands back the list in order (${research.queue.join(' then ')})`
        : `!! THE LIST CAME BACK AS [${research.queue.join(',')}] FROM [${want.join(',')}]`;
    });

    window.researchRate = realRate;
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE BENCHES TAKE ONE JOB AT A TIME (${bad.length + errs.length})`
                                        : 'THE WORK LINES UP, AND PAYS AS IT GOES');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
