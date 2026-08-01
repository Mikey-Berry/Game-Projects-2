const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:900,height:600}});
 await p.goto('file://'+gamePath(),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 console.log(JSON.stringify(await p.evaluate(()=>{
   // Demand rises with the ladder, because riftCap does. Seals needed per day at each stage,
   // assuming you close tears about as fast as they open.
   const DEMAND = {1:0.20, 2:0.33, 3:0.50, 4:0.66, 5:0.85};
   const run = (howMany, forced, order, stage) => {
     compact.signed=[]; compact.stock={}; compact.muster=[];
     towns.forEach(t=>{ t.playerRuled=false; t.compactWilling=false; t.dreadWoke=true;
       t.rep=30; t.warWith=null; t.sacked=0; t.order=order;
       t.stock={vflesh:15, iron:15, remains:15}; });
     for(let i=0;i<howMany;i++){ if(forced) towns[i].playerRuled=true; compactSign(towns[i]); }
     let need=0, met=0, missed=0;
     for(let d=0;d<60;d++){
       compactProduce(); compactTithe();
       need += DEMAND[stage];
       while(need >= 1){ need -= 1; if(sealStock(RIFT_SEAL_COST)) met++; else { missed++; break; } }
     }
     return {met, missed, uptime: met+missed ? +(met/(met+missed)*100).toFixed(0) : 100};
   };
   const out = {};
   for(const stage of [3,4,5]){
     out['stage'+stage] = {};
     for(const n of [3,5,7]) out['stage'+stage]['willing'+n] = run(n,false,70,stage);
     out['stage'+stage]['forced7_order45'] = run(7,true,45,stage);
   }
   return out;
 }),null,1));
 await b.close();})();
