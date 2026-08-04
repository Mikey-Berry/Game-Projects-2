// How long does a corpse actually last, and how many are available to an early necromancer?
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
   const R={};
   R.timing = {
     hourSeconds: HOUR_SEC,
     gameDayInRealSeconds: HOUR_SEC*24,
     corpseLifeDays: {others:2, yours:4},
     corpseLifeRealMinutes_at1x: {others:+(HOUR_SEC*24*2/60).toFixed(1), yours:+(HOUR_SEC*24*4/60).toFixed(1)},
     corpseLifeRealMinutes_at5x: {others:+(HOUR_SEC*24*2/60/5).toFixed(1), yours:+(HOUR_SEC*24*4/60/5).toFixed(1)},
   };
   // who else wants the bodies?
   R.competition = {
     corpseEatersAlive: chars.filter(c=>c.eatsDead && c.state!=='dead').length,
     scavengingBeasts: chars.filter(c=>(c.eater||(c.faction==='wild'&&c.beast)) && c.state!=='dead').length,
   };
   // what a corpse is worth, and what it costs to use one
   R.economy = {
     raiseSpellCost: SPELLS.raise.cost,
     raiseNeedsCorpse: true,
     remainsFromHarvest: '1-2 (destroys the corpse)',
     remainsFromLootingARisen: 'up to 3 + a chance of Quickened Flesh',
     cheapestBinding: Object.entries(UNDEAD_TYPES).map(([k,u])=>({k, remains:u.cost.remains||0, mana:u.mana}))
       .sort((a,b)=>a.remains-b.remains)[0],
     bindingCostsInRemains: Object.fromEntries(Object.entries(UNDEAD_TYPES).map(([k,u])=>[k, u.cost.remains||0])),
   };
   // how many bodies exist right now, and how fast does the world make more?
   R.supplyNow = { corpsesOnTheGround: corpses.length, livingInWorld: chars.filter(c=>c.state!=='dead').length };
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,3));
 await b.close();})();
