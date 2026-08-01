const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs=[]; page.on('pageerror', e => errs.push(e.message.slice(0,220)));
  await page.goto('file://' + gamePath(process.argv[4]), { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.getElementById('btn-start').click());
  await page.waitForTimeout(800);
  const which = +(process.argv[3] || 0);
  const info = await page.evaluate((i) => {
    paused = true; syncPauseBtn(); hour = 8.5; debugSeeAll = true; fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log').forEach(e=>e.style.display='none');
    const t = towns[i];
    camX=camSX=t.x; camY=camSY=t.y; camDist=camDistTarget=62; camPitch=camPitchT=0.50; camYaw=camYawT=0.30;
    return { town: t.name, key: t.def.key };
  }, which);
  await page.waitForTimeout(3200);
  await page.evaluate(()=>{ camFollow=false; selected=[];
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip').forEach(e=>e.style.setProperty('display','none','important')); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: process.argv[2], clip:{x:110,y:120,width:1180,height:640} });
  console.log(info.town, info.key, 'errs:', errs.length, errs.slice(0,2));
  await browser.close();
})();
