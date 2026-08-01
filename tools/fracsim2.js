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
   const EVK=['rift','ambush','camp','war','sack','bloodmoon','omen','plague','sixfold','attention'];
   const run = (style, evPerDay, counsel) => {
     fracture=0; fractureStage=0; noticed=0; noticeTier=0; day=1;
     events.length=0; for(const k in playerKnown) delete playerKnown[k];
     for(const t of towns){ t.dread=0; t.dreadWoke=false; t.witnessCd=0; t.known={}; t.rep=20; }
     stash.doctrine=1; stash.sunder=2; stash.remains=8; stash.tome=1;
     const me={name:'You'};
     let counselled=0;
     const wokeDay={};
     for(let d=1; d<=220 && fracture<100; d++){
       day=d;
       noticed = style==='quiet'?4 : style==='steady'?36 : 56;
       noticeTier=noticeTierOf(noticed);
       advanceFracture(1);
       // a plausible ambient event stream, scattered over the map
       for(let k=0;k<evPerDay;k++){
         if(rnd()>0.9) continue;
         const kind=pick(EVK);
         const x=ri(20,W-20), y=ri(20,H-20);
         const e={id:++eventN, day:d, kind, x, y, text:kind};
         events.push(e);
         for(const t of towns) if(dist(t.x,t.y,x,y)<45) townLearns(t,e);
         if(rnd()<0.55) playerLearns(e,'you were there');   // the player travels
       }
       // the player works the halls when there is anything to say
       if(counsel && d>6 && d%2===0){
         const t = towns.filter(x=>!x.dreadWoke).sort((a,b)=>(b.dread||0)-(a.dread||0))[0];
         if(t && counselSeat(t, me)) counselled++;
       }
       for(const t of towns){ const w0=t.dreadWoke; dreadTick(t);
         if(!w0 && t.dreadWoke) wokeDay[t.name]=d; }
     }
     return {style, evPerDay, counsel, landed: fracture>=100?day:'>220',
       counselled, wokeCount:towns.filter(t=>t.dreadWoke).length, wokeDay,
       dread: towns.map(t=>({t:t.name.slice(0,9), tr:(t.leader?t.leader.trait:'?').slice(0,5), d:Math.round(t.dread)}))};
   };
   return {
     ambientOnly_steady: run('steady', 2, false),
     ambientOnly_quiet:  run('quiet',  2, false),
     withCounsel_steady: run('steady', 2, true),
     withCounsel_quiet:  run('quiet',  2, true),
     busyWorld_steady:   run('steady', 5, true),
   };
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,3));
 await b.close();})();
