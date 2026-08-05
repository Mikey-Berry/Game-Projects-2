// Does the shaping bench actually produce different animals, and does promotion work?
const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:1000,height:800}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.slice(0,240)));
 p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text().slice(0,240));});
 await p.goto('file://'+gamePath(process.argv[2]),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 console.log(JSON.stringify(await p.evaluate(()=>{
   const R={};
   const caster = player().find(c=>c.gift==='dark') || player()[0];
   caster.gift='dark'; caster.stats.magic=30; caster.mana=999;
   research.done.rites_binding=true; research.done.rites_deep=true; research.done.necromancy=true;
   for(const k of ['vflesh','remains','iron','hide','fabric','stone','copper','wood','tome','c_ingot']) stash[k]=9999;
   const circle={x:caster.x, y:caster.y};
   R.budget = shapeBudget(caster);
   // three deliberate extremes off the same recipe
   const N = {mass:2, force:2, haste:2, knit:2, plate:2, quiet:2, will:2};
   const builds = {
     'even':            {...N},
     'golem':           {...N, mass:5, force:4, haste:0},
     'skitterer':       {...N, mass:0, force:1, haste:5},
     'shambles (kn0)':  {...N, knit:0},
     'seamless (kn5)':  {...N, knit:5},
     'bone-plated':     {...N, plate:3},
     'chitin-grafted':  {...N, plate:5},
     'silent (q5)':     {...N, quiet:5, mass:1},
     'clamorous (q0)':  {...N, quiet:0},
     'leashed (w0)':    {...N, will:0},
     'unbound (w5)':    {...N, will:5},
   };
   R.shapes={};
   for(const [label, sh] of Object.entries(builds)){
     caster.mana=999;
     for(const x of chars) if(x.master===caster) x.master=null;   // clear the binding
     const before=chars.length;
     craftUndead('brute', caster, circle, sh);
     const u=chars[chars.length-1];
     if(chars.length===before){ R.shapes[label]='BIND FAILED'; continue; }
     R.shapes[label]={ name:u.name, blood:u.maxBlood, speed:+moveSpeed(u).toFixed(2),
       knitMult:+(u.knit??1).toFixed(2), construct:!!u.construct,
       partMax:Math.round(u.parts.chest.max),
       plating:u.natArmor?`${u.natArmor.cls} ${(u.natArmor.def*100).toFixed(0)}%`:'bare',
       noise:+(u.noise??0).toFixed(2), leash:u.leash,
       cost:costText(shapeCost(sh, caster))||'within budget' };
   }
   // promotion: gated on kills, then real
   caster.mana=999;
   craftUndead('brute', caster, circle, {mass:2,force:2,haste:2});
   const u=chars[chars.length-1];
   R.promote={ blockedAtZeroKills: canPromote(u, caster) };
   u.kills=6;
   const loadBefore=risenLoad(caster);
   const ok=promote(u, caster);
   R.promote.afterSixKills={ promoted:ok, lieutenant:!!u.lieutenant, minded:!!u.minded,
     named:u.name, loadBefore, loadAfter:risenLoad(caster),
     freedASlot: risenLoad(caster) < loadBefore };
   // and it all has to survive a save
   const s=snapshot();
   const shapesBefore=chars.filter(c=>c.shape).map(c=>({n:c.name,s:{...c.shape},k:c.kills||0}));
   restore(JSON.parse(JSON.stringify(s)));
   const shapesAfter=chars.filter(c=>c.shape).map(c=>({n:c.name,s:{...c.shape},k:c.kills||0}));
   R.saveLoad={ shapesKept: shapesAfter.length, identical: JSON.stringify(shapesBefore)===JSON.stringify(shapesAfter) };
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,4));
 await b.close();})();
