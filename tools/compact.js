const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:1100,height:800}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.slice(0,240)));
 p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text().slice(0,240));});
 await p.goto('file://'+gamePath(),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 console.log(JSON.stringify(await p.evaluate(()=>{
   const R={};
   fracture=55; fractureStage=fractureStageOf(fracture);

   // --- 1. gating: who will and won't sign, and why ---
   R.gating = towns.map(t=>{ const c=compactCanSign(t); return {t:t.name.slice(0,9), ok:c.ok, why:c.why||(c.forced?'by writ':'willing')}; });

   // --- 2. a WILLING signatory: what does it cost them? ---
   const w = towns[0];
   w.dreadWoke=true; w.rep=30; w.warWith=null; w.order=70;
   w.stock={vflesh:20, iron:20, remains:20, mats:20, stone:20};
   const gBefore = chars.filter(c=>c.homeTown===w && c.guard && c.state==='ok').length;
   const before = {order:w.order, stock:{...w.stock}, guards:gBefore};
   compactSign(w);
   R.willing = {town:w.name, before, after:{order:Math.round(w.order), stock:{...w.stock},
     guards: chars.filter(c=>c.homeTown===w && c.guard && c.state==='ok').length,
     mustered: chars.filter(c=>c.homeTown===w && c.mustered).length},
     commonStock:{...compact.stock}, weight:compactWeight(w)};

   // --- 3. a FORCED signatory: worse bargain, measurably ---
   const f = towns[1];
   f.playerRuled=true; f.order=70; f.stock={vflesh:20, iron:20, remains:20, mats:20, stone:20};
   const fg = chars.filter(c=>c.homeTown===f && c.guard && c.state==='ok').length;
   compactSign(f);
   R.forced = {town:f.name, orderBite:70-Math.round(f.order),
     guardsSent: chars.filter(c=>c.homeTown===f && c.mustered).length,
     weight:compactWeight(f), willing:!!f.compactWilling};
   R.willingOrderBite = before.order - Math.round(w.order);

   // --- 4. the Compact has to STAND before it does anything ---
   R.beforeThird = {size:compactSize(), active:compactActive(),
     sealFromStock: sealStock({vflesh:1,iron:1,remains:1})};
   const th = towns[2]; th.dreadWoke=true; th.rep=30; th.warWith=null; th.order=70;
   th.stock={vflesh:20, iron:20, remains:20};
   compactSign(th);
   R.afterThird = {size:compactSize(), active:compactActive(), strength:+compactStrength().toFixed(1)};

   // --- 5. the tithe keeps feeding it ---
   const s0 = {...compact.stock};
   for(let d=0;d<10;d++) compactTithe();
   R.tithe = {after10days:{...compact.stock}, grewBy:
     Object.fromEntries(Object.keys(compact.stock).map(k=>[k, Math.round((compact.stock[k]||0)-(s0[k]||0))]))};

   // --- 6. the muster goes to tears, not walls ---
   const r = openRift(towns[0].x+30, towns[0].y+30, 'test tear');
   musterTick();
   const m = compact.muster.map(id=>charById.get(id)).filter(Boolean);
   R.muster = {count:m.length, sentToTear:m.filter(c=>c.guard &&
     Math.abs(c.guard.x-r.x)<1 && Math.abs(c.guard.y-r.y)<1).length};

   // --- 7. a town left to rot walks out ---
   const rot = towns[0]; rot.order = 5;
   let released=0; for(let i=0;i<40;i++){ const n0=compactSize(); compactStrainTick(); if(compactSize()<n0) released++; }
   R.strain = {orderWas:5, walkedOut:released>0, sizeNow:compactSize()};
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,4));
 await b.close();})();
