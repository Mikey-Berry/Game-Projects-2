// The clock and every hall's belief must survive a save/load intact.
const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:900,height:600}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,200)));
 await p.goto('file://'+gamePath(),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 console.log(JSON.stringify(await p.evaluate(()=>{
   fracture = 63.5; fractureStage = fractureStageOf(fracture);
   compact.signed=[]; compact.stock={}; compact.muster=[];
   towns.forEach((t,i)=>{ t.dreadWoke=true; t.rep=30; t.warWith=null; t.order=70;
     t.stock={vflesh:15,iron:15,remains:15}; if(i>=4) t.playerRuled=true; });
   for(let i=0;i<5;i++) compactSign(towns[i]);
   towns.forEach((t,i)=>{ t.dread = 20+i*11; t.dreadWoke = t.dread>=60;
     t.shown = {doctrine: day}; t.witnessCd = day+2; });
   const before = {fracture:+fracture.toFixed(2), stage:fractureStage, name:fractureName(),
     dread: towns.map(t=>Math.round(t.dread)), woke: towns.map(t=>!!t.dreadWoke),
     shown: towns.map(t=>Object.keys(t.shown||{}).join(',')), cd: towns.map(t=>t.witnessCd),
     cSigned:[...compact.signed], cStock:Object.fromEntries(Object.entries(compact.stock).map(([k,v])=>[k,Math.round(v)])),
     cMuster:compact.muster.length, cFounded:compact.founded,
     willing: towns.map(t=>!!t.compactWilling), strength:+compactStrength().toFixed(1),
     musteredChars: chars.filter(c=>c.mustered).length};
   const s = snapshot();
   // scramble everything, then restore
   fracture = 0; fractureStage = 0;
   towns.forEach(t=>{ t.dread=0; t.dreadWoke=false; t.shown={}; t.witnessCd=0; t.compactWilling=false; });
   compact.signed=[]; compact.stock={}; compact.muster=[]; compact.founded=0;
   for(const c of chars) c.mustered=false;
   restore(JSON.parse(JSON.stringify(s)));
   const after = {fracture:+fracture.toFixed(2), stage:fractureStage, name:fractureName(),
     dread: towns.map(t=>Math.round(t.dread)), woke: towns.map(t=>!!t.dreadWoke),
     shown: towns.map(t=>Object.keys(t.shown||{}).join(',')), cd: towns.map(t=>t.witnessCd),
     cSigned:[...compact.signed], cStock:Object.fromEntries(Object.entries(compact.stock).map(([k,v])=>[k,Math.round(v)])),
     cMuster:compact.muster.length, cFounded:compact.founded,
     willing: towns.map(t=>!!t.compactWilling), strength:+compactStrength().toFixed(1),
     musteredChars: chars.filter(c=>c.mustered).length};
   return {before, after, identical: JSON.stringify(before)===JSON.stringify(after)};
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,3));
 await b.close();})();
