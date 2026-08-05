// Do convictions actually diverge, and do the ends of the scale do anything?
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
   // one of each conviction, side by side, watching the same career
   const squad = CONVICTION_KEYS.map((k,i)=>{
     const c = makeChar('T'+i, 'player', 400+i, 400, {magic:2});
     c.conviction = k; c.regard = 0; c.state='ok'; chars.push(c); return c;
   });
   const snapshotRegard = () => Object.fromEntries(squad.map(c=>[c.conviction, Math.round(c.regard)]));
   // a career of sacking towns and raising their dead
   for(let i=0;i<6;i++){ deed('sack'); deed('civkill'); deed('raise'); }
   R.afterCruelCareer = snapshotRegard();
   // reset, then a career of sealing tears and saving seats
   for(const c of squad) c.regard = 0;
   for(let i=0;i<6;i++){ deed('rift_sealed'); deed('town_saved'); deed('compact'); }
   R.afterKindCareer = snapshotRegard();
   // education damps the swing
   const a = makeChar('Plain','player',500,500,{magic:2});  a.conviction='compassion'; a.regard=0; chars.push(a);
   const e = makeChar('Lettered','player',501,500,{magic:20}); e.conviction='compassion'; e.regard=0; chars.push(e);
   for(let i=0;i<5;i++) deed('sack');
   R.educationDamper = {plain:Math.round(a.regard), lettered:Math.round(e.regard)};
   // the ends of the scale must DO something
   const q = makeChar('Quitter','player',600,600,{magic:2}); q.conviction='compassion'; q.regard=-95; q.state='ok'; chars.push(q);
   const t = makeChar('Traitor','player',601,600,{magic:2}); t.conviction='cruel'; t.regard=-95; t.state='ok'; chars.push(t);
   const d = makeChar('Zealot','player',602,600,{magic:2}); d.conviction='loyal'; d.regard=75; d.state='ok'; chars.push(d);
   let left=false, turned=false;
   for(let n=0;n<80 && !(left&&turned);n++){
     regardTick();
     if(q.leaving) q.leaving = day;      // let the notice period elapse
     if(t.leaving) t.leaving = day;
     regardTick();
     left = q.faction==='drifter'; turned = t.faction==='bandit';
   }
   R.consequences = { quitterLeft:left, quitterFaction:q.faction,
     traitorTurned:turned, traitorFaction:t.faction, traitorTargetsYou:!!t.provoked,
     zealotDevoted:!!d.devoted };
   // and it has to survive a save
   const before = squad.map(c=>({c:c.conviction, r:Math.round(c.regard)}));
   const sv=snapshot(); for(const c of squad){ c.regard=0; c.conviction='cold'; }
   restore(JSON.parse(JSON.stringify(sv)));
   const after = chars.filter(c=>squad.some(s=>s.id===c.id)).map(c=>({c:c.conviction, r:Math.round(c.regard)}));
   R.saveLoad = { identical: JSON.stringify(before)===JSON.stringify(after), kept: after.length };
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,4));
 await b.close();})();
