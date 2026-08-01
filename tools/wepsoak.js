const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:1280,height:800}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.slice(0,220)));
 p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text().slice(0,220));});
 await p.goto('file://'+gamePath(),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(3000);

 // 1. cycle every weapon and tier through one visible character, many times
 const swap = await p.evaluate(()=>{
   const KEYS=['w_plank','w_club','w_rkat','w_kat','w_nod','w_bow','w_xbow','w_kingsfang',
     'w_pyre','w_sever','w_lance','w_kat_c','w_kat_f','w_kat_m','w_nod_m',null];
   const c=player()[0]; let rebuilds=0, threw=null;
   const g0=renderer.info.memory.geometries;
   try{
     for(let i=0;i<160;i++){
       c.weapon=KEYS[i%KEYS.length];
       c.armor=['a_lea','a_pla','a_pla_f','a_lea_m','a_carap','a_rag',null][i%7];
       syncChars(); renderer.render(scene,camera); rebuilds++;
     }
   }catch(e){ threw=e.message.slice(0,160); }
   c.weapon='w_kat'; c.armor='a_pla'; syncChars();
   return {rebuilds, threw, geomBefore:g0, geomAfter:renderer.info.memory.geometries};
 });

 // 2. real play: run fast, let fights happen, then save/load
 await p.evaluate(()=>{ window.speed=5; });
 await p.waitForTimeout(20000);
 const mid = await p.evaluate(()=>({day,dead:chars.filter(c=>c.state==='dead').length,
   fps:+fpsEMA.toFixed(1), geoms:renderer.info.memory.geometries}));
 const round = await p.evaluate(()=>{
   let threw=null; let bytes=0;
   try{ const s=snapshot(); bytes=JSON.stringify(s).length; restore(JSON.parse(JSON.stringify(s))); }
   catch(e){ threw=e.message.slice(0,160); }
   return {threw, bytes};
 });
 await p.waitForTimeout(6000);
 const end = await p.evaluate(()=>{
   let armed=0, meshed=0;
   for(const c of chars){ const e=charMeshes.get(c.id); if(!e) continue;
     if(c.weapon) armed++; if(e.weapon) meshed++; }
   return {chars:chars.length, armedInView:armed, weaponMeshes:meshed,
     fps:+fpsEMA.toFixed(1), geoms:renderer.info.memory.geometries,
     calls:renderer.info.render.calls};
 });
 console.log(JSON.stringify({swap, mid, saveLoad:round, end, errs:errs.slice(0,8)},null,1));
 await b.close();})();
