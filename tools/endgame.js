const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:900,height:600}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.slice(0,240)));
 p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text().slice(0,240));});
 await p.goto('file://'+gamePath(),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 console.log(JSON.stringify(await p.evaluate(()=>{
   const scenario = (label, signCount, forced, order, days) => {
     // reset
     fracture=100; fractureStage=fractureStageOf(fracture); ruin=false;
     if(theDoor) theDoor=null;
     compact.signed=[]; compact.stock={}; compact.muster=[];
     for(let i=chars.length-1;i>=0;i--) if(chars[i].doorborn) chars.splice(i,1);
     towns.forEach(t=>{ t.sacked=0; t.order=70; t.playerRuled=false; t.compactWilling=false;
       t.dreadWoke=true; t.rep=30; t.warWith=null; t.stock={vflesh:20,iron:20,remains:20}; });
     for(let i=0;i<signCount;i++){ if(forced) towns[i].playerRuled=true; compactSign(towns[i]); }
     openTheDoor();
     const fellOn={};
     for(let d=0;d<days;d++){
       day++;
       const before = towns.filter(t=>t.sacked>0).map(t=>t.name);
       siegeTick(); compactProduce(); compactTithe();
       for(const t of towns) if(t.sacked>0 && !before.includes(t.name)) fellOn[t.name]=d;
     }
     const lost = towns.filter(t=>t.sacked>0).length;
     return {label, signed:signCount, standing:7-lost, lost, ruin,
       fellOn, doorR:theDoor?theDoor.r:null,
       sealCost: theDoor ? doorSealCost() : null,
       ordersOfStanding: towns.filter(t=>!t.sacked).map(t=>Math.round(t.order))};
   };
   return [
     scenario('0 signed',            0, false, 70, 40),
     scenario('3 willing',           3, false, 70, 40),
     scenario('5 willing',           5, false, 70, 40),
     scenario('7 willing',           7, false, 70, 40),
     scenario("7 held by force", 7, true, 70, 40),
     scenario("7 held, 90 days",  7, true,  70, 90),
     scenario("7 willing, 90 days", 7, false, 70, 90),
   ];
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,4));
 await b.close();})();
