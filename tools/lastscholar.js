#!/usr/bin/env node
/* THE LAST SCHOLAR, AS PLUMBING.
 *
 * "Build the Last Scholar plumbing now, lines after I rule." So this file checks everything he
 * is except what he says, which waits on LORE-SEAMS.md §9.5:
 *
 *   1. nothing reaches him: no faction is hostile to him or he to it (a bandit, a Watcher, the
 *      Order, one of yours); a blow lands nothing; `kill` leaves him standing
 *   2. talk or leave him: the right-click offers TALK and LEAVE HIM and nothing else, ctrl
 *      included, and a drifter's HIRE never reaches him. With nothing ruled he does not answer;
 *      with lines put in, the conversation carries exactly the topics whose condition holds
 *   3. he comes and goes: the early sighting stands him a little way off a Scholar, out of
 *      sight; seen, he goes into the journal; out of sight fifteen seconds, he is gone. A
 *      sighting nobody sees is gone in two days. At the Door he stands at the rim until it
 *      closes. Mother's second scene is what says he exists
 *   4. he is not kept: a save taken with him standing holds his record and not his body, and a
 *      sighting nobody had seen yet is due again after the load
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/lastscholar.js [game.html]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForFunction(() => { try { return player().length > 0; } catch (e) { return false; } }, null, { timeout: 180000, polling: 1000 });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    if (typeof lastScholar === 'undefined' || typeof scholarStand !== 'function') {
      for (const k of ['nothingReachesHim', 'talkOrLeaveHim', 'heComesAndGoes', 'heIsNotKept']) R[k] = '!! THERE IS NO LAST SCHOLAR IN THIS BUILD';
      return R;
    }
    paused = true; hour = 12;
    const me = player()[0];
    const tick = (secs, dt = 0.5) => { for (let i = 0; i < secs / dt; i++) { computeVision(); scholarTick(dt); } };
    const standNear = (x, y) => { const q = findOpenNear(x, y, 3); scholarStand('probe', q); return lastScholar.body; };
    const clear = () => { scholarLeave(); for (const k of Object.keys(lastScholar.done)) delete lastScholar.done[k]; };

    /* ---- 1. nothing reaches him ---- */
    {
      const bits = [];
      const him = standNear(me.x + 4, me.y + 4);
      const mk = (name, fac, extra) => { const q = findOpenNear(me.x + 8, me.y + 8, 3); const c = makeChar(name, fac, q.x, q.y, { atk: 40, def: 10, tough: 20 }); Object.assign(c, extra || {}); c.__probe = true; chars.push(c); return c; };
      const foes = [mk('Bandit', 'bandit'), mk('Paladin', 'purge'), me];
      const g = spawnGaunt('stalker', me.x + 9, me.y + 9); if (g) { g.__probe = true; foes.push(g); }
      for (const f of foes) if (hostile(f, him) || hostile(him, f)) bits.push(`${f.name} (${f.faction}) is hostile to him`);
      const blood0 = him.blood, parts0 = JSON.stringify(Object.values(him.parts).map(q => q.hp));
      for (let i = 0; i < 5; i++) applyDamage(foes[0], him, 'head', 300, 'cut', true, false, false, 0);
      if (him.blood !== blood0 || JSON.stringify(Object.values(him.parts).map(q => q.hp)) !== parts0 || him.state !== 'ok') bits.push('blows landed on him');
      kill(him, foes[0]);
      if (him.state !== 'ok' || !chars.includes(him)) bits.push(`kill() left him ${him.state}`);
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      R.nothingReachesHim = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
        : `nobody is hostile to him or he to them (a bandit, a Paladin, a Watcher, one of yours), five 300-point blows to the head land nothing, and kill() leaves him standing`;
    }

    /* ---- 2. talk or leave him ---- */
    {
      const bits = [];
      const him = lastScholar.body;
      selected = [me];
      camX = camSX = him.x; camY = camSY = him.y; camDist = camDistTarget = 16; camFollow = false; activeFloor = 0;
      computeVision(); render();
      const menu = (ctrl) => {
        const q = w2s(him.x, him.y, groundY(him.x, him.y) + 0.9);
        document.getElementById('game').dispatchEvent(new MouseEvent('mousedown', { clientX: q.x, clientY: q.y, button: 2, buttons: 2, ctrlKey: ctrl, bubbles: true, cancelable: true }));
        const el = document.getElementById('ctxmenu');
        const got = el && getComputedStyle(el).display !== 'none' ? [...el.querySelectorAll('button')].map(x => x.textContent) : [];
        if (el) el.style.display = 'none';
        return got;
      };
      const plain = menu(false), forced = menu(true);
      const want = 'TALK|LEAVE HIM';
      if (plain.join('|') !== want) bits.push(`the right-click offers ${plain.join(', ') || 'nothing'}`);
      if (forced.join('|') !== want) bits.push(`ctrl+right-click offers ${forced.join(', ') || 'nothing'}`);
      if (me.target === him || me.orderTarget === him) bits.push('an order was given against him');
      /* nothing ruled: he does not answer, and no window opens */
      const lines = []; const _log = log; log = (t, k) => { lines.push(String(t)); return _log(t, k); };
      try { talkTo(him); } finally { log = _log; }
      const silent = !modalOpen && lines.some(l => /does not answer/.test(l));
      if (!silent) bits.push(`with nothing ruled, talking gave ${modalOpen ? 'a window' : lines.join(' / ') || 'nothing'}`);
      /* lines put in, the way the ruling will put them: the topics whose condition holds, and only those */
      const keep = JSON.stringify(SCHOLAR_TALK.topics.map(q => [q.ask, q.line])), greet = SCHOLAR_TALK.greet;
      SCHOLAR_TALK.greet = 'GREET';
      for (const q of SCHOLAR_TALK.topics) { q.ask = 'ASK ' + q.k; q.line = 'LINE ' + q.k; }
      const wasOpened = mother.opened; mother.opened = false;
      talkTo(him);
      const offered = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent).filter(t => /^ASK /.test(t)).map(t => t.slice(4));
      const shown = modalOpen && document.getElementById('modalbody').textContent.includes('GREET');
      const expect = SCHOLAR_TALK.topics.filter(q => q.when(speakerFor(him))).map(q => q.k);
      closeTalk();
      mother.opened = wasOpened;
      SCHOLAR_TALK.greet = greet;
      JSON.parse(keep).forEach(([a, l], i) => { SCHOLAR_TALK.topics[i].ask = a; SCHOLAR_TALK.topics[i].line = l; });
      if (!shown || offered.join(',') !== expect.join(',') || offered.includes('mother')) bits.push(`with lines in, the talk offered [${offered.join(', ')}] against [${expect.join(', ')}]${shown ? '' : ' and no window'}`);
      R.talkOrLeaveHim = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
        : `the right-click offers ${plain.join(' and ')}, with ctrl too; with nothing ruled he does not answer, and with lines put in the talk carries ${offered.length} topics (not Mother before her scene, not the Hollows to a stranger)`;
      clear();
    }

    /* ---- 3. he comes and goes ---- */
    {
      const bits = [];
      const keepPos = player().map(c => ({ c, x: c.x, y: c.y }));
      const park = (x, y) => { for (const c of player()) { c.x = x; c.y = y; c.floor = 0; } computeVision(); };
      /* a Scholar to stand near, with one of yours in reach and out of sight of him */
      let sc = chars.find(c => c.scholar && c.state === 'ok' && c.faction !== 'player' && (c.floor || 0) === 0);
      if (!sc) { const q = findOpenNear(me.x + 90, me.y, 4); sc = makeChar('Probe Scholar', 'drifter', q.x, q.y, { atk: 4, def: 4, tough: 10 }); sc.scholar = true; sc.neutral = true; sc.__probe = true; chars.push(sc); }
      const away = findOpenNear(sc.x - 90, sc.y, 6);
      day = 25; park(away.x, away.y);
      tick(4);
      const him = lastScholar.body;
      if (!him || lastScholar.key !== 'early') bits.push(`on day 25 with one of yours 90 tiles off a Scholar, nobody stood (${lastScholar.key})`);
      else {
        const nsc = chars.filter(c => c.scholar && c.state === 'ok' && c.faction !== 'player').sort((a, c) => dist(a.x, a.y, him.x, him.y) - dist(c.x, c.y, him.x, him.y))[0];
        if (!nsc || dist(him.x, him.y, nsc.x, nsc.y) > 12) bits.push(`he stood ${nsc ? dist(him.x, him.y, nsc.x, nsc.y).toFixed(0) : '?'} tiles off the nearest Scholar`);
        if (visAt(him.x, him.y) === 2) bits.push('he stood in plain sight');
        const near = findOpenNear(him.x + 3, him.y + 3, 2); park(near.x, near.y);
        tick(1);
        const th = threads.find(t => t.key === 'scholar');
        if (lastScholar.seenAt === null || !th) bits.push('seen, he went into no journal');
        park(away.x, away.y); tick(10);
        if (!lastScholar.body) bits.push('he was gone ten seconds after you looked away');
        tick(8);
        if (lastScholar.body) bits.push('he was still standing eighteen seconds after you looked away');
        if (typeof lastScholar.done.early !== 'number') bits.push(`the early sighting reads ${lastScholar.done.early}`);
      }
      /* Mother says he exists, and then a sighting nobody sees is gone in two days */
      scholarHeard();
      const th2 = threads.find(t => t.key === 'scholar');
      if (!th2 || th2.title !== 'The man with the old face') bits.push('Mother naming him did not title the thread');
      park(away.x, away.y); tick(4);
      if (lastScholar.key !== 'mother' || !lastScholar.body) bits.push('after Mother, nobody stood near the next of yours on the surface');
      else {
        if (visAt(lastScholar.body.x, lastScholar.body.y) === 2) bits.push('he stood in plain sight after Mother');
        day += 3; tick(1);
        if (lastScholar.body) bits.push('unseen for three days, he was still standing');
      }
      /* the Door: at the rim until it closes */
      const doorWas = theDoor;
      theDoor = { x: CRATER.x, y: CRATER.y, r: 14, seal: 0, work: 0, opened: day, fed: 0 };
      tick(4);
      const atRim = lastScholar.body && lastScholar.key === 'door';
      const rimD = atRim ? craterD(lastScholar.body.x, lastScholar.body.y) : -1;
      if (!atRim) bits.push('the Door opened and nobody stood at the rim');
      else if (!(rimD > CRATER.rim && rimD < CRATER.rim + 16)) bits.push(`at the Door he stood ${rimD.toFixed(0)} from the middle, against a rim at ${CRATER.rim}`);
      day += 5; tick(20);
      if (atRim && !lastScholar.body) bits.push('he left the rim with the Door still open');
      theDoor = null; tick(1);
      if (lastScholar.body) bits.push('the Door closed and he was still standing');
      theDoor = doorWas;
      for (const k of keepPos) { k.c.x = k.x; k.c.y = k.y; }
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      computeVision();
      R.heComesAndGoes = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
        : `on day 25 he stands out of sight a few tiles off a Scholar, goes into the journal when one of yours sees him, and is gone once they have looked away; after Mother's scene the thread is hers ("The man with the old face") and he stands just past the edge of sight, gone unseen in three days; while the Door is open he stands outside the rim at ${rimD.toFixed(0)} tiles (the rim is ${CRATER.rim}) and is gone when it closes`;
    }

    /* ---- 4. he is not kept ---- */
    {
      const bits = [];
      clear(); lastScholar.heard = true; lastScholar.talked = 3; lastScholar.done.early = 22;
      const him = standNear(me.x + 40, me.y);
      lastScholar.key = 'mother'; lastScholar.done.mother = 'out';
      const snap = snapshot();
      const d = JSON.parse(JSON.stringify(snap));
      if (d.chars.some(c => c.name === him.name && c.lastScholar)) bits.push('his body was written into the save');
      if (!d.scholarS || !d.scholarS.heard || d.scholarS.talked !== 3) bits.push('his record was not written');
      restore(snap);
      if (lastScholar.body || chars.some(c => c.lastScholar)) bits.push('he came back with the load');
      if (!lastScholar.heard || lastScholar.talked !== 3 || lastScholar.done.early !== 22) bits.push(`the record came back as ${JSON.stringify(lastScholar.done)}`);
      if (lastScholar.done.mother) bits.push('a sighting nobody had seen stayed spent after the load');
      R.heIsNotKept = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
        : 'a save taken with him standing holds his record (heard, talked 3, the early sighting on day 22) and not his body; after the load he is gone, and the sighting nobody had seen yet is due again';
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE LAST SCHOLAR IS NOT WHERE HE SHOULD BE (${bad.length + errs.length}) ***` : 'HE COMES AND GOES, AND NOTHING REACHES HIM');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
