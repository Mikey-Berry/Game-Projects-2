const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:1280,height:800}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.slice(0,220)));
 p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text().slice(0,220));});
 await p.goto('file://'+gamePath(process.argv[2]),{waitUntil:'load'});
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
 /* ---------- THE AUTHORED WEAPONS ----------
    Two of the sixteen keys above are not boxes any more: they are baked meshes carried in the
    document, and an authored weapon has ways to be wrong that a box never had. Every one of
    these was true at some point while fitting them.
      - it silently falls back to the box definition, and nobody notices because a weapon
        still appears in the hand
      - it is scaled off a unit box, so "wrong length" means a toy or a fence post rather than
        anything as obvious as a missing mesh
      - it is held by the wrong end, which is what `rz:180` on the Sundering Edge is for: the
        export runs the blade up +Y and the first fit had it carried like a torch
      - it is duplicated per wielder instead of shared, which is the leak this file exists to
        catch, and 1,600 triangles a body is a very different bill from 1,600 once */
 const authored = await p.evaluate(()=>{
   const R={};
   const c=player()[0];
   /* AN EXPECTED LIST, not the table's own keys. The first version of this iterated
      `Object.keys(WEPFIT)` — so deleting an entry deleted its test along with it, and the
      weapon fell silently back to boxes with the harness reporting everything fine. A check
      driven by the thing it is checking cannot notice that thing going missing. */
   const keys=['w_sever','w_lance'];
   R.keys = keys.join(', ');
   R.allFitted = keys.every(k=>WEPFIT[k]) ? 'both authored weapons have a fit'
     : '!! MISSING A FIT: '+keys.filter(k=>!WEPFIT[k]).join(', ');
   /* the baked mesh is what gets drawn, not the box fallback */
   const boxTris = k => (WEAPONS[k].parts||[]).length * 12;
   const bad=[];
   for(const k of keys){
     const g=weaponGeo(k);
     if(!g){ bad.push(k+' HAS NO GEOMETRY'); continue; }
     /* a merged box weapon is not indexed, so `g.index` is null and counting only indices
        reports it as zero triangles — right answer, wrong reason, and a confusing message */
     const t=g.index?g.index.count/3:g.attributes.position.count/3;
     if(t <= boxTris(k)) bad.push(`${k} drew ${t} tris — that is the box, not the model`);
   }
   R.authoredDrawn = bad.length ? '!! '+bad.join('; ') : keys.length+' authored weapons draw their own mesh';
   /* ONE GEOMETRY, EVERY ARM. Arm four bodies with the same authored weapon and every one of
      them must be pointing at the same BufferGeometry object. */
   {
     const born=[];
     for(let i=0;i<4;i++){
       const u=makeChar('W'+i,'player',c.x+1+i*0.4,c.y+1,{atk:8,def:8,tough:8});
       u.weapon='w_sever'; u.state='ok'; chars.push(u); born.push(u);
     }
     for(let i=0;i<40;i++) syncChars(0.05);
     const geos=new Set();
     for(const u of born){ const e=charMeshes.get(u.id); if(e&&e.weapon) geos.add(e.weapon.geometry); }
     R.oneGeometry = geos.size===1 ? 'four wielders share one geometry'
       : `!! ${geos.size} SEPARATE GEOMETRIES FOR ${born.length} WIELDERS`;
     /* and it survives one of them swapping away from it */
     const first=charMeshes.get(born[0].id);
     const shared=first&&first.weapon?first.weapon.geometry:null;
     born[0].weapon='w_kat';
     for(let i=0;i<20;i++) syncChars(0.05);
     const still=charMeshes.get(born[1].id);
     R.survivesASwap = (shared && still && still.weapon && still.weapon.geometry===shared
                        && still.weapon.geometry.attributes.position)
       ? 'and one of them swapping does not dispose it out from under the rest'
       : '!! A SWAP DISPOSED THE SHARED AUTHORED GEOMETRY';
     for(const u of born){ const i=chars.indexOf(u); if(i>=0) chars.splice(i,1); }
   }
   /* HELD BY THE RIGHT END, and long enough to be the weapon it says it is. Both are measured
      against the rig rather than against the fit table, which is the thing being checked. */
   {
     const u=makeChar('Z','player',c.x+2,c.y+2,{atk:8,def:8,tough:8});
     u.weapon='w_sever'; u.state='ok'; chars.push(u);
     for(let i=0;i<40;i++) syncChars(0.05);
     const e=charMeshes.get(u.id);
     if(!e||!e.weapon){ R.pointsDown='!! NO SEVER MESH'; }
     else {
       e.g.updateWorldMatrix(true,true);
       const wb=new THREE.Box3().setFromObject(e.weapon);
       const fist=new THREE.Vector3(); e.elbR.getWorldPosition(fist); fist.y-=0.30;
       const below=fist.y-wb.min.y, above=wb.max.y-fist.y;
       R.pointsDown = below > above*1.5
         ? `the blade hangs ${below.toFixed(2)} below the fist and ${above.toFixed(2)} above it`
         : `!! THE SUNDERING EDGE IS HELD THE WRONG WAY UP (${below.toFixed(2)} below, ${above.toFixed(2)} above)`;
       /* DIVIDE OUT THE WIELDER. The box is world-space and the weapon is a child of the rig,
          so this length is the blade TIMES whatever body `makeChar` happened to roll — and a
          chimera or a scaleborn is a good few percent larger than a human. The bound held for
          months and then read 1.49 against a 1.45 ceiling because an unrelated spawn upstream
          moved the race roll along. What is being checked is the fit, not the wielder. */
       const scl=new THREE.Vector3(); e.g.getWorldScale(scl);
       const sz=wb.getSize(new THREE.Vector3());
       const len=Math.max(sz.x/scl.x, sz.y/scl.y, sz.z/scl.z);
       R.rightLength = (len>0.85 && len<1.45)
         ? `and runs ${len.toFixed(2)} on a body of its own size, inside a nodachi's reach`
         : `!! THE SUNDERING EDGE IS ${len.toFixed(2)} LONG`;
     }
     const i0=chars.indexOf(u); if(i0>=0) chars.splice(i0,1);
   }
   /* ---------- HELD BY THE HANDLE ----------
      The failure this exists for: with the flip missing, the Sundering Edge is carried BY THE
      BLADE, handle swinging free at the far end. It still hangs below the fist, it is still
      the right length, and it still draws its own mesh — every other assertion here passed on
      that build. The only thing that separates the two is WHICH END is in the hand, so each
      weapon declares its grip in model coordinates and this checks that end is the near one. */
   {
     const born=[];
     const bad2=[];
     for(const k of keys){
       const F=WEPFIT[k];
       if(!F||!F.grip){ bad2.push(k+' DECLARES NO GRIP'); continue; }
       const u=makeChar('G','player',c.x+3,c.y+3,{atk:8,def:8,tough:8});
       u.weapon=k; u.state='ok'; chars.push(u); born.push(u);
       for(let i=0;i<40;i++) syncChars(0.05);
       const e=charMeshes.get(u.id);
       if(!e||!e.weapon){ bad2.push(k+' HAS NO MESH'); continue; }
       e.g.updateWorldMatrix(true,true);
       const fist=new THREE.Vector3(); e.elbR.getWorldPosition(fist); fist.y-=0.30;
       /* IN THE MODEL'S OWN BOX, not in world units — that makes the tolerance mean the same
          thing for a 1.45-scaled sword and a 0.80-scaled lance, and it is the frame the fit
          is actually written in. A weapon flipped end for end moves its grip most of the
          length of the model, so 0.12 separates "fitted" from "on backwards" with room to
          spare: the unflipped Sundering Edge lands 0.93 out. */
       const inv=new THREE.Matrix4().copy(e.weapon.matrixWorld).invert();
       const local=fist.clone().applyMatrix4(inv);
       const off=local.distanceTo(new THREE.Vector3(F.grip.x,F.grip.y,F.grip.z));
       if(off > 0.12) bad2.push(`${k}'s hand is ${off.toFixed(2)} from its declared grip`);
     }
     R.heldByTheHandle = bad2.length ? '!! '+bad2.join('; ')
       : 'each authored weapon has its grip in the fist and its business end away from it';
     for(const u of born){ const i=chars.indexOf(u); if(i>=0) chars.splice(i,1); }
   }
   return R;
 });
 console.log(JSON.stringify({swap, mid, saveLoad:round, end, authored, errs:errs.slice(0,8)},null,1));
 {
   const bad=Object.values(authored).map(String).filter(v=>v.startsWith('!!'));
   if(bad.length){ console.log('\n*** '+bad.join('\n*** ')); process.exitCode=1; }
   else console.log('\nTHE AUTHORED WEAPONS ARE IN HAND');
 }
 await b.close();})();
