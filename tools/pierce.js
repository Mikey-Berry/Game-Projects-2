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
   // Fire identical damage at a naked man and a man in masterwork plate, 400 times each,
   // and measure the blood actually lost. If armour matters, the numbers diverge.
   /* Every damage path goes through applyDamage now, so both rows are measured the same
      way: same nominal hit, same function, only the damage type differs. Before the fix a
      projectile skipped mitigation entirely and delivered a flat 30 through anything.

      (An earlier version of this probe pre-mitigated the melee row by hand and then let
      applyDamage mitigate it again, which made melee look four times weaker than it is.
      If you are adding a row here, let applyDamage do the arithmetic.) */
   const trial = (armor, tough, wt) => {
     let lost = 0;
     for(let i=0;i<400;i++){
       const t = makeChar('D','town',400,400,{tough});
       t.armor = armor; t.state='ok'; t.blood=t.maxBlood=1e6;
       for(const k in t.parts){ t.parts[k].hp = 1e6; t.parts[k].max = 1e6; }
       const a = makeChar('A','player',401,400,{atk:20});
       const before = t.blood + Object.values(t.parts).reduce((s,q)=>s+q.hp,0);
       applyDamage(a, t, 'chest', 30, wt, false);
       lost += before - (t.blood + Object.values(t.parts).reduce((s,q)=>s+q.hp,0));
     }
     return +(lost/400).toFixed(2);
   };
   return {
     pierceVsNaked:        trial(null,     4,  'pierce'),
     pierceVsMasterPlate:  trial('a_pla_m',40, 'pierce'),
     pierceVsCarapace:     trial('a_carap',60, 'pierce'),
     cutVsNaked:           trial(null,     4,  'cut'),
     cutVsMasterPlate:     trial('a_pla_m',40, 'cut'),
     cutVsCarapace:        trial('a_carap',60, 'cut'),
     bluntVsMasterPlate:   trial('a_pla_m',40, 'blunt'),
     bluntVsCarapace:      trial('a_carap',60, 'blunt'),
     note:'same nominal 30 in every row. A flat 30 through armour means mitigation is being skipped again.'
   };
 }),null,1));
 await b.close();})();
