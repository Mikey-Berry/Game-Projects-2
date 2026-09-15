#!/usr/bin/env node
/* IS THIS RED A REGRESSION, OR IS IT ONE DRAW?
 *
 * `lineage.js` came back red on `aHomesteadIsARoof` three runs out of three while the inn claim
 * beside it — same shape, same subsystem — passed every time. Three for three does not look like
 * the 5% `BIRTH_LOSS`, so it looked like a regression, and there was none.
 *
 * `rnd()` IS THE SEEDED WORLDGEN STREAM. A 0.05 roll at a fixed point in a seeded stream is not
 * a one-in-twenty chance, it is a CONSTANT FOR THE BUILD: once something upstream shifts the
 * stream enough to put that draw under the line it is under the line forever, re-running returns
 * the same answer every time, and bisecting points at innocent code.
 *
 * This reproduces the claim on its own — no earlier claims, no accumulated days — and prints the
 * state on every night rather than a verdict at the end: `homeAt`, `birthPlace`, the banner load,
 * what the game itself LOGGED (the loss branch says a line and the birth branch says another,
 * which is the one discriminator that does not depend on reading state afterwards), and then
 * twenty re-staged terms so the loss rate can be counted rather than guessed at.
 *
 * The answer it gave: default seed loses on night one every run; `?seed=7`, `?seed=21` and
 * `?seed=99` deliver and the house takes the tally; twenty re-staged terms on the default seed
 * give 20 born and 0 lost. The homestead was never broken. One draw moved.
 *
 * SO: ANY RED WHOSE FAILURE SIGNATURE HAS A PROBABILITY IN IT GETS RE-SEEDED BEFORE IT GETS
 * BISECTED. Copy the `p.goto` line and append `?seed=N`.
 *
 *   node tools/_home.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  p.on('pageerror', e => console.log('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2500);
  const out = await p.evaluate(() => {
    const L = [];
    const _snap = snapshot, _pack = packSaveText;
    snapshot = () => ({}); packSaveText = () => new Promise(() => {});
    /* open waste, far from any town — the same ground lineage.js stages on */
    let gx = 0, gy = 0;
    outer: for(let y = 20; y < H - 20; y += 6) for(let x = 20; x < W - 20; x += 6){
      if(isBlocked(x + 0.5, y + 0.5, 0)) continue;
      if(towns.some(t => dist(t.x, t.y, x, y) < 90)) continue;
      gx = x; gy = y; break outer;
    }
    L.push(`ground ${gx},${gy}`);
    const mk = (n, f, x, y, o) => { const c = makeChar(n, f, x, y, o || {}); c.state = 'ok'; chars.push(c); return c; };
    const w = mk('Mara Home', 'player', gx + 22, gy + 22, {atk:5, def:5, tough:20, ath:8});
    const h = mk('Corin Home', 'player', gx + 22.4, gy + 22, {atk:5, def:5, tough:20, ath:8});
    for(const c of [w, h]){ c.age = 26; c.__age0 = 26; c.race = 'human'; c.sub = null; }
    w.sex = 'f'; h.sex = 'm'; w.spouse = h.id; h.spouse = w.id;
    const home = {type:'home', x: gx + 20, y: gy + 20, w: 4, h: 4, progress: 1, kids: 0, bornDay: -999};
    pBuilds.push(home);
    L.push(`homeAt -> ${homeAt(w) === home ? 'THE HOMESTEAD' : String(homeAt(w))}`);
    L.push(`birthPlace -> ${JSON.stringify(birthPlace(w) && birthPlace(w).kind)}`);
    L.push(`HOME_R ${typeof HOME_R !== 'undefined' ? HOME_R : '?'} · dist ${dist(w.x, w.y, home.x + 2, home.y + 2).toFixed(2)}`);
    L.push(`SQUAD_CAP ${SQUAD_CAP} · bannerLoad ${bannerLoad()}`);
    /* WHAT THE GAME ITSELF SAYS ON THE NIGHT. The loss branch logs a line and the successful
       one does not, which is the one discriminator that does not depend on reading state after
       the fact. */
    const lines = [];
    const _log = log;
    log = (t, k) => { lines.push(String(t)); return _log(t, k); };
    w.pregnant = 1;
    const was = new Set(chars.map(c => c.id));
    for(let d = 0; d < 12; d++){
      paused = false; hour = 23.98; update(0.25); paused = true;
      for(const c of chars) if(c.__age0 !== undefined) c.age = c.__age0;
      const born = chars.filter(c => c.wasChild && !was.has(c.id) && dist(c.x, c.y, w.x, w.y) < 3);
      L.push(`night ${d + 1}: pregnant ${w.pregnant} overdue ${w.overdue || 0} lastBorn ${w.lastBorn} kids ${home.kids}`
           + ` born ${born.length} · at ${w.x.toFixed(1)},${w.y.toFixed(1)} · homeAt ${homeAt(w) ? 'yes' : 'NO'}`
           + ` · bannerLoad ${bannerLoad()}/${SQUAD_CAP}`);
      if(born.length) break;
    }
    /* and any wasChild ANYWHERE that is new, in case she is delivering somewhere unexpected */
    /* HOW OFTEN DOES IT ACTUALLY MISCARRY? BIRTH_LOSS is 0.05 and this has now come up on the
       first night of four separate runs with different call histories. Twenty staged terms,
       counted, against the 1-in-20 the constant claims. */
    {
      let lost = 0, made = 0;
      for(let i = 0; i < 20; i++){
        w.pregnant = 1; w.overdue = 0; w.lastBorn = null;
        const n0 = chars.length;
        paused = false; hour = 23.98; update(0.25); paused = true;
        for(const c of chars) if(c.__age0 !== undefined) c.age = c.__age0;
        if(chars.some(c => c.wasChild && dist(c.x, c.y, w.x, w.y) < 3)) { made++; for(const c of [...chars]) if(c.wasChild && dist(c.x, c.y, w.x, w.y) < 3) chars.splice(chars.indexOf(c), 1); }
        else lost++;
      }
      L.push(`twenty staged terms: ${made} born, ${lost} lost — BIRTH_LOSS says ${BIRTH_LOSS}`);
      const r = []; for(let i = 0; i < 8; i++) r.push(rnd().toFixed(3));
      L.push('rnd() x8: ' + r.join(' '));
    }
    log = _log;
    L.push('log said: ' + (lines.filter(t => /child|term|born|name/i.test(t)).slice(0, 6).join(' | ') || '(nothing about a child)'));
    const anyNew = chars.filter(c => c.wasChild && !was.has(c.id));
    L.push(`new wasChild anywhere: ${anyNew.length}` + (anyNew.length ? ' — ' + anyNew.map(c => `${c.name}@${c.x.toFixed(0)},${c.y.toFixed(0)} ${c.faction}`).slice(0,4).join(', ') : ''));
    snapshot = _snap; packSaveText = _pack;
    return L;
  });
  out.forEach(l => console.log('  ' + l));
  await b.close();
})();
