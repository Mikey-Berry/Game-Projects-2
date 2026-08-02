const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:1000,height:700}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.slice(0,220)));
 p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text().slice(0,220));});
 await p.goto('file://'+gamePath(),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 console.log(JSON.stringify(await p.evaluate(()=>{
   const R={};
   const mk=(f,o)=>{const c=makeChar('X',f,500,500,o); c.state='ok'; chars.push(c); return c;};

   // --- 1. lance: cells consumed, and it cooks the hand when worked ---
   stash.aether_cell = 6;
   const gun = mk('player',{atk:20}); gun.weapon='w_lance';
   const dummy = mk('town',{tough:10}); dummy.blood=dummy.maxBlood=1e6;
   const W = ITEMS.w_lance;
   let shots=0, burned=0;
   const armBefore = gun.parts['r.arm'].hp;
   for(let i=0;i<10;i++){ if(lanceFire(gun,W)) shots++; }
   R.lance = {cellsStart:6, cellsLeft:stash.aether_cell||0, shotsFired:shots,
     heat:+(gun.heat||0).toFixed(2), armDamageTaken:+(armBefore-gun.parts['r.arm'].hp).toFixed(1),
     firedWhileDry: shots>6 };
   // a gifted hand couples worse
   stash.aether_cell = 20;
   const mage = mk('player',{atk:20,magic:20}); mage.weapon='w_lance'; mage.gift='destruction';
   const mArm = mage.parts['r.arm'].hp;
   for(let i=0;i<8;i++) lanceFire(mage, W);
   R.lanceGifted = {armDamageTaken:+(mArm-mage.parts['r.arm'].hp).toFixed(1),
     note:'gifted hands should take MORE than the deaf'};

   // --- 2. massed fire: strays scale with how many are shooting the same scrum ---
   const foe = mk('bandit',{tody:1}); foe.x=520; foe.y=520;
   const ally = mk('player',{}); ally.x=520.3; ally.y=520.3;   // tangled in melee with the foe
   const shooters=[];
   const strayFor = (n)=>{
     for(const s of shooters){ const i=chars.indexOf(s); if(i>=0) chars.splice(i,1); }
     shooters.length=0;
     for(let i=0;i<n;i++){ const a=mk('player',{atk:10,ranged:10}); a.x=515; a.y=515;
       a.weapon='w_bow'; a.target=foe; shooters.push(a); }
     const c=shooters[0];
     const volley = chars.filter(o=>o!==c && o.state==='ok' && o.faction===c.faction &&
       o.weapon && ITEMS[o.weapon] && ITEMS[o.weapon].range && o.target===foe).length;
     return {archers:n, volleyCounted:volley,
       strayChance:+clamp(0.30-10*0.006+volley*0.055,0.03,0.72).toFixed(3)};
   };
   R.massedFire=[1,3,6,10].map(strayFor);

   // --- 3. the mark: undead get the bonus, the living do not ---
   const target = mk('bandit',{tough:20}); target.armor='a_lea'; target.blood=target.maxBlood=1e6;
   for(const k in target.parts){target.parts[k].hp=1e6;target.parts[k].max=1e6;}
   const living = mk('player',{atk:20}); const risen = mk('player',{atk:20}); risen.undead=true;
   const hit=(attacker,marked)=>{
     target.markT = marked ? 9 : 0;
     const b0=Object.values(target.parts).reduce((s,q)=>s+q.hp,0);
     for(let i=0;i<200;i++){ target.markT = marked?9:0; applyDamage(attacker,target,'chest',30,'cut',false); }
     return +((b0-Object.values(target.parts).reduce((s,q)=>s+q.hp,0))/200).toFixed(2);
   };
   const uUn=hit(risen,false), uMk=hit(risen,true), lUn=hit(living,false), lMk=hit(living,true);
   R.mark={undead_unmarked:uUn, undead_marked:uMk, undeadGain:+((uMk/uUn-1)*100).toFixed(1)+'%',
     living_unmarked:lUn, living_marked:lMk, livingGain:+((lMk/lUn-1)*100).toFixed(1)+'%'};

   // --- 4. bind strain refreshes off the roster ---
   const necro = mk('player',{magic:30}); necro.gift='dark';
   const bound=[]; for(let i=0;i<5;i++){ const u=mk('player',{}); u.undead=true; u.master=necro; u.bindWeight=2; bound.push(u); }
   refreshBindStrain();
   R.bindStrain={boundWeight:necro._bindW, strain:+bindStrain(necro).toFixed(2),
     maxManaNow:maxMana(necro), maxManaUnbound:rawMaxMana(necro)};
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,5));
 await b.close();})();
