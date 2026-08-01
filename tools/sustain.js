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
   const scenario = (label, howMany, forced, order) => {
     compact.signed=[]; compact.stock={}; compact.muster=[]; compact.founded=0;
     towns.forEach(t=>{ t.playerRuled=false; t.compactWilling=false; t.dreadWoke=true;
       t.rep=30; t.warWith=null; t.sacked=0; t.order=order;
       t.stock={vflesh:15, iron:15, remains:15, mats:10, stone:10}; });
     for(let i=0;i<howMany;i++){ if(forced) towns[i].playerRuled=true; compactSign(towns[i]); }
     // run 60 days: production, tithe, and a seal drawn whenever affordable
     let seals=0, starvedDays=0;
     for(let d=0;d<60;d++){
       compactProduce(); compactTithe();
       // the sky is opening tears; try to pay for one every other day
       if(d%2===0){ if(sealStock(RIFT_SEAL_COST)) seals++; else starvedDays++; }
     }
     return {label, signed:compactSize(), strength:+compactStrength().toFixed(1),
       output:+compactOutput().toFixed(2), sealsIn60d:seals, timesStarved:starvedDays,
       stockLeft:Object.fromEntries(Object.entries(compact.stock).map(([k,v])=>[k,Math.floor(v)]))};
   };
   return [
     scenario('3 willing, order 70',  3, false, 70),
     scenario('5 willing, order 70',  5, false, 70),
     scenario('7 willing, order 70',  7, false, 70),
     scenario('7 FORCED, order 40',   7, true,  40),
     scenario('7 FORCED, order 70',   7, true,  70),
     scenario('5 willing, order 30',  5, false, 30),
   ];
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,3));
 await b.close();})();
