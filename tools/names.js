// How distinct are the names actually generated?
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
 console.log(JSON.stringify(await p.evaluate(()=>{
   /* only people the game named: townsfolk, your squad, leaders, recruits. Beasts, gaunts,
      crafted undead and generic roles are meant to share a label. */
   const named = chars.filter(c => c.name && !c.beast && !c.undead && c.faction !== 'gaunt' &&
     (c.civ || c.faction === 'player' || c.isLeader || c.homeTown));
   const counts={}; for(const c of named) counts[c.name]=(counts[c.name]||0)+1;
   const dupes=Object.entries(counts).filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]);
   const twoPart = named.filter(c=>c.name.trim().includes(' ')).length;
   // recruits are what you actually read in a hiring menu
   const recruits=[]; for(const t of towns) for(const r of (t.recruits||[])) recruits.push(r.name);
   return {
     namedPeople: named.length,
     distinctNames: Object.keys(counts).length,
     collisionRate: +((1 - Object.keys(counts).length/named.length)*100).toFixed(1)+'%',
     worstDuplicates: dupes.slice(0,5),
     twoPartShare: +((twoPart/named.length)*100).toFixed(0)+'%',
     leaders: towns.map(t=>t.leader && t.leader.name),
     sampleRecruits: recruits.slice(0,10),
     sampleTownsfolk: named.filter(c=>c.civ).slice(0,8).map(c=>c.name),
   };
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,3));
 await b.close();})();
