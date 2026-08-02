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
   const R={melee:0, ranged:0, lance:0, spells:0, kills:0, threw:null};
   stash.aether_cell = 400;
   const mk=(f,o)=>{const c=makeChar('X',f,600,600,o); c.state='ok'; chars.push(c); return c;};
   try{
     // 400 melee exchanges across every weapon and armour combination
     const weps=['w_plank','w_club','w_rkat','w_kat','w_nod','w_kingsfang','w_pyre','w_sever'];
     const arms=[null,'a_rag','a_lea','a_pla','a_pla_m','a_carap','a_shroud','a_lev','a_marshal','a_baroness'];
     for(let i=0;i<400;i++){
       const a=mk('player',{atk:20,blades:15}); a.weapon=weps[i%weps.length];
       const d=mk('bandit',{tough:10+i%40}); d.armor=arms[i%arms.length];
       a.x=600; a.y=600; d.x=600.6; d.y=600;
       attack(a,d); R.melee++;
       if(d.state==='dead') R.kills++;
     }
     // 300 ranged shots including the lance
     for(let i=0;i<300;i++){
       const a=mk('player',{atk:20,ranged:15});
       a.weapon = i%3===0 ? 'w_lance' : i%3===1 ? 'w_xbow' : 'w_bow';
       const d=mk('bandit',{tough:20}); d.armor=arms[i%arms.length];
       a.x=600; a.y=600; d.x=604; d.y=600; a.target=d;
       fireRanged(a,d,ITEMS[a.weapon]);
       if(a.weapon==='w_lance') R.lance++;
       R.ranged++;
     }
     // resolve every projectile
     for(let i=0;i<200;i++) updateProjectiles(0.1);
     // 200 spells of each kind
     for(let i=0;i<200;i++){
       const c=mk('player',{magic:25}); c.gift = i%2 ? 'dark':'destruction'; c.mana=99;
       const d=mk('bandit',{tough:20}); d.armor=arms[i%arms.length];
       c.x=600;c.y=600; d.x=603;d.y=600;
       if(i%2) castDarkbolt(c,d); else castFirebolt(c,d);
       R.spells++;
     }
     for(let i=0;i<200;i++) updateProjectiles(0.1);
     R.markedNow = chars.filter(c=>c.markT>0).length;
     R.overheated = chars.filter(c=>(c.heat||0)>0).length;
     R.cellsUsed = 400-(stash.aether_cell||0);
     R.deadNow = chars.filter(c=>c.state==='dead').length;
     R.anyNaN = chars.some(c=>!Number.isFinite(c.blood) ||
       Object.values(c.parts).some(q=>!Number.isFinite(q.hp)));
   }catch(e){ R.threw = e.message.slice(0,240); }
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,5));
 await b.close();})();
