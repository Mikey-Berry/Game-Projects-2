// The corpse economy: staged decay, bones that persist, salt, hauling, and what each raises into.
const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:1000,height:700}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.slice(0,240)));
 p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text().slice(0,240));});
 await p.goto('file://'+gamePath(process.argv[2]),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 console.log(JSON.stringify(await p.evaluate(()=>{
   const R={};
   const mkBody = (ageDays) => {
     const c = makeChar('Body','bandit',400,400,{atk:20,def:18,tough:22,ath:8});
     c.state='dead'; c.deadAt = (day + hour/24) - ageDays; c.armor='a_lea'; c.weapon='w_kat';
     chars.push(c); corpses.push(c); return c;
   };
   // --- 1. the stage ladder, and how long each lasts in real time ---
   R.ladder = DECAY.map((d,i)=>({
     stage:d.k, fromDay:d.at, raisesAt:Math.round(d.raise*100)+'%', remains:d.remains,
     realMinutes_at1x:+((d.at*HOUR_SEC*24)/60).toFixed(1),
   }));
   R.timing = { bonesGoneAfterDays: BONE_DUST,
     bonesRealMinutes_at1x: +((BONE_DUST*HOUR_SEC*24)/60).toFixed(0),
     bonesRealMinutes_at5x: +((BONE_DUST*HOUR_SEC*24)/60/5).toFixed(0),
     oldEnemyCorpseLife_realMin_at5x: +((2*HOUR_SEC*24)/60/5).toFixed(1) };
   // --- 2. a body at each age reports the right stage ---
   R.stages = [0.5, 3, 7, 20, 40].map(a=>{
     const c = mkBody(a); const st = decayStage(c);
     return {ageDays:a, stage:st.k, label:st.label};
   });
   // --- 3. what each stage raises into ---
   const caster = player().find(x=>x.gift==='dark') || player()[0];
   caster.x = 60; caster.y = 60;   // out in the waste, where nobody is watching
   caster.gift='dark'; caster.stats.magic=24; caster.mana=999;
   research.done.necromancy = true;
   R.raises = {};
   for(const [label, age] of [['fresh',0.5],['cooling',3],['spoiled',7],['bones',20]]){
     caster.mana=999;
     const body = mkBody(age);
     const before = chars.filter(x=>x.undead && x.crafted!==true).length;
     const seen = new Set(chars.map(x=>x.id));
     const logs=[]; const _log=window.log; window.log=(t,k)=>{logs.push(t); return _log(t,k);};
     const ok = castRaise(caster, body);
     window.log=_log;
     const r = chars.find(x=>!seen.has(x.id) && x.undead);
     R.raises[label] = !r ? {failed:true, returned:ok, why:logs.slice(-2)} : {
       name:r.name, rot:r.rot, atk:Math.round(r.stats.atk), tough:Math.round(r.stats.tough),
       blood:r.maxBlood, keptArmour:!!r.armor, keptWeapon:!!r.weapon };
     if(r){ r.master = null; const i=chars.indexOf(r); if(i>=0) chars.splice(i,1); }
   }
   // --- 4. salt stops the clock ---
   stash.salt = 20;
   const cured = mkBody(1);
   const stageBefore = decayStage(cured).k;
   saltBody(cured);
   cured.deadAt -= 25;                       // twenty-five days pass
   R.salt = { stageWhenCured:stageBefore, stageAfter25Days:decayStage(cured).k,
     held: decayStage(cured).k === stageBefore, saltLeft: stash.salt };
   // --- 5. a mule hauls three, a person hauls one ---
   const mule = makeChar('Mule','player',401,401,{}); mule.mule=true; mule.beast=true; chars.push(mule);
   const man  = player().find(x=>!x.mule && !x.undead) || caster;
   const load = [mkBody(1), mkBody(1), mkBody(1), mkBody(1)];
   let mLoaded=0; for(const bdy of load) if(takeBody(mule, bdy)) mLoaded++;
   const spare = [mkBody(1), mkBody(1)];
   let hLoaded=0; for(const bdy of spare) if(takeBody(man, bdy)) hLoaded++;
   R.hauling = { muleCap:carryCap(mule), muleTook:mLoaded, muleCarrying:carried(mule),
     personCap:carryCap(man), personTook:hLoaded,
     mulePaysInSpeed:+moveSpeed(mule).toFixed(2) };
   // --- 6. the cap protects the sim ---
   R.cap = { CORPSE_CAP, onGroundNow: corpses.length };
   // --- 7. it survives a save ---
   const sv=snapshot();
   const bs = corpses.map(c=>({salted:!!c.salted, at:c.saltedAt??null}));
   restore(JSON.parse(JSON.stringify(sv)));
   const as = corpses.map(c=>({salted:!!c.salted, at:c.saltedAt??null}));
   R.saveLoad = { identical: JSON.stringify(bs)===JSON.stringify(as), corpsesKept: as.length };
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,4));
 await b.close();})();
