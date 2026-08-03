// The Last Rite as a scene: it must take time, draw waves, be interruptible, and cost the
// offering either way.
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
   const setup=()=>{
     theRite=null;
     for(let i=chars.length-1;i>=0;i--) if(chars[i].riteborn) chars.splice(i,1);
     const c=player().find(x=>x.gift) || player()[0];
     c.gift='dark'; c.lich=false; c.undead=false; c.stats.magic=25; c.mana=999; c.state='ok';
     let sac=player().find(x=>x!==c && x.gift);
     if(!sac){ sac=makeChar('Offering','player',c.x+1,c.y,{magic:10}); sac.gift='divine'; chars.push(sac); }
     sac.state='ok';
     stash.remains=99; stash.crown=1;
     return {c,sac};
   };
   // --- 1. it must not resolve instantly ---
   {
     const {c,sac}=setup();
     beginAscension(c,sac);
     R.opensNotResolves={ riteOpen:!!theRite, ascendedImmediately:!!c.lich,
       ritualistRooted:!!c.riting, offeringStillPresent:chars.includes(sac) };
     // run it to completion, undisturbed
     let t=0, waves=[];
     while(theRite && t<200){ riteTick(0.5); t+=0.5;
       if(theRite && theRite.drawn>waves.length) waves.push({at:Math.round(theRite.work), drawn:theRite.drawn}); }
     R.undisturbed={ secondsOfWork:t, waves, ascended:!!c.lich,
       offeringConsumed:!chars.includes(sac),
       riteborn:chars.filter(x=>x.riteborn && x.state!=='dead').length };
   }
   // --- 2. driven off the circle: it collapses, and the offering is gone anyway ---
   {
     const {c,sac}=setup();
     beginAscension(c,sac);
     for(let i=0;i<20;i++) riteTick(0.5);
     const workAt=theRite?Math.round(theRite.work):0;
     c.x+=8; c.y+=8;                      // dragged off
     riteTick(0.5);
     R.drivenOff={ workReached:workAt, riteOpen:!!theRite, ascended:!!c.lich,
       offeringGone:!chars.includes(sac), ritualistFreed:!c.riting };
   }
   // --- 3. the offering is killed mid-rite ---
   {
     const {c,sac}=setup();
     beginAscension(c,sac);
     for(let i=0;i<10;i++) riteTick(0.5);
     sac.state='dead';
     riteTick(0.5);
     R.offeringKilled={ riteOpen:!!theRite, ascended:!!c.lich };
   }
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,4));
 await b.close();})();
