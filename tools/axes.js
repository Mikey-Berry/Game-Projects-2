// The four non-combat axes must do something in the sim, not just set a field.
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
   const N={mass:2,force:2,haste:2,knit:2,plate:2,quiet:2,will:2};
   const shaped=(sh)=>{ const c=makeChar('S','bandit',700,700,{tough:10}); c.state='ok';
     c.blood=c.maxBlood=1e6; applyShape(c, {...N, ...sh}); return c; };

   // --- KNIT: does a shoddy body actually lose limbs faster? ---
   const severRate=(knit)=>{
     let sev=0;
     for(let i=0;i<400;i++){
       const d=shaped({knit}); for(const k in d.parts){ d.parts[k].hp=-60; }
       const a=makeChar('A','player',701,700,{atk:20});
       applyDamage(a,d,'l.arm',30,'cut',false);
       if(d.parts['l.arm'].severed) sev++;
     }
     return +(sev/400*100).toFixed(1);
   };
   R.knit = {shoddy0:severRate(0)+'%', neutral2:severRate(2)+'%', seamless5:severRate(5)+'%',
     note:'severance chance on a cut limb deep in the red'};

   // --- PLATING: does it go through the damage-type matrix? ---
   const hit=(plate,wt)=>{
     let lost=0;
     for(let i=0;i<250;i++){
       const d=shaped({plate}); d.blood=d.maxBlood=1e6;
       for(const k in d.parts){ d.parts[k].hp=1e6; d.parts[k].max=1e6; }
       const a=makeChar('A','player',701,700,{atk:20});
       const b0=d.blood+Object.values(d.parts).reduce((s,q)=>s+q.hp,0);
       applyDamage(a,d,'chest',30,wt,false);
       lost+=b0-(d.blood+Object.values(d.parts).reduce((s,q)=>s+q.hp,0));
     }
     return +(lost/250).toFixed(1);
   };
   R.plating = {
     bare:      {cut:hit(2,'cut'), pierce:hit(2,'pierce'), blunt:hit(2,'blunt')},
     bonePlate: {cut:hit(3,'cut'), pierce:hit(3,'pierce'), blunt:hit(3,'blunt')},
     chitin:    {cut:hit(5,'cut'), pierce:hit(5,'pierce'), blunt:hit(5,'blunt')},
     note:'damage taken from a nominal 30. Plate should shed cuts and fold to blunt; chitin the reverse.'};

   // --- QUIET: does a loud host actually move the sky? ---
   const noiseRun=(quiet)=>{
     for(let i=chars.length-1;i>=0;i--) if(chars[i]._t) chars.splice(i,1);
     noticed=0; noticeTier=0;
     for(let i=0;i<12;i++){ const u=shaped({quiet}); u._t=true; u.faction='player'; u.undead=true; chars.push(u); }
     for(let d=0;d<200;d++) hostNoiseTick();
     const n=noticed;
     for(let i=chars.length-1;i>=0;i--) if(chars[i]._t) chars.splice(i,1);
     return +n.toFixed(2);
   };
   R.quiet = {clamorous0:noiseRun(0), neutral2:noiseRun(2), silent5:noiseRun(5),
     note:'notice accrued by a host of twelve over 200 ticks — and notice feeds the Fracture clock'};

   // --- WILL: does a leashed body fray off the end of its lead? ---
   const master=makeChar('M','player',800,800,{magic:20}); master.state='ok'; chars.push(master);
   const frayAt=(will,away)=>{
     const u=shaped({will}); u.faction='player'; u.undead=true; u.master=master;
     u.x=800+away; u.y=800; chars.push(u);
     leashTick();
     const r={leash:u.leash, frayed:!!u.frayed, atk:+atkPower(u).toFixed(1), speed:+moveSpeed(u).toFixed(2)};
     const i=chars.indexOf(u); if(i>=0) chars.splice(i,1);
     return r;
   };
   R.will = { leashed_at5:frayAt(0,5), leashed_at40:frayAt(0,40),
     unbound_at40:frayAt(5,40), unbound_at100:frayAt(5,100) };

   // --- and all four survive a save ---
   const keep=shaped({knit:4, plate:5, quiet:0, will:5}); keep.faction='player'; keep.undead=true; chars.push(keep);
   const before={knit:keep.knit, nat:keep.natArmor?{...keep.natArmor}:null, noise:keep.noise, leash:keep.leash};
   const sv=snapshot();
   keep.knit=null; keep.natArmor=null; keep.noise=null; keep.leash=null;
   restore(JSON.parse(JSON.stringify(sv)));
   const k2=chars.find(c=>c.id===keep.id);
   const after=k2?{knit:k2.knit, nat:k2.natArmor?{...k2.natArmor}:null, noise:k2.noise, leash:k2.leash}:null;
   R.saveLoad={identical: JSON.stringify(before)===JSON.stringify(after), before, after};
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,4));
 await b.close();})();
