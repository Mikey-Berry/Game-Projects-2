const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:1200,height:820} });
  await p.goto('file://' + path.join('/home/user/Game-Projects-2/tools', process.argv[2]||'game.html'), { waitUntil:'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(5000);
  const out = await p.evaluate(() => {
    for(let i=0;i<120;i++) update(1/30);
    /* count full-array scans of `chars` per sim step, and where they come from */
    const sites = new Map();
    const wrap = (name) => {
      const real = Array.prototype[name];
      chars[name] = function(...a){
        const st = (new Error()).stack.split('\n')[2] || '?';
        const m = st.match(/at ([^\s(]+)/);
        const who = (m ? m[1] : '?') + ' .' + name;
        const e = sites.get(who) || {calls:0, seen:0};
        e.calls++; e.seen += this.length; sites.set(who, e);
        return real.apply(this, a);
      };
    };
    for(const n of ['filter','some','find','reduce','map','forEach','findIndex','indexOf']) wrap(n);
    const N = 60;
    for(let i=0;i<N;i++) update(1/30);
    for(const n of ['filter','some','find','reduce','map','forEach','findIndex','indexOf']) delete chars[n];
    const rows = [...sites.entries()].map(([k,v])=>({who:k, perStep:+(v.calls/N).toFixed(2), elems:Math.round(v.seen/N)}))
      .sort((a,b)=>b.elems-a.elems);
    return {chars: chars.length, totalElems: rows.reduce((s,r)=>s+r.elems,0),
            totalCalls: +rows.reduce((s,r)=>s+r.perStep,0).toFixed(1), rows: rows.slice(0,18)};
  });
  console.log(`chars ${out.chars} · ${out.totalCalls} full scans/step visiting ${out.totalElems} elements/step\n`);
  for(const r of out.rows) console.log(`  ${String(r.elems).padStart(7)} elems  x${String(r.perStep).padStart(6)}/step  ${r.who}`);
  await b.close();
})();
