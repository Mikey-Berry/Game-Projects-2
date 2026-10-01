#!/usr/bin/env node
/* ASKING A SCHOLAR AFTER THE OLD MASTERS.
 *
 * "Perhaps there can be a separate 'question' to ask for the old masters when speaking with
 *  scholars, as they would likely at least know a general direction. (This is one case where
 *  there should NOT be a bright quest marker, and general 'west/east of this town, X days' is
 *  the ideal balance.) Only those gifted/trained in a certain art can ask this question and
 *  begin that questline."
 *
 *   1. nobody carrying an art beside the scholar: no question on the window
 *   2. a Divine-gifted body beside them: the question is there, and asking it names a town, a
 *      heading that is the true one from that town to the Unclouded, and a number of days —
 *      and opens a journal line with NO mark, so the journal does not keep a live bearing
 *   3. trained, not born: an initiate of the Dark with no gift can ask after the Demilich
 *   4. the dust has no master, and says so without opening anything
 *   5. a master already dead is reported dead, and opens nothing
 *   6. walking in on the master moves the journal line to the master's own first stage, and
 *      meeting one nobody asked about opens the line anyway
 *   7. killing the master closes the line
 *   8. the days are sized for walking: a day's march is a day, three are three
 *
 * AND ASKING AFTER A QUARRY. "When a quest prompts you to track down/kill a certain NPC, that
 * should open up as a dialogue question to relevant NPCs."
 *
 *   9. no quest asking for anybody: a Paladin has no quarry to be asked about
 *  10. Verity at Sister Ash: a Paladin and somebody from Saltmere both have the question, somebody
 *      from Greenrest does not; the answer names a town and days, and Verity's journal line
 *      gets it under the stage's own words
 *  11. the Sigil-Bound at the Sixfold: a town's watch has it, and so does a scholar's window
 *  12. the Lord of Ash and Bone (once the Ossuary King), asked for by two givers at once: a necromancer and somebody from
 *      Hollowmere have it and the answer lands in both journal lines; with a crown already in
 *      the stores the Demilich is not asking any more
 *  13. the quarry down: the question is gone
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/masters.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    paused = true;
    const L = [];
    const bad = (m) => L.push('!! ' + m);
    const ok = (m) => L.push('   ' + m);
    const me = player()[0];
    const rest = player().slice(1);
    const sc = chars.find(c => c.scholar && c.state === 'ok');
    if(!sc){ bad('no scholar in the world'); return L; }
    /* everybody else well out of earshot, so only `me` is standing at the scholar */
    for(const u of rest){ u.x = me.x + 40; u.y = me.y + 40; }
    sc.x = me.x + 1.2; sc.y = me.y;
    const plain = (u) => { u.gift = null; u.giftTwo = null; u.att = {divine:0, destruction:0, dark:0, dust:0}; };
    const rows = () => [...document.querySelectorAll('#modalbody button')].filter(x => /OLD MASTER/.test(x.textContent));
    const rowText = () => [...document.querySelectorAll('#modalbody .trow')].map(r => r.textContent).filter(t => /old master/.test(t));
    const lastLog = () => chronicle[chronicle.length - 1].m;
    const close = () => { $('modal').style.display = 'none'; modalOpen = false; };
    const town = () => towns.filter(t2 => t2.stock).sort((a, b) => dist(a.x, a.y, sc.x, sc.y) - dist(b.x, b.y, sc.x, sc.y))[0];

    /* 1 */
    plain(me);
    openScholar(sc, me);
    if(rows().length) bad(`1. an ungifted body is offered the question (${rows().length} rows)`);
    else ok('1. nobody carrying an art: no question');
    close();

    /* 2 */
    me.gift = 'divine'; me.att.divine = 2;
    openScholar(sc, me);
    const r2 = rows();
    if(r2.length !== 1) bad(`2. a Divine-gifted body sees ${r2.length} old-master rows (want 1): ${rowText().join(' | ')}`);
    else {
      r2[0].click();
      const said = chronicle[chronicle.length - 2].m;      /* the scholar, then the journal line */
      const ver = chars.find(c => c.bossKey === 'radiant');
      const t = town();
      const head = compassFrom(t.x, t.y, ver.x, ver.y);
      const th = threadOf('master_radiant');
      if(!said.toLowerCase().includes(`${head} of ${t.name}`.toLowerCase())) bad(`2. the heading is not "${head} of ${t.name}": ${said}`);
      else if(!/on foot/.test(said)) bad(`2. no days in the answer: ${said}`);
      else ok(`2. asked: ${said}`);
      if(!th) bad('2. no journal line opened');
      else if(th.mark) bad('2. the journal line carries a mark, so the journal would keep a live bearing');
      else if(!th.step.includes(t.name)) bad(`2. the journal line does not say what was said: ${th.step}`);
      else ok(`2. journal: ${th.title.toUpperCase()} — ${th.step}`);
    }
    close();

    /* 3 */
    plain(me); me.att.dark = 1;
    openScholar(sc, me);
    const r3 = rowText();
    if(r3.length !== 1 || !/the Dark/.test(r3[0])) bad(`3. an initiate of the Dark is not offered the Dark's question: ${r3.join(' | ')}`);
    else {
      rows()[0].click();
      if(!threadOf('master_demilich')) bad('3. asking after the Demilich opened no line');
      else ok(`3. trained, not born: ${threadOf('master_demilich').step}`);
    }
    close();

    /* 4 */
    plain(me); me.gift = 'dust'; me.att.dust = 2;
    const n4 = threads.length;
    openScholar(sc, me);
    const r4 = rows();
    if(r4.length !== 1) bad(`4. a dust-gifted body sees ${r4.length} rows`);
    else {
      r4[0].click();
      if(threads.length !== n4) bad('4. the dust opened a journal line');
      else if(!/Nobody masters the dust/.test(lastLog())) bad(`4. the dust answer: ${lastLog()}`);
      else ok('4. the dust has no master, and nothing opens');
    }
    close();

    /* 5 */
    plain(me); me.gift = 'destruction'; me.att.destruction = 2;
    const sig = chars.find(c => c.bossKey === 'sigil');
    const was = bossSlain.sigil;
    bossSlain.sigil = day;
    openScholar(sc, me);
    rows()[0].click();
    if(threadOf('master_sigil')) bad('5. a dead master opened a line');
    else if(!/Gone/.test(lastLog())) bad(`5. a dead master is not reported dead: ${lastLog()}`);
    else ok('5. a dead master: "' + lastLog().slice(0, 60) + '..."');
    close();
    if(was) bossSlain.sigil = was; else delete bossSlain.sigil;

    /* 6 */
    const ver = chars.find(c => c.bossKey === 'radiant');
    openImmortal(ver);
    const t6 = threadOf('master_radiant');
    const want = IMMORTAL_LINES.radiant.stages[ver.questStage || 0].hint;
    if(!t6 || t6.step !== want) bad(`6. meeting Verity left the line at "${t6 && t6.step}" (want "${want}")`);
    else ok(`6. met: ${t6.step}`);
    close();
    if(threadOf('master_sigil')) bad('6. the Sigil-Bound had a line before anybody met him');
    openImmortal(sig);
    if(!threadOf('master_sigil')) bad('6. meeting the Sigil-Bound unasked opened no line');
    else ok(`6. met unasked: ${threadOf('master_sigil').step}`);
    close();

    /* 7 */
    kill(ver);
    const t7 = threadOf('master_radiant');
    if(!t7 || !t7.done) bad('7. killing Verity left her line open');
    else ok(`7. killed: ${t7.step}`);

    /* 8 */
    const day1 = 3.4 * HOUR_SEC * 12;
    const words = [[day1 * 0.2, 'less than a day'], [day1 * 0.6, 'half a day'], [day1, 'a day on foot'],
                   [day1 * 1.5, 'a day and a half'], [day1 * 3, 'three days']];
    const miss = words.filter(([d, w]) => !marchDays(d).startsWith(w));
    if(miss.length) bad('8. days: ' + miss.map(([d, w]) => `${Math.round(d)} tiles reads "${marchDays(d)}", want "${w}"`).join('; '));
    else ok(`8. a day's march is ${Math.round(day1)} tiles; ` + words.map(([d]) => `${Math.round(d)} → ${marchDays(d)}`).join(', '));
    /* and what that means on the map as built: nearest town to each master */
    for(const k of ['radiant', 'sigil', 'demilich']){
      const c = chars.find(x => x.bossKey === k); if(!c) continue;
      const t = towns.filter(t2 => t2.stock).sort((a, b) => dist(a.x, a.y, c.x, c.y) - dist(b.x, b.y, c.x, c.y))[0];
      const s = towns.filter(t2 => t2.stock).map(t2 => marchDays(dist(t2.x, t2.y, c.x, c.y)).replace(' on foot', ''));
      ok(`   ${k}: nearest town ${t.name} (${marchDays(dist(t.x, t.y, c.x, c.y))}); from every town: ${s.join(', ')}`);
    }

    /* ---------- quarries ---------- */
    const opts = () => [...document.querySelectorAll('#modalbody button')].map(x => x.textContent);
    const talkRoot = (t, key) => { closeTalk(); openDiscourse(t, key); return opts(); };
    const liveOf = (k) => chars.find(c => c.bossKey === k && c.state !== 'dead');
    const home = (k) => chars.find(c => c.faction === 'town' && !isWatch(c) && c.state === 'ok' && c.homeTown && c.homeTown.def.key === k && !(c.isLeader >= 0) && !c.coil && !c.vt && !c.wanderKey && speaksAtAll(c));
    const pal = chars.find(c => c.faction === 'purge' && c.state === 'ok');
    const salt = home('saltmere'), green = home('greenrest'), hollow = home('hollowmere');
    const watch = chars.find(c => isWatch(c) && c.state === 'ok');
    const necro = chars.find(c => c.npcNecro && c.state === 'ok');
    if(!pal || !salt || !green || !hollow || !watch || !necro) bad(`quarry cast missing: pal ${!!pal} salt ${!!salt} green ${!!green} hollow ${!!hollow} watch ${!!watch} necro ${!!necro}`);
    const V = chars.find(c => c.bossKey === 'radiant');
    const G = chars.find(c => c.bossKey === 'sigil');
    const D = chars.find(c => c.bossKey === 'demilich');
    /* bring Verity back for these: she was killed in 7 */
    V.state = 'ok'; V.blood = V.maxBlood; delete bossSlain.radiant;
    V.questStage = 0; G.questStage = 0; D.questStage = 0; V.questDone = G.questDone = D.questDone = false;
    const stageOf = (line, kind, boss) => IMMORTAL_LINES[line].stages.findIndex(st => st.kind === kind && (!boss || st.boss === boss || (st.need && st.need.crown)));

    /* 9 */
    if(talkRoot(pal, 'purge').some(x => /Sister Ash/.test(x))) bad('9. a Paladin offers Sister Ash with no quest asking');
    else ok('9. nobody asked for: no quarry on the Paladin');

    /* 10 */
    V.questStage = stageOf('radiant', 'slay', 'ash');
    const pAsh = talkRoot(pal, 'purge').some(x => /Sister Ash/.test(x));
    const sAsh = talkRoot(salt, 'town').some(x => /Sister Ash/.test(x));
    const gAsh = talkRoot(green, 'town').some(x => /Sister Ash/.test(x));
    if(!pAsh || !sAsh || gAsh) bad(`10. Sister Ash offered: Paladin ${pAsh}, Saltmere ${sAsh}, Greenrest ${gAsh} (want true, true, false)`);
    else {
      talkRoot(salt, 'town');
      [...document.querySelectorAll('#modalbody button')].find(x => /Sister Ash/.test(x.textContent)).click();
      const said = document.querySelector('#modalbody div').textContent;
      const th = threadOf('master_radiant');
      const hint = IMMORTAL_LINES.radiant.stages[V.questStage].hint;
      if(!/on foot/.test(said)) bad(`10. the Saltmere answer has no days: ${said}`);
      else ok(`10. ${salt.name} of Saltmere: ${said}`);
      if(!th || !th.step.startsWith(hint) || !th.step.includes(salt.name)) bad(`10. Verity's line: ${th && th.step}`);
      else ok(`10. journal: ${th.step}`);
      /* and the answer's heading is the true one from the town it names */
      const ash = liveOf('ash');
      const m = said.match(/(north|south|east|west|northeast|northwest|southeast|southwest) of ([A-Z]+),/);
      if(!m) bad('10. no "<heading> of <TOWN>," in the answer');
      else {
        const tw = towns.find(t2 => t2.name === m[2]);
        const truth = compassFrom(tw.x, tw.y, ash.x, ash.y);
        if(truth !== m[1]) bad(`10. said ${m[1]} of ${m[2]}, truth ${truth}`);
      }
    }
    closeTalk();

    /* 11 */
    G.questStage = stageOf('sigil', 'destroy', 'sixfold');
    const wSix = talkRoot(watch, 'guard').some(x => /six legs/i.test(x));
    closeTalk();
    const scN = chronicle.length;
    plain(me);
    openScholar(sc, me);
    const sRow = [...document.querySelectorAll('#modalbody .trow')].find(r => /six legs/i.test(r.textContent));
    if(!wSix || !sRow) bad(`11. the Sixfold offered: watch ${wSix}, scholar ${!!sRow}`);
    else {
      sRow.querySelector('button').click();
      const said = chronicle.slice(scN).map(e => e.m).find(m2 => m2.startsWith(sc.name + ':')) || '';
      if(!liveOf('sixfold')) ok('11. no Sixfold in this world yet: ' + said);
      else if(!/on foot/.test(said)) bad(`11. the scholar's answer has no days: ${said}`);
      else ok(`11. ${said}`);
    }
    close();

    /* 12 */
    G.questStage = stageOf('sigil', 'slay', 'king');
    D.questStage = IMMORTAL_LINES.dark.stages.findIndex(st => st.need && st.need.crown);
    const nK = talkRoot(necro, 'necro').some(x => /dead lord/.test(x));
    const hK = talkRoot(hollow, 'town').some(x => /dead lord/.test(x));
    if(!nK || !hK) bad(`12. the Lord of Ash and Bone offered: necromancer ${nK}, Hollowmere ${hK}`);
    else {
      talkRoot(necro, 'necro');
      [...document.querySelectorAll('#modalbody button')].find(x => /dead lord/.test(x.textContent)).click();
      const both = ['master_sigil', 'master_demilich'].map(k => threadOf(k)).filter(t => t && t.step.includes(necro.name));
      if(both.length !== 2) bad(`12. the answer reached ${both.length} of the two givers' lines`);
      else ok(`12. both lines: ${both.map(t => t.title + ' — ' + t.step).join(' | ')}`);
      const givers = (huntsOpen().get('king') || []).length;
      stash.crown = (stash.crown || 0) + 1;
      const after = (huntsOpen().get('king') || []).map(h => h.g.bossKey);
      stash.crown--;
      if(givers !== 2 || after.join() !== 'sigil') bad(`12. givers ${givers}, with a crown in the stores: ${after.join()} (want sigil)`);
      else ok('12. a crown in the stores: only the Sigil-Bound is still asking');
    }
    closeTalk();

    /* 13 */
    kill(liveOf('ash'));
    if(talkRoot(pal, 'purge').some(x => /Sister Ash/.test(x))) bad('13. Sister Ash still asked after with her dead');
    else ok('13. Sister Ash down: the question is gone');
    closeTalk();
    return L;
  });
  for(const l of out) console.log(l);
  for(const e of errs) console.log('!! ' + e);
  const failed = out.some(l => l.startsWith('!!')) || errs.length;
  console.log(failed ? 'FAIL' : 'PASS');
  await b.close();
  process.exit(failed ? 1 : 0);
})();
