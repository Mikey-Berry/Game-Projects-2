const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:900,height:600}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,220)));
 await p.goto('file://'+gamePath(),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 console.log(JSON.stringify(await p.evaluate(()=>{
   fracture=100; fractureStage=fractureStageOf(fracture); ruin=false; theDoor=null;
   compact.signed=[]; compact.stock={}; compact.muster=[];
   towns.forEach((t,i)=>{ t.sacked = i>=5 ? 9 : 0; t.order=60; t.dreadWoke=true; t.rep=30;
     t.warWith=null; t.stock={vflesh:20,iron:20,remains:20}; });
   for(let i=0;i<4;i++) compactSign(towns[i]);
   const d=openTheDoor(); d.work=137; d.r=18;
   doorTick(4);   // let some doorborn through
   const snap = () => ({
     fracture:+fracture.toFixed(1), ruin,
     door: theDoor ? {x:theDoor.x, y:theDoor.y, r:theDoor.r, work:Math.round(theDoor.work), opened:theDoor.opened} : null,
     sealCost: doorSealCost(),
     doorborn: chars.filter(c=>c.doorborn).length,
     sacked: towns.map(t=>t.sacked),
     signed:[...compact.signed], stock:Object.fromEntries(Object.entries(compact.stock).map(([k,v])=>[k,Math.round(v)])),
   });
   const before = snap();
   const s = snapshot();
   fracture=0; fractureStage=0; theDoor=null; ruin=true;
   towns.forEach(t=>{t.sacked=0;}); compact.signed=[]; compact.stock={};
   for(const c of chars) c.doorborn=false;
   restore(JSON.parse(JSON.stringify(s)));
   const after = snap();
   return {before, after, identical: JSON.stringify(before)===JSON.stringify(after)};
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,3));
 await b.close();})();
