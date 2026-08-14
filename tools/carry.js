#!/usr/bin/env node
/* CARRYING A WORLD FROM ONE DEVICE TO ANOTHER.
 *
 * There is no server behind this game, so a save crosses between machines by hand: as a text
 * code you paste, or as a file. The thing that makes this testable at all is that the code is
 * not a new format — `packSaveText` already produces exactly what goes into browser storage,
 * so what is under test here is the CARRYING, not the packing.
 *
 * Two browser CONTEXTS, not two tabs. The whole claim is that the second machine has none of
 * the first one's storage, and a test that shares a profile would pass while proving nothing.
 *
 * It also drives the trip the text actually takes. A code that goes through a mail client and
 * a notes app comes back wrapped at 76 columns, indented, and sometimes in quotes — none of
 * which is corruption, all of which breaks `atob` if nobody strips it.
 *
 *   node tools/carry.js [game.html]
 */
const { chromium } = require('playwright'); const path=require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const GAME = 'file://' + gamePath(process.argv[2]);
(async()=>{
  const b=await chromium.launch({executablePath:process.env.DUSTWARD_CHROME,
    args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
  const R={};
  /* the panel packs asynchronously, so wait for the box to hold a real code rather than
     sleeping and hoping — under SwiftShader with two browser profiles open, a fixed 2s is a
     coin toss and the failure looks exactly like a broken feature */
  const openPanel = async (pg) => {
    await pg.evaluate(()=>document.getElementById('btn-move').click());
    await pg.waitForFunction(() => {
      const a = document.querySelectorAll('#modalbody textarea');
      return a.length === 2 && a[0].value && a[0].value !== 'packing…';
    }, null, { timeout: 30000 });
  };
  const start = async (ctx) => {
    const p = await ctx.newPage({viewport:{width:900,height:700}});
    p.on('pageerror',e=>console.log('ERR '+e.message.slice(0,200)));
    await p.goto(GAME,{waitUntil:'load'});
    await p.waitForTimeout(2500);
    await p.evaluate(()=>document.getElementById('btn-start').click());
    await p.waitForTimeout(2500);
    return p;
  };

  /* ---- the desktop: play a while, then open MOVE and read the code out of the box ---- */
  const desk = await b.newContext();
  const d = await start(desk);
  const before = await d.evaluate(()=>{
    for(let i=0;i<900;i++) update(0.25);
    const me = player()[0];
    me.name = 'Marker Of The Run';
    return { day, chars: chars.length, x:+me.x.toFixed(2), y:+me.y.toFixed(2), cats, name: me.name };
  });
  await openPanel(d);
  const code = await d.evaluate(()=>{
    const t = document.querySelector('#modalbody textarea');
    return t ? t.value : null;
  });
  R.codeMade = code && code.startsWith('DWZ1:') ? `${Math.round(code.length/1024)} KB of text, tagged DWZ1` : '!! NO CODE IN THE BOX';
  R.notPlaceholder = code && code !== 'packing…' ? 'and it is the save, not the placeholder' : '!! THE BOX STILL SAYS packing';

  /* ---- the phone: a browser with no storage of its own, and the code arrives mangled ---- */
  const phone = await b.newContext();
  const q = await start(phone);
  R.freshDevice = await q.evaluate(()=>{
    let v=null; try{ v = localStorage.getItem('dustward_save'); }catch(e){}
    return v ? '!! THE SECOND DEVICE ALREADY HAD A SAVE' : 'the second device starts with nothing';
  });
  /* what a trip through mail and a notes app actually does to it */
  const mangled = '"' + code.replace(/(.{76})/g, '$1\n').replace(/^/, '  ') + '"  \n';
  await openPanel(q);
  await q.evaluate((t)=>{
    const areas = document.querySelectorAll('#modalbody textarea');
    areas[1].value = t;
  }, mangled);
  await q.evaluate(()=>{
    const btns=[...document.querySelectorAll('#modalbody button')];
    btns.find(x=>x.textContent.indexOf('PASTE')===0).click();
  });
  /* WAIT FOR THE OUTCOME, not for three seconds. Taking a code in is asynchronous — it
     gunzips 56 KB and parses 1.7 MB of JSON — and under a full suite run, with several
     browsers competing for one CPU and no GPU at all, that is sometimes slower than the sleep
     this used to have. The failure looked exactly like a broken feature: the world had not
     arrived, because it had not finished arriving. Poll for the modal closing, which is the
     thing that means it worked, and give the refusal path a way to end the wait too. */
  await q.waitForFunction(() => {
    if (document.getElementById('modal').style.display === 'none') return true;
    const d = [...document.querySelectorAll('#modalbody div')].map(x => x.textContent).join(' ');
    return /not a Dustward save|Nothing pasted/i.test(d);
  }, null, { timeout: 60000 }).catch(() => {});
  await q.waitForTimeout(400);
  const after = await q.evaluate(()=>{
    const me = chars.find(c=>c.name==='Marker Of The Run');
    return { day, chars: chars.length, cats,
             x: me?+me.x.toFixed(2):null, y: me?+me.y.toFixed(2):null, name: me?me.name:null,
             overlay: document.getElementById('startoverlay').style.display,
             modal: document.getElementById('modal').style.display };
  });
  R.arrived = (after.name === before.name && after.day === before.day && after.chars === before.chars
               && after.x === before.x && after.y === before.y && after.cats === before.cats)
    ? `day ${after.day}, ${after.chars} bodies, the same person on the same tile with the same purse`
    : `!! THE WORLD DID NOT SURVIVE THE TRIP: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`;
  R.survivesMangling = R.arrived.startsWith('!!') ? '!! (see above)' : 'through line wrapping, indentation and quotes';
  R.playable = (after.overlay === 'none' && after.modal === 'none')
    ? 'and it drops you straight into it' : `!! STILL BEHIND AN OVERLAY (start=${after.overlay} modal=${after.modal})`;

  /* ---- rubbish in ---- */
  await openPanel(q);
  R.refusesRubbish = await q.evaluate(async ()=>{
    const areas=[...document.querySelectorAll('#modalbody textarea')];
    areas[1].value = 'hello, this is not a save';
    const btns=[...document.querySelectorAll('#modalbody button')];
    btns.find(x=>x.textContent.indexOf('PASTE')===0).click();
    await new Promise(r=>setTimeout(r,900));
    const still = document.getElementById('modal').style.display !== 'none';
    const said = document.querySelector('#modalbody div:last-child');
    return (still && said && /not a Dustward save/i.test(said.textContent))
      ? 'and says so plainly when the paste is not a save'
      : '!! RUBBISH WAS ACCEPTED OR FAILED SILENTLY';
  });
  /* ---- and it has to be usable on the device you are carrying it TO ----
     The two contexts above are closed first: three of them, each holding a 1.6 MB document and
     a SwiftShader context, times out the third navigation on a machine with no GPU. */
  await desk.close(); await phone.close();
  {
    const ph = await b.newContext({ viewport:{width:393,height:727}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
      userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' });
    const m = await ph.newPage();
    m.on('pageerror',e=>console.log('ERR '+e.message.slice(0,200)));
    await m.goto(GAME,{waitUntil:'load', timeout:90000});
    await m.waitForTimeout(2500);
    await m.evaluate(()=>document.getElementById('btn-start').click());
    await m.waitForTimeout(3000);
    /* reachable the way a phone user reaches it: the gear, not a topbar button that is hidden */
    await m.evaluate(()=>document.getElementById('tb-menu').click());
    await m.waitForTimeout(500);
    const found = await m.evaluate(()=>{
      const b2=[...document.querySelectorAll('#ctxmenu button')].find(x=>/MOVE/.test(x.textContent));
      if(b2){ b2.click(); return true; } return false;
    });
    R.onThePhone = found ? 'the gear menu offers it' : '!! NO WAY TO REACH IT ON A PHONE';
    if(found){
      await m.waitForFunction(()=>{ const a2=document.querySelectorAll('#modalbody textarea');
        return a2.length===2 && a2[0].value && a2[0].value!=='packing…'; }, null, {timeout:30000});
      const fit = await m.evaluate(()=>{
        const r=document.getElementById('modal').getBoundingClientRect();
        const btns=[...document.querySelectorAll('#modalbody button')];
        const small=btns.filter(x=>{const q=x.getBoundingClientRect(); return Math.min(q.width,q.height)<44;});
        const tb=document.getElementById('touchbar');
        const covered = tb && getComputedStyle(tb).display !== 'none';
        return { over: r.right>innerWidth+1||r.left<-1, small:small.length, covered,
                 closeVisible: (()=>{ const c=document.getElementById('modalclose');
                   if(!c) return false; const q=c.getBoundingClientRect();
                   return q.right<=innerWidth+1 && q.bottom<=innerHeight+1 && q.width>0; })() };
      });
      R.fitsThePhone = !fit.over ? 'and the panel fits the screen' : '!! THE PANEL RUNS OFF THE SCREEN';
      R.tappable = fit.small===0 ? 'with every button at 44px or better' : `!! ${fit.small} BUTTONS UNDER 44px`;
      R.nothingOnTop = !fit.covered ? 'and the touch controls get out from on top of it'
        : '!! THE TOUCH CONTROLS ARE STILL COVERING THE PANEL';
      R.closeReachable = fit.closeVisible ? 'and CLOSE is where you can hit it' : '!! CLOSE IS OFF-SCREEN OR COVERED';
    }
  }

  for(const [k,v] of Object.entries(R)) console.log('  '+k.padEnd(18)+v);
  const bad = Object.values(R).map(String).filter(v=>v.startsWith('!!'));
  console.log('\n'+(bad.length?'*** '+bad.join('\n*** '):'A WORLD CROSSES DEVICES'));
  await b.close();
  if(bad.length) process.exitCode = 1;
})();
