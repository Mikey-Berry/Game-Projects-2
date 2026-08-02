// One character, one weapon, close. node wep3.js <weaponKey> out.png [game.html]
const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:900,height:900},deviceScaleFactor:2});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,200)));
 await p.goto('file://'+gamePath(process.argv[4]),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(800);
 await p.evaluate((W)=>{
   paused=true; syncPauseBtn(); hour=11; debugSeeAll=true; fogPlane.visible=false;
   if(typeof syncDecorFogFull==='function') syncDecorFogFull();
   document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log').forEach(e=>e.style.display='none');
   const me=player()[0];
   // a spot with nothing within 5 tiles
   let spot=null;
   for(let r=40;r<200&&!spot;r+=4) for(let a=0;a<20&&!spot;a++){
     const x=me.x+Math.cos(a/20*6.283)*r, y=me.y+Math.sin(a/20*6.283)*r;
     let ok=true;
     for(let dy=-5;dy<=5&&ok;dy++) for(let dx=-5;dx<=5&&ok;dx++){
       const ix=Math.floor(x)+dx, iy=Math.floor(y)+dy;
       if(isBlocked(ix+0.5,iy+0.5,0)||terr[iy*self.W+ix]===3||decorAt(ix,iy)) ok=false;
     }
     if(ok) spot={x,y};
   }
   chars.length=0; charMeshes.forEach(e=>{if(e.g&&e.g.parent)e.g.parent.remove(e.g);}); charMeshes.clear();
   const c=makeChar('X','player',spot.x,spot.y,{atk:10,def:10,tough:10,ath:6,weapon:W,armor:'a_lea'});
   c.dir=0; chars.push(c); window.__c=c;
   camX=camSX=spot.x; camY=camSY=spot.y+0.4; camDist=camDistTarget=4.4;
   camPitch=camPitchT=0.06; camYaw=camYawT=0.55; camFollow=false; selected=[];
 }, process.argv[2]);
 await p.waitForTimeout(3500);
 await p.evaluate(()=>{ const e=charMeshes.get(window.__c.id); if(e){e.rotY=0;e.g.rotation.set(0,0,0);}
   document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip').forEach(e=>e.style.setProperty('display','none','important')); });
 await p.waitForTimeout(800);
 const bx=await p.evaluate(()=>{const c=window.__c;
   return {t:w2s(c.x,c.y,groundY(c.x,c.y)+2.4), b:w2s(c.x,c.y,groundY(c.x,c.y)-0.4)};});
 await p.screenshot({path:process.argv[3],clip:{x:Math.max(0,bx.t.x-200),y:Math.max(0,bx.t.y-25),
   width:400,height:Math.min(880,bx.b.y-bx.t.y+50)}});
 console.log(process.argv[2],'errs:',errs.length,errs.slice(0,2));
 await b.close();})();
