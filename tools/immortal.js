// Walks both immortal roads stage by stage and checks favor survives the giver's death.
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
   const R={lines:{}};
   for(const kind of ['radiant','sigil']){
     const c = chars.find(x=>x.questGive===kind);
     if(!c){ R.lines[kind]='NPC MISSING'; continue; }
     const line = IMMORTAL_LINES[kind];
     const steps=[];
     for(let i=0;i<line.stages.length;i++){
       const st = line.stages[i];
       // a stage must NOT be satisfiable before its condition is met
       const before = stageMet(st);
       // satisfy it the way a player would
       if(st.kind==='fetch')   for(const k in (st.need||{})) stash[k]=(stash[k]||0)+st.need[k];
       if(st.kind==='visit'){  sawPlace(st.at); for(const k in (st.also||{})) stash[k]=(stash[k]||0)+st.also[k]; }
       if(st.kind==='slay'||st.kind==='destroy') bossSlain[st.boss]=day;
       const after = stageMet(st);
       // advance through the real UI path
       openImmortal(c);
       const btn=[...document.querySelectorAll('#modalbody button')].find(x=>/GIVE|STAY/.test(x.textContent));
       const track=document.querySelector('#modalbody div').textContent;
       if(btn && !btn.disabled) btn.click();
       steps.push({stage:i+1, kind:st.kind, gatedBefore:!before, metAfter:after,
         track, advancedTo:c.questStage});
     }
     R.lines[kind]={steps, questDone:!!c.questDone, favor:immortalFavor(kind),
       techOpen: Object.keys(TECHS).filter(k=>TECHS[k].needsQuest===kind)
                       .map(k=>({tech:k, researchable:immortalFavor(TECHS[k].needsQuest)}))};
   }
   // THE ORIGINAL BUG: favor must outlive the body
   const v = chars.find(x=>x.questGive==='radiant');
   v.state='dead'; v.deadAt=day+hour/24; corpses.push(v);
   const now=day+3;
   for(let i=corpses.length-1;i>=0;i--){ const q=corpses[i];
     if(now-(q.deadAt||0)>2){ corpses.splice(i,1); const ci=chars.indexOf(q); if(ci>=0) chars.splice(ci,1); } }
   R.afterSheDiesAndIsReaped = {inChars: chars.includes(v), favor: immortalFavor('radiant'),
     uncloudingResearchable: immortalFavor(TECHS.unclouding.needsQuest)};
   // and it must survive a save/load
   const s=snapshot(); const before={...favors};
   for(const k in favors) delete favors[k];
   restore(JSON.parse(JSON.stringify(s)));
   R.saveLoad = {favorsBefore:before, favorsAfter:{...favors},
     identical: JSON.stringify(before)===JSON.stringify(favors)};
   return R;
 }),null,1));
 console.log('errs:', errs.length, errs.slice(0,4));
 await b.close();})();
