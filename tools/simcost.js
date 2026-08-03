// Average sim-step cost over a long window, plus a phase breakdown.
const { chromium } = require('playwright'); const path=require('path');
const gamePath=(a)=>path.resolve(a?(path.isAbsolute(a)?a:path.join(__dirname,a)):path.join(__dirname,'game.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.DUSTWARD_CHROME || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox']});
 const p=await b.newPage({viewport:{width:1280,height:800}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,200)));
 await p.goto('file://'+gamePath(process.argv[2]),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.evaluate(()=>document.getElementById('btn-start').click());
 await p.waitForTimeout(2500);
 // time N update() calls directly, no rendering in the way
 const r = await p.evaluate(()=>{
   const N=240; update(SIM_DT);                       // warm
   const t=performance.now(); for(let i=0;i<N;i++) update(SIM_DT);
   const per=(performance.now()-t)/N;
   const sub=(f,n)=>{f();const t0=performance.now();for(let i=0;i<n;i++)f();return +((performance.now()-t0)/n).toFixed(3);};
   return {updateMs:+per.toFixed(3), chars:chars.length,
     alive:chars.filter(c=>c.state!=='dead').length,
     rebuildCharGrid:sub(rebuildCharGrid,200), separate:sub(separate,200),
     gridCells:charGrid.size,
     gridMax:(()=>{let m=0;for(const[,a]of charGrid)m=Math.max(m,a.length);return m;})(),
     gridSumSq:(()=>{let s=0;for(const[,a]of charGrid)s+=a.length*a.length;return s;})()};
 });
 // then a real 20s soak with the clock running fast
 await p.evaluate(()=>{window.speed=5;});
 await p.waitForTimeout(20000);
 const soak = await p.evaluate(()=>({fps:+fpsEMA.toFixed(1),simMs:+simMs.toFixed(2),
   renderMs:+renderMs.toFixed(2),day,hour:Math.round(hour),
   alive:chars.filter(c=>c.state!=='dead').length,calls:renderer.info.render.calls}));
 console.log(JSON.stringify({direct:r,soak20s:soak,errs:errs.slice(0,5)},null,1));
 await b.close();})();
