const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:900,height:600}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,200)));
 await p.goto('file://'+gamePath(process.argv[2]),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 console.log(process.argv[2]||'game.html', JSON.stringify(await p.evaluate(()=>{
   const mk=(f,o)=>{const c=makeChar('X',f,600,600,o); c.state='ok'; chars.push(c); return c;};
   // swings to put down a fresh defender, averaged
   const duel=(wep,armor,tough,n=40)=>{
     let sw=0, killed=0;
     for(let i=0;i<n;i++){
       const a=mk('player',{atk:20,blades:15,blunt:15}); a.weapon=wep; a.x=600;a.y=600;
       const d=mk('bandit',{tough}); d.armor=armor; d.x=600.6;d.y=600;
       let s=0;
       while(d.state!=='dead' && s<400){ a.atkCd=0; attack(a,d); s++; }
       sw+=s; if(d.state==='dead') killed++;
     }
     return {swings:+(sw/n).toFixed(1), killRate:killed/n};
   };
   return {
     'katana vs unarmoured':      duel('w_kat',null,8),
     'katana vs iron plate':      duel('w_kat','a_pla',24),
     'club vs iron plate':        duel('w_club','a_pla',24),
     'katana vs masterwork plate':duel('w_kat','a_pla_m',40),
     'club vs masterwork plate':  duel('w_club','a_pla_m',40),
     'nodachi vs carapace':       duel('w_nod','a_carap',60),
     'club vs carapace':          duel('w_club','a_carap',60),
   };
 })));
 console.log('errs:', errs.length, errs.slice(0,3));
 await b.close();})();
