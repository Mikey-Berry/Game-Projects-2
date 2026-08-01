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
   // Everything now goes through applyDamage, so measure damage actually taken.
   const trial = (armor, tough, wt, n=300) => {
     let lost=0;
     for(let i=0;i<n;i++){
       const t=makeChar('D','town',400,400,{tough}); t.armor=armor; t.state='ok';
       t.blood=t.maxBlood=1e6; for(const k in t.parts){t.parts[k].hp=1e6;t.parts[k].max=1e6;}
       const a=makeChar('A','player',401,400,{atk:20});
       const b0=t.blood+Object.values(t.parts).reduce((s,q)=>s+q.hp,0);
       applyDamage(a,t,'chest',30,wt,false);
       lost += b0-(t.blood+Object.values(t.parts).reduce((s,q)=>s+q.hp,0));
     }
     return +(lost/n).toFixed(1);
   };
   const suits=[['none',null,4],['leather',"a_lea",12],['iron plate','a_pla',24],
                ['masterwork plate','a_pla_m',40],['carapace','a_carap',60]];
   const M={};
   for(const [label,ar,tg] of suits){
     M[label]={};
     for(const wt of ['cut','pierce','blunt','burn']) M[label][wt]=trial(ar,tg,wt);
   }
   // does a strained necromancer really get softer?
   const strain=[0,4,8,12].map(w=>{
     const t=makeChar('N','player',400,400,{tough:20}); t.armor='a_lea'; t.state='ok'; t._bindW=w;
     t.blood=t.maxBlood=1e6; for(const k in t.parts){t.parts[k].hp=1e6;t.parts[k].max=1e6;}
     const a=makeChar('A','town',401,400,{atk:20});
     const b0=t.blood+Object.values(t.parts).reduce((s,q)=>s+q.hp,0);
     let lost=0; for(let i=0;i<200;i++){ applyDamage(a,t,'chest',30,'cut',false); }
     lost=b0-(t.blood+Object.values(t.parts).reduce((s,q)=>s+q.hp,0));
     const mm=Math.round(rawMaxMana({stats:{magic:30}})*(1-Math.min(0.62,w*0.05)));
     return {boundWeight:w, dmgTakenPerHit:+(lost/200).toFixed(1), strain:+(Math.min(0.62,w*0.05)).toFixed(2), manaAt30:mm};
   });
   // darkbolt now
   const db=[10,20,30,40].map(m=>({magic:m, perBolt:+(5+Math.min(9,m*0.22)).toFixed(1)}));
   return {matrix:M, strain, darkbolt:db,
     lance:{dmg:ITEMS.w_lance.dmg, rof:ITEMS.w_lance.rof, charge:!!ITEMS.w_lance.charge}};
 }),null,1));
 await b.close();})();
