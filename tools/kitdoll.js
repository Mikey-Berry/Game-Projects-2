#!/usr/bin/env node
/* THE KIT WINDOW: EVERY SLOT REACHABLE, AND A FIGURE THAT IS THE ACTUAL BODY.
 *
 * Two reports, one screen.
 *
 *   "There's no way to equip cloaks right now from the main [I] menu. Just GIVE or STASH. I have
 *    to go to the stash to equip it."
 *
 * The backpack row was hand-written against `weapon|armor|pack` — the three slots that existed
 * before head, cloak and trinket were added — so a cloak in your own pack could be given away,
 * stashed or dropped, every verb except the one it is for. It reads `slotFor` now, which is the
 * single place that answers "what does this go in".
 *
 *   "It would be nice if it showed a model of the actual character selected, close up, and with
 *    the same equipment. No placeholder T-pose picture."
 *
 * It was an SVG of six tinted regions: the same figure for a Choir Kin, a golem and a Sixfold,
 * telling you a cloak was equipped and nothing about which. It is `buildCharMesh` in a second
 * small WebGL context now — the real rig, wearing the real gear.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/kitdoll.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 820 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3500);

  /* ---- 1. EVERY SLOT CAN BE EQUIPPED OUT OF THE PACK ----
     Driven by finding the row by NAME and clicking its button, not by calling the handler: the
     whole report is that the button was not there. `slots.js` has a note about the cost of
     clicking "the first WEAR button" instead — it belonged to something left over. */
  const pack = await p.evaluate(() => {
    const c = player().find(x => x.state === 'ok');
    window.__C = c.id;
    for(const k of ['w_kat', 'a_lea', 'h_kettle', 'k_road', 't_charm', 'pack_s']) invAdd(c, k, 1);
    selected = [c]; openInventory(c);
    const out = {};
    for(const k of ['w_kat', 'a_lea', 'h_kettle', 'k_road', 't_charm', 'pack_s']){
      const name = ITEMS[k].name;
      const row = [...document.querySelectorAll('.invrow')]
        .find(r => r.textContent.includes(name) && r.closest('#modalbody'));
      out[k] = row ? [...row.querySelectorAll('button')].map(x => x.textContent) : null;
    }
    return out;
  });
  const R = {};
  const wants = {w_kat:'EQUIP', a_lea:'WEAR', h_kettle:'WEAR', k_road:'WEAR', t_charm:'CARRY', pack_s:'SHOULDER'};
  const missing = Object.keys(wants).filter(k => !pack[k] || !pack[k].includes(wants[k]));
  R.everySlotEquips = missing.length === 0
    ? `all six slots offer their verb from the pack: ${Object.entries(wants).map(([k, v]) => v.toLowerCase()).join(', ')}`
    : `!! NO WAY TO EQUIP ${missing.join(', ')} FROM THE PACK (offered ${missing.map(k => JSON.stringify(pack[k])).join(' ')})`;

  /* AND THE BUTTON ACTUALLY WORKS, which is a different claim from the button existing */
  const worn = await p.evaluate(() => {
    const c = charById.get(window.__C);
    c.cloak = null; refreshCharPanel(); openInventory(c);
    const row = [...document.querySelectorAll('#modalbody .invrow')].find(r => r.textContent.includes(ITEMS.k_road.name));
    const btn = row && [...row.querySelectorAll('button')].find(x => x.textContent === 'WEAR');
    if(!btn) return {clicked: false};
    btn.click();
    return {clicked: true, cloak: c.cloak, stillInPack: (c.inv && c.inv.k_road) || 0};
  });
  R.andItGoesOn = worn.clicked && worn.cloak === 'k_road' && !worn.stillInPack
    ? 'and pressing it moves the cloak out of the pack and onto them'
    : `!! THE CLOAK DID NOT GO ON (clicked ${worn.clicked}, cloak ${worn.cloak}, left in pack ${worn.stillInPack})`;

  /* AND THE REFUSALS STILL BITE — the pack must not be a way round `gearRefusal` */
  const ref = await p.evaluate(() => {
    const c = charById.get(window.__C);
    const u = chars.find(x => x.undead && x.state !== 'dead' && !x.lich) ||
      (() => { const q = makeChar('Risen', 'player', c.x + 1, c.y, {atk:5,def:5,tough:5}); q.state='ok'; q.undead = true; chars.push(q); return q; })();
    invAdd(u, 'w_lance', 1);
    u.gift = 'dark';
    const before = u.weapon;
    selected = [u]; openInventory(u);
    const row = [...document.querySelectorAll('#modalbody .invrow')].find(r => r.textContent.includes(ITEMS.w_lance.name));
    const btn = row && [...row.querySelectorAll('button')].find(x => x.textContent === 'EQUIP');
    if(btn) btn.click();
    return {had: !!btn, before, after: u.weapon};
  });
  R.refusalsHold = !ref.had || ref.after === ref.before
    ? 'and the pack is not a way round a refusal — a gifted body still cannot take up the lance'
    : `!! THE PACK EQUIPPED SOMETHING gearRefusal FORBIDS (${ref.before} -> ${ref.after})`;

  /* ---- 2. THE FIGURE IS A REAL BODY ---- */
  const doll = await p.evaluate(async () => {
    const c = charById.get(window.__C);
    c.weapon='w_kat'; c.armor='a_lea'; c.head='h_kettle'; c.cloak='k_road'; c.trinket='t_charm'; c.pack='pack_s';
    selected = [c]; openInventory(c);
    await new Promise(r => setTimeout(r, 600));
    const fig = document.querySelector('.dfig');
    const cv = fig && fig.querySelector('canvas');
    const svg = fig && fig.querySelector('svg');
    const D = (typeof _doll !== 'undefined') ? _doll : null;   /* absent on the build before */
    /* WHAT IS ACTUALLY ON SCREEN, read off the pixels rather than off the object graph — a
       scene with a body in it that renders black is still a blank square to the player. */
    let lit = 0, tot = 0;
    if(cv && D){
      /* ---------- READ IT IN THE SAME BREATH AS THE DRAW ----------
         A WebGL drawing buffer is cleared once the browser has composited it, and
         `preserveDrawingBuffer` is off by default — so `drawImage` on a WebGL canvas at any
         later moment copies an empty rectangle. The first version of this read 0 of 93,984
         pixels lit off a portrait that was plainly drawing on screen, and blamed the renderer.
         Render, then copy, with nothing in between. */
      D.r.render(D.sc, D.cam);
      const g = document.createElement('canvas');
      g.width = cv.width; g.height = cv.height;
      const gx = g.getContext('2d');
      gx.drawImage(cv, 0, 0);
      const d = gx.getImageData(0, 0, cv.width, cv.height).data;
      for(let i = 3; i < d.length; i += 4){ tot++; if(d[i] > 12) lit++; }
    }
    return {hasCanvas: !!cv, hasSvg: !!svg, lit, tot,
            ent: !!(D && D.ent), kids: D && D.ent ? D.ent.g.children.length : -1,
            spinning: !!(D && D.raf), rot: D ? D.rot : 0};
  });
  R.itIsAModel = doll.hasCanvas && !doll.hasSvg
    ? 'the figure is a rendered body, not a drawing of one'
    : `!! STILL AN SVG PLACEHOLDER (canvas ${doll.hasCanvas}, svg ${doll.hasSvg})`;
  R.andItDrew = doll.tot && doll.lit / doll.tot > 0.06
    ? `and it actually draws — ${Math.round(doll.lit / doll.tot * 100)}% of the panel has a body in it`
    : `!! THE PORTRAIT CANVAS IS BLANK (${doll.lit}/${doll.tot} pixels lit)`;
  R.itIsTheirRig = doll.ent && doll.kids > 0
    ? `built from \`buildCharMesh\`, ${doll.kids} parts deep — the same rig the world draws`
    : `!! NO MESH IN THE PORTRAIT SCENE (ent ${doll.ent}, parts ${doll.kids})`;
  R.itTurns = doll.spinning
    ? 'and it turns, so the cloak on the back of them is visible at all'
    : '!! THE PORTRAIT IS FROZEN — THE BACK OF THE BODY CAN NEVER BE SEEN';

  /* ---- AND GEAR CHANGES SHOW. A portrait built once and cached is a picture, not a paperdoll ---- */
  const changed = await p.evaluate(async () => {
    const c = charById.get(window.__C);
    /* THROUGH `typeof`, because on the build before this work there is no `_doll` at all and a
       bare reference takes the whole file down — which reports nothing about either change. */
    const sig = () => { const D = (typeof _doll !== 'undefined') ? _doll : null; if(!D || !D.ent) return -1;
      let n = 0; D.ent.g.traverse(o => { if(o.isMesh && o.geometry && o.geometry.attributes.position) n += o.geometry.attributes.position.count; });
      return n; };
    const a = sig();
    c.head = null; c.cloak = null; c.pack = null;
    openInventory(c);
    await new Promise(r => setTimeout(r, 500));
    const b2 = sig();
    return {a, b: b2};
  });
  R.itFollowsTheGear = changed.a > 0 && changed.b > 0 && changed.a !== changed.b
    ? `and stripping the helm, cloak and pack changes the figure: ${changed.a} vertices down to ${changed.b}`
    : `!! THE PORTRAIT DOES NOT FOLLOW THE GEAR (${changed.a} then ${changed.b})`;

  /* ---- AND IT DOES NOT EAT WEBGL CONTEXTS ----
     A browser hands out about sixteen and then starts taking the oldest back — which would be
     the MAIN renderer. Redraw the panel a dozen times and the world must still be drawing. */
  const ctx = await p.evaluate(async () => {
    const c = charById.get(window.__C);
    for(let i = 0; i < 14; i++){ openInventory(c); await new Promise(r => setTimeout(r, 40)); }
    let ok = true;
    try { render(); } catch(e){ ok = false; }
    return {worldStillDraws: ok && !renderer.getContext().isContextLost(),
            portraits: document.querySelectorAll('.dfig canvas').length};
  });
  R.oneContextOnly = ctx.worldStillDraws && ctx.portraits === 1
    ? 'fourteen redraws later there is still exactly one portrait canvas and the world still draws'
    : `!! CONTEXT CHURN (world drawing ${ctx.worldStillDraws}, portrait canvases ${ctx.portraits})`;

  console.log('=== THE KIT WINDOW ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'SIX SLOTS, AND THE BODY THAT WEARS THEM'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
