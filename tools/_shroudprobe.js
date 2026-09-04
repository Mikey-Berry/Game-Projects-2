const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('file://' + path.join(__dirname,'game.html'), { waitUntil:'load' });
  await p.waitForSelector('#btn-start',{state:'attached',timeout:60000});
  await p.evaluate(()=>{document.getElementById('btn-start').click(); paused=true;});
  await p.waitForTimeout(2600);
  console.log(JSON.stringify(await p.evaluate(()=>{
    const t = towns.find(x=>!x.playerRuled && !x.def.undeadFriendly);
    const me = player()[0];
    me.gift='dark'; me.stats.magic=30; me.mana=100; me.castCd=0;
    const a = makeChar('R','player',t.x+2,t.y,{atk:5,def:5,tough:12});
    a.state='ok'; a.undead=true; a.lich=false; a.master=me; chars.push(a);
    me.x=t.x+2; me.y=t.y; castShroud(me, a);
    me.x=t.x+90; me.y=t.y+90;
    const hits=[];
    const orig = dropRep;
    window.dropRep = function(tt,n){
      if(tt===t) hits.push({ n, at: new Error().stack.split('\n').slice(1,4).map(s=>s.replace(/.*game\.html:/,'L').replace(/\).*/,'')).join(' <- ') });
      return orig.apply(this, arguments);
    };
    paused=false; for(let i=0;i<100;i++) update(0.1); paused=true;
    return { rep: t.rep, hits };
  }),null,1));
  await b.close();
})();
