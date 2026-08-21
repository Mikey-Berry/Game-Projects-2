#!/usr/bin/env node
/* WHAT A RIGHT-CLICK OFFERS ON SOMEBODY WHO IS NOT YOUR ENEMY, AND ON ONE ON THE GROUND.
 *
 * Three reports that turned out to be the same surface:
 *   · "There is no option to talk to Lyre. I right click her and it simply says she is not
 *      hostile and I can ctrl+right-click to attack anyway. Pretty disappointing end to a long
 *      quest."
 *   · "Bandaging works when it's a neutral faction, but not for enemies. I would prefer the
 *      bandage option to be under the right-click menu, along with execute, pick up, etc."
 *   · "You said that I could right click to organize individual units in the squad, but that is
 *      currently impossible. Right-clicking unit tabs does nothing."
 *
 * NONE OF THE THREE WAS A MISSING FEATURE. Lyre's conversation is written and long — `talkTo`
 * carries five different answers for her depending on what you did with the eleven years, and
 * hands out the `found_sister` deed. Cross-faction bandaging is built, and its own comment says
 * it exists so "an escort you were paid to deliver alive" can be helped. The squad menu is
 * built. Every one of them was behind a branch that could not be reached: Lyre is spawned
 * faction 'exile' and the TALK menu accepts only 'drifter' and 'town'; a downed hostile is
 * claimed by the EXECUTE/SEIZE branch, which returns before the bandage branch; and the squad
 * menu was bound to the group HEADER rather than to the portrait.
 *
 * SO THIS FILE READS THE MENU, not the state behind it. Every case dispatches the real click a
 * player makes and then reads the labels out of `#ctxmenu` in the DOM — because "the order can
 * be given" was true in all three cases and is not what anybody was complaining about. Then it
 * clicks the entry and checks the order actually lands, so a menu of dead buttons cannot pass.
 *
 * AIM AT THE FEET. `w2s` at head height maps back to ground about 0.9 tiles past the body,
 * which is just outside the 0.9-tile radius every branch in this chain tests — the same trap
 * aid.js and wanderers.js both record. Each case checks its own aim before believing its result.
 *
 *   node tools/rightclick.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);
  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => r(1))));

  /* ---------- shared staging ---------- */
  await p.evaluate(() => {
    paused = true;
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -8; j <= 8 && ok; j++) for (let i = -8; i <= 8 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    window.__G = { gx, gy };
    window.__wipe = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1); };
    window.__mk = (name, faction, x, y, o) => {
      const c = makeChar(name, faction, x, y, o || {});
      c.__probe = true; chars.push(c); return c;
    };
    /* the real right-click, aimed at the feet. Returns how far off the aim landed. */
    window.__rclick = (t) => {
      hideCtxMenu();
      const q = w2s(t.x, t.y, groundY(t.x, t.y) + 0.05);
      if (!q) return -1;
      const mp = screenToWorld(q.x, q.y);
      document.getElementById('game').dispatchEvent(new MouseEvent('mousedown', {
        clientX: q.x, clientY: q.y, button: 2, buttons: 2, bubbles: true, cancelable: true }));
      return dist(mp.x, mp.y, t.x, t.y);
    };
    /* ---------- A HIDDEN MENU STILL HAS ITS BUTTONS IN IT ----------
       `hideCtxMenu` sets `display:none` and leaves the markup alone, so reading
       `#ctxmenu button` after a click that opened NOTHING hands back the previous case's
       entries. That is what a stale read looks like: case 2 reported Lyre's menu, complete
       with her name, for a click on a raider forty tiles away — and then failed her
       assertions against it. Ask whether the menu is on screen before believing it. */
    window.__shown = () => {
      const el = document.getElementById('ctxmenu');
      return !!el && getComputedStyle(el).display !== 'none';
    };
    window.__menu = () => window.__shown()
      ? [...document.querySelectorAll('#ctxmenu button')].map(x => x.textContent) : [];
    window.__pick = (frag) => {
      if (!window.__shown()) return false;
      const btn = [...document.querySelectorAll('#ctxmenu button')].find(x => x.textContent.includes(frag));
      if (!btn) return false;
      btn.click(); return true;
    };
    window.__look = (t) => { camX = camSX = t.x; camY = camSY = t.y; camDist = camDistTarget = 16;
      camPitch = camPitchT = 0.62; camYaw = camYawT = 0.4; camFollow = false; };
    /* ---------- AND THE GROUND HAS TO BE SEEN BEFORE IT CAN BE CLICKED ----------
       The branch this file is about opens with `visAt(c.x, c.y) === 2` — the tile must be in
       sight RIGHT NOW, not merely explored. A body pushed into `chars` while the world is
       paused stands on ground nobody has looked at, so the branch skips it, the click falls
       through to a lower one, and the probe reads "no menu" for a menu that works perfectly.
       That cost a full red run: the medic even took the order, from the branch two hundred
       lines further down, which is exactly the confusion this file exists to prevent.
       A handful of real ticks with your own body standing there is what lifts the fog, and it
       is also what a player has done by the time they can click anybody. */
    window.__settle = () => { paused = false; for (let i = 0; i < 8; i++) update(0.1); paused = true; };
  });

  const R = {};

  /* ================= 1. SOMEBODY WHO IS NOT YOUR ENEMY ================= */
  await p.evaluate(() => {
    const { gx, gy } = window.__G;
    window.__wipe();
    const hand = window.__mk('Hand', 'player', gx - 2, gy, { atk: 12, def: 10, tough: 20, ath: 8, medic: 30 });
    /* built the way `lyreCairn` builds her: faction 'exile', neutral, and her quest hooks.
       Those three flags ARE the bug — 'exile' is not 'drifter' or 'town', so the TALK menu
       never saw her, and `neutral` sent her to the branch that refused. */
    const her = window.__mk("Lyre d'Alagadda", 'exile', gx + 2, gy, { atk: 22, def: 26, tough: 20, ath: 8, medic: 40, magic: 52 });
    her.neutral = true; her.bossKey = 'lyre'; her.questGive = 'lyre'; her.holdsFire = true;
    selected = [hand];
    window.__settle();
    window.__look(her);
  });
  await frame(); await frame(); await frame();
  Object.assign(R, await p.evaluate(() => {
    const R = {};
    const her = chars.find(c => c.bossKey === 'lyre' && c.__probe);
    const aim = window.__rclick(her);
    const menu = window.__menu();
    R._theAim = `the probe lands ${aim < 0 ? 'nowhere' : aim.toFixed(2) + ' tiles'} from her`;
    R.theProbeAimsAtHer = aim >= 0 && aim < 0.5
      ? 'the probe clicks her feet, not the ground behind her'
      : `!! THE PROBE CANNOT AIM AT HER (${aim < 0 ? 'no projection' : aim.toFixed(2) + ' tiles off'})`;
    R._whatSheOffers = menu.length ? menu.join(' | ') : '(no menu opened)';
    R.aNeutralOffersAMenuAtAll = menu.length > 0
      ? `right-clicking her opens a menu of ${menu.length}`
      : '!! RIGHT-CLICKING HER OPENS NOTHING — the click is still spent on a refusal';
    R.andTalkIsOnIt = menu.some(x => /^TALK/.test(x))
      ? 'and TALK is on it'
      : `!! THERE IS NO WAY TO TALK TO HER (${menu.join(' | ') || 'no menu'})`;
    R.andYouCanStillAttackHerOnPurpose = menu.some(x => /ATTACK/.test(x))
      ? 'and attacking her is still something you have to choose, which was the one thing the refusal got right'
      : '!! THE DELIBERATE ATTACK IS GONE — a neutral can now be hit by an ordinary click';
    /* and the entry is not a dead button */
    const before = !!her.questDone;
    const clicked = window.__pick('TALK');
    R.andTalkingReachesHer = clicked && her.questDone && !before
      ? 'and TALK reaches the conversation that was written for her — she answers and the meeting is marked'
      : `!! TALK DOES NOTHING (clicked ${clicked}, questDone ${her.questDone})`;
    return R;
  }));

  /* ================= 2. A BEATEN ENEMY ON THE GROUND ================= */
  await p.evaluate(() => {
    const { gx, gy } = window.__G;
    window.__wipe();
    const doc = window.__mk('Surgeon', 'player', gx - 2, gy + 20, { atk: 8, def: 10, tough: 20, ath: 8, medic: 40 });
    const thug = window.__mk('Raider', 'bandit', gx + 2, gy + 20, { atk: 14, def: 8, tough: 30, ath: 6 });
    selected = [doc];
    /* SETTLE FIRST, THEN PUT HIM DOWN. Knocking him down before the ticks that lift the fog
       simply undoes it: `updateState` stands a body back up the moment its blood allows, so
       eight ticks later he was on his feet, the click took the ordinary attack branch, and the
       probe reported "no menu" for a menu it never asked for. The staging has to survive the
       settling it needs. */
    window.__settle();
    thug.state = 'down';
    /* a wound to treat, or `treatable` is false and the entry correctly will not appear */
    thug.parts['l.arm'].hp = 40; thug.parts['l.arm'].bleed = 0.4;
    thug.parts.chest.hp = 55;
    window.__look(thug);
  });
  await frame(); await frame(); await frame();
  Object.assign(R, await p.evaluate(() => {
    const R = {};
    const thug = chars.find(c => c.name === 'Raider' && c.__probe);
    const doc = chars.find(c => c.name === 'Surgeon' && c.__probe);
    const aim = window.__rclick(thug);
    const menu = window.__menu();
    R._theBeatenEnemy = `state ${thug.state}, blood ${thug.blood.toFixed(0)}, visAt ${visAt(thug.x, thug.y)}, ` +
      `treatable ${treatable(thug)}, selected ${selected.map(c => c.name).join('+') || 'nobody'}, menu shown ${window.__shown()}`;
    R.theProbeAimsAtHim = aim >= 0 && aim < 0.5
      ? `the probe clicks the downed raider (${aim.toFixed(2)} tiles off)`
      : `!! THE PROBE CANNOT AIM AT HIM (${aim < 0 ? 'no projection' : aim.toFixed(2) + ' tiles off'})`;
    R._whatABeatenEnemyOffers = menu.join(' | ') || '(no menu opened)';
    /* the two that were already there have to survive: this is a widening, not a swap */
    R.theOldOrdersSurvive = menu.some(x => /EXECUTE|FINISH/.test(x)) && menu.some(x => /SEIZE|ALIVE/.test(x))
      ? 'killing it and taking it are both still offered'
      : `!! THE EXISTING ORDERS WENT MISSING (${menu.join(' | ')})`;
    R.andNowYouCanStopTheBleeding = menu.some(x => /^TEND/.test(x))
      ? 'and TEND is offered on a beaten enemy, which is the half that was unreachable'
      : `!! NO WAY TO BANDAGE A DOWNED ENEMY (${menu.join(' | ')})`;
    const clicked = window.__pick('TEND');
    R.andTheMedicActuallyGoes = clicked && doc.healTarget === thug
      ? `${doc.name} is sent to ${thug.name} — a body on the other side, on the ground`
      : `!! TEND IS A DEAD BUTTON (clicked ${clicked}, healTarget ${doc.healTarget && doc.healTarget.name})`;
    return R;
  }));

  /* ================= 3. A UNIT TAB IN THE SQUAD BAR ================= */
  Object.assign(R, await p.evaluate(() => {
    const R = {};
    const { gx, gy } = window.__G;
    window.__wipe();
    hideCtxMenu();
    const one = window.__mk('Vessel', 'player', gx, gy + 40, { atk: 10, def: 10, tough: 20, ath: 8 });
    if (!groupByName('Left')) makeSquadGroup('Left');
    assignToGroup([one], null);
    selected = [];
    refreshSquadBar();
    /* find the portrait that IS this body: the name is in its .nm line */
    const port = [...document.querySelectorAll('#squadbar .port')]
      .find(d => (d.querySelector('.nm') || {}).textContent && d.querySelector('.nm').textContent.includes('Vessel'));
    R.theTabIsThere = port ? 'the unit has a tab in the squad bar' : '!! NO TAB FOR THE STAGED UNIT — case not staged';
    if (!port) return R;
    port.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = window.__menu();
    R._whatATabOffers = menu.join(' | ') || '(no menu opened)';
    R.rightClickingATabOpensAMenu = menu.length > 0
      ? `right-clicking the unit's own tab opens a menu of ${menu.length}`
      : '!! RIGHT-CLICKING A UNIT TAB DOES NOTHING — which is the report, word for word';
    R.andItCanBePutInAGroup = menu.some(x => /MOVE TO LEFT/.test(x))
      ? 'and it offers to move that one body into a group'
      : `!! NO WAY TO GROUP THE BODY YOU CLICKED (${menu.join(' | ')})`;
    const clicked = window.__pick('MOVE TO LEFT');
    R.andTheBodyActuallyMoves = clicked && one.grp === 'Left'
      ? `and it lands — ${one.name} is in Left`
      : `!! THE ENTRY IS A DEAD BUTTON (clicked ${clicked}, grp ${one.grp})`;
    window.__wipe(); removeSquadGroup('Left'); refreshSquadBar();
    return R;
  }));

  console.log('=== WHAT A RIGHT-CLICK OFFERS ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(34) : k.padEnd(34)) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) console.log('\n  ' + 'andNothingThrew'.padEnd(34) + `!! ${errs.length} PAGE ERROR(S) — ${[...new Set(errs)].slice(0, 2).join(' | ')}`);
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...(errs.length ? ['page errors'] : [])].join('\n*** ')
    : 'A CLICK ON SOMEBODY OFFERS WHAT YOU CAN DO TO THEM'));
  await b.close();
  if (bad.length || errs.length) process.exitCode = 1;
})();
