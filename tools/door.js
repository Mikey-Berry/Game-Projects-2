const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:1000,height:700}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.slice(0,240)));
 p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text().slice(0,240));});
 await p.goto('file://'+gamePath(),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 console.log(JSON.stringify(await p.evaluate(()=>{
   const R={};
   fracture=100; fractureStage=fractureStageOf(fracture); ruin=false; theDoor=null;
   compact.signed=[]; compact.stock={}; compact.muster=[];
   towns.forEach(t=>{ t.sacked=0; t.order=70; t.playerRuled=false; t.compactWilling=false;
     t.dreadWoke=true; t.rep=30; t.warWith=null; t.stock={vflesh:40,iron:40,remains:40}; });
   for(let i=0;i<7;i++) compactSign(towns[i]);
   const d = openTheDoor();
   R.opened = {x:Math.round(d.x), y:Math.round(d.y), r:d.r, cost:doorSealCost()};

   // a caster works the rite
   const c = player().find(x=>x.gift) || player()[0];
   c.gift = c.gift || 'dark'; c.stats.magic = 25;
   c.x = d.x; c.y = d.y; c.mana = 999; c.doorWork = true;
   R.workProgress = [];
   let ticks=0;
   while(theDoor && ticks < 4000){
     c.mana = 999;                       // a squad relaying, not one caster
     workTheDoor(c, 0.5); ticks++;
     if(ticks % 200 === 0 && theDoor) R.workProgress.push(Math.round(theDoor.work/DOOR_WORK*100)+'%');
   }
   R.sealed = !theDoor;
   R.ticksToSeal = ticks;
   R.fractureAfter = +fracture.toFixed(0);
   R.stageAfter = fractureName();
   R.stockLeftAfter = Object.fromEntries(Object.entries(compact.stock).map(([k,v])=>[k,Math.floor(v)]));
   R.townOrdersAfter = towns.map(t=>Math.round(t.order));

   // --- and the failure case: the rite completes with nothing to pay it ---
   fracture=100; fractureStage=fractureStageOf(fracture); theDoor=null;
   compact.stock = {};
   towns.forEach(t=>{ t.stock={}; });
   const d2 = openTheDoor();
   const c2 = player().find(x=>x.gift) || player()[0];
   c2.x=d2.x; c2.y=d2.y; c2.doorWork=true;
   for(let i=0;i<2000;i++){ c2.mana=999; workTheDoor(c2, 0.5); }
   R.unpaid = {stillOpen: !!theDoor, workPinnedAt: theDoor ? Math.round(theDoor.work) : null,
     cap: DOOR_WORK, note:'the rite finishes and waits, it does not close for free'};
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,4));
 await b.close();})();
