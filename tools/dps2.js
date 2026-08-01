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
   const ATK=20;
   const suits=[['civ',null,4],['bandit(lea)','a_lea',12],['guard(plate)','a_pla',24],
                ['elite(mw plate)','a_pla_m',40],['boss(carapace)','a_carap',60]];
   const measure=(t,dmg,wt,ap,n=240)=>{
     let lost=0;
     for(let i=0;i<n;i++){
       const d=makeChar('D','town',400,400,{tough:t[2]}); d.armor=t[1]; d.state='ok';
       d.blood=d.maxBlood=1e6; for(const k in d.parts){d.parts[k].hp=1e6;d.parts[k].max=1e6;}
       const a=makeChar('A','player',401,400,{atk:ATK});
       const b0=d.blood+Object.values(d.parts).reduce((s,q)=>s+q.hp,0);
       applyDamage(a,d,'chest',dmg,wt,false,false,false,ap);
       lost+=b0-(d.blood+Object.values(d.parts).reduce((s,q)=>s+q.hp,0));
     }
     return lost/n;
   };
   const rows=[];
   for(const wk of ['w_plank','w_club','w_rkat','w_kat','w_nod','w_kingsfang','w_pyre','w_sever','w_bow','w_xbow','w_lance']){
     const it=ITEMS[wk];
     const a=makeChar('A','player',10,10,{atk:ATK,blades:20,blunt:20,ranged:20,martial:10});
     a.weapon=wk;
     const ranged=!!it.range;
     const raw = ranged ? it.dmg*(1+ATK*0.02) : atkPower(a);
     const cd  = ranged ? (it.rof||2.2)/(1+ATK*0.012) : 1.25/(1+ATK*0.015);
     const r={weapon:it.name,kind:ranged?'RANGED':'melee',dmg:it.dmg,wt:it.wt,ap:it.ap||0,cd:+cd.toFixed(2)};
     for(const t of suits){
       const hc = ranged ? 1-Math.min(0.4,Math.max(0,0.15+t[2]*0.008*0)) : 0.7;
       r[t[0]]=+((measure(t,raw,it.wt,it.ap||0)*hc)/cd).toFixed(1);
     }
     rows.push(r);
   }
   return rows;
 }),null,1));
 await b.close();})();
