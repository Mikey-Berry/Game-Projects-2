// Geometry audit of the expanded towns. Usage: node towncheck.js [game.html]
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 300)); });

  await page.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.getElementById('btn-start').click());
  await page.waitForTimeout(3000);

  const out = await page.evaluate(() => {
    const problems = [];
    const rows = [];
    const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

    for (const t of towns) {
      const bs = buildings.filter(b => b.town === t);
      const r = t.def.wall ? t.def.wall.r : null;

      // 1. pairwise overlap
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        if (overlap(bs[i], bs[j])) problems.push(`${t.name}: ${bs[i].label} overlaps ${bs[j].label}`);
      }

      // 2. wall containment - building footprint must sit strictly inside the ring
      if (r != null) {
        for (const b of bs) {
          const lo = { x: b.x - t.x, y: b.y - t.y }, hi = { x: b.x + b.w - 1 - t.x, y: b.y + b.h - 1 - t.y };
          const reach = Math.max(Math.abs(lo.x), Math.abs(hi.x), Math.abs(lo.y), Math.abs(hi.y));
          if (reach >= r) problems.push(`${t.name}: ${b.label} reaches ${reach} >= wall r=${r}`);
          else if (reach >= r - 1) problems.push(`${t.name}: ${b.label} touches the wall (reach ${reach}, r=${r})`);
        }
      }

      // 3. buildings on water
      for (const b of bs) {
        let wet = 0;
        for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) if (tileAt(i, j) === 3) wet++;
        if (wet) problems.push(`${t.name}: ${b.label} has ${wet} water tiles under it`);
      }

      // 4. doors: the doorway and the tile in front of it must both be walkable
      for (const b of bs) {
        const d = b.door;
        if (isBlocked(d.x + 0.5, d.y + 0.5, 0)) problems.push(`${t.name}: ${b.label} doorway blocked`);
        if (isBlocked(d.x + 0.5, d.y + 1.5, 0)) problems.push(`${t.name}: ${b.label} door approach blocked`);
      }

      // 5. the plaza well at +2.5,+2.5 must be in the open
      if (isBlocked(t.x + 2.5, t.y + 2.5, 0)) problems.push(`${t.name}: well site is inside a building`);

      // 6. the flag
      const f = townFlagPos(t);
      if (isBlocked(f.x, f.y, 0)) problems.push(`${t.name}: flag site blocked`);

      // 7. guard posts
      let badPosts = 0;
      for (const p of t.posts) if (!p || isBlocked(p.x, p.y, 0)) badPosts++;
      if (badPosts) problems.push(`${t.name}: ${badPosts}/${t.posts.length} guard posts on blocked ground`);

      // 8. vendors must stand in the open
      for (const v of vendors.filter(v => v.town === t)) {
        if (isBlocked(v.x, v.y, 0)) problems.push(`${t.name}: vendor ${v.name} stands in a wall`);
      }

      // 9. beds
      for (const bd of beds.filter(b => b.town === t)) {
        if (isBlocked(bd.x, bd.y, 0)) problems.push(`${t.name}: a bed is inside a wall`);
      }

      // 10. reachability: can you walk from the town gate/edge to every door?
      //     flood from the well outward over unblocked ground, then check each door approach.
      const seen = new Set(); const R = (r || 20) + 4;
      const q = [[Math.floor(t.x + 2), Math.floor(t.y + 2)]];
      seen.add(q[0][0] + ',' + q[0][1]);
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (seen.has(k)) continue;
          if (Math.abs(nx - t.x) > R || Math.abs(ny - t.y) > R) continue;
          if (isBlocked(nx + 0.5, ny + 0.5, 0)) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      let unreachable = [];
      for (const b of bs) {
        if (b.citadel) continue;
        const k = b.door.x + ',' + (b.door.y + 1);
        if (!seen.has(k)) unreachable.push(b.label);
      }
      if (unreachable.length) problems.push(`${t.name}: unreachable doors: ${unreachable.join(', ')}`);

      // 11. town spacing: walls must not touch a neighbour's
      for (const o of towns) {
        if (o === t) continue;
        const need = (t.def.wall ? t.def.wall.r : 20) + (o.def.wall ? o.def.wall.r : 20) + 4;
        const d = Math.hypot(t.x - o.x, t.y - o.y);
        if (d < need) problems.push(`${t.name}/${o.name}: centres ${d.toFixed(0)} apart, need ${need}`);
      }

      rows.push({
        town: t.name, wallR: r, buildings: bs.length,
        labels: bs.map(b => b.label).join('|'),
        civs: t.def.civs, guards: t.def.guards, garrison: t.posts.length,
        citadel: !!t.citadel, walls: t.walls.length, openTiles: seen.size,
      });
    }

    // world totals
    const alive = chars.filter(c => c.state !== 'dead');
    return {
      rows, problems,
      totals: {
        towns: towns.length, buildings: buildings.length,
        chars: chars.length, alive: alive.length,
        townsfolk: alive.filter(c => c.town).length,
        vendors: vendors.length, beds: beds.length,
      },
    };
  });

  console.log(JSON.stringify(out, null, 2));
  if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
  console.log(out.problems.length ? '\n*** ' + out.problems.length + ' PROBLEMS ***' : '\nGEOMETRY OK');
  await browser.close();
})();
