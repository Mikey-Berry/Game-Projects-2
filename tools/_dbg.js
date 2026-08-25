const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  p.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0,300)));
  await p.goto('file:///home/user/Game-Projects-2/tools/game.html', { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);
  const out = await p.evaluate(() => {
    paused = true;
    const born=[];
    const mk=(f,o,x,y)=>{const c=makeChar('P',f,x,y,Object.assign({race:'human',sub:'dustborn'},o));c.state='ok';chars.push(c);born.push(c);return c;};
    const ward=mk('player',{atk:10,def:12,tough:12,ath:8},600,600); ward.blood=ward.maxBlood=1e6;
    const g=mk('player',{atk:14,def:20,tough:16,ath:12},600.9,601.4); g.blood=g.maxBlood=1e6;
    g.guardTarget=ward; g.job='guard';
    const foe=mk('bandit',{atk:16,def:12,tough:12,ath:8},601.8,602.6);
    // what does interposer say, called directly?
    let picked=0; const N=2000;
    for(let i=0;i<N;i++){ if(interposer(foe, ward)) picked++; }
    // and geometry
    const ax=foe.x-ward.x, ay=foe.y-ward.y, gx=g.x-ward.x, gy=g.y-ward.y;
    const la=Math.hypot(ax,ay), lg=Math.hypot(gx,gy);
    const face=(ax*gx+ay*gy)/(la*lg);
    const bs=face+g.stats.def*0.01;
    const odds=Math.min(0.55, 0.20+g.stats.def*0.006+g.stats.ath*0.004)*(bs>0.6?1:0.6);
    // now the full path: how often does the guard actually lose hp
    const tot=c=>c.blood+Object.values(c.parts).reduce((s,q)=>s+q.hp,0);
    const wasG=tot(g), wasW=tot(ward);
    let caught=0, resolved=0, S=2000;
    let picks=0, gates={};
    const realInt = interposer;
    window.interposer = (a2,d2) => { const r = realInt(a2,d2); if(r) picks++; return r; };
    // and why the gate might fail, sampled at the top of each swing
    const why = () => {
      if(shieldDepth>0) return 'shieldDepth';
      if(!(ward.faction==='player'||ward.vip)) return 'notPlayer';
      if(foe.guardTarget===ward) return 'selfGuard';
      if(g.job!=='guard') return 'job';
      if(g.state!=='ok') return 'state:'+g.state;
      if(g.faction!==ward.faction) return 'faction';
      if(g.staggerT>0) return 'staggerT';
      if(g.heldAt) return 'heldAt';
      if(g.jailedAt) return 'jailed';
      if(g.captured) return 'captured';
      if(carried(g)) return 'carried';
      if(dist(g.x,g.y,ward.x,ward.y)>GUARD_STEP) return 'tooFar:'+dist(g.x,g.y,ward.x,ward.y).toFixed(2);
      return 'ok';
    };
    for(let i=0;i<S;i++){
      foe.swingT=0; foe.staggerT=0; foe.cool=0;
      /* PIN THE THREE OF THEM. A caught blow knocks the guard back, and nothing here puts it
         back, so after a few dozen swings it has drifted out of GUARD_STEP and every
         subsequent swing is a body standing 56 tiles away being asked to block. */
      ward.x=600; ward.y=600; g.x=600.9; g.y=601.4; foe.x=601.8; foe.y=602.6;
      for(const c of [ward,g,foe]){ c.vx=0; c.vy=0; c.lungeT=0; c.knockT=0; }
      /* AND RE-ESTABLISH THE ORDER. A vital part failing kills a body whatever its blood is,
         and `kill` runs `releaseTargets`, which clears `guardTarget` on everyone pointing at
         the corpse — so one unlucky swing ends interposition for the whole rest of the run. */
      g.job='guard'; g.guardTarget=ward; g.state='ok'; ward.state='ok';
      for(const k of PARTS){ g.parts[k].hp=g.parts[k].max; ward.parts[k].hp=ward.parts[k].max; }
      const w2 = why(); gates[w2]=(gates[w2]||0)+1;
      const b4=tot(g), w4=tot(ward);
      attack(foe, ward);
      if(tot(g)<b4) caught++;
      if(tot(g)<b4 || tot(ward)<w4) resolved++;
      for(const k of PARTS){ g.parts[k].hp=g.parts[k].max; g.parts[k].bleed=0; ward.parts[k].hp=ward.parts[k].max; ward.parts[k].bleed=0; }
      g.blood=1e6; ward.blood=1e6; g.staggerT=0; ward.staggerT=0; g.state='ok'; ward.state='ok';
    }
    // hit chance of the foe against each
    window.interposer = realInt;
    let picked2=0; for(let i=0;i<2000;i++){ ward.x=600;ward.y=600;g.x=600.9;g.y=601.4;foe.x=601.8;foe.y=602.6; if(realInt(foe,ward)) picked2++; }
    const statsAfter = {def:g.stats.def, ath:g.stats.ath, shieldDepth};
    return { face:+face.toFixed(3), bs:+bs.toFixed(3), oddsFormula:+odds.toFixed(3),
             pickRateAfterLoop:+(picked2/2000).toFixed(3), statsAfter,
             interposerPickRate:+(picked/N).toFixed(3),
             guardDist:+Math.hypot(gx,gy).toFixed(2), GUARD_STEP,
             hcVsWard:+hitChance(foe,ward).toFixed(3), hcVsGuard:+hitChance(foe,g).toFixed(3),
             caught, resolved, S, caughtPctOfResolved: Math.round(100*caught/Math.max(1,resolved)),
             interposerPicksDuringAttacks: picks, gateReasons: gates,
             pickRateDuringAttacks: +(picks/S).toFixed(3) };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
