#!/usr/bin/env node
/* NEUTRAL BY CHARTER, WHICH IS ONE RULE OR IT IS NOTHING.
 *
 * "Faction: the mercenary's guild. Right now, I see a lot of random wanderers — dust mages,
 * destruction alchemists, and necromancers wander the wastes freely. The mercenary's guild is
 * a place where they unite under one banner, taking jobs freely. The organization itself is
 * neutral by design, but may license out soldiers to individual cities for warfare, though
 * never against each other. On the map, they have their own little bastion similar to the
 * paladins, and players can hire a crew for big jobs if needed. (Paid per day, maybe?)"
 *
 * A faction is easy to add and almost impossible to add WRONG in a way anything notices — the
 * yard stands, the people are in it, the screen opens, and the one clause that makes it a
 * guild rather than a gang can be quietly false forever. So the weight of this file is on the
 * two claims that could be:
 *
 *   · NEVER AGAINST EACH OTHER. Two towns at war, both of them paying the same organisation,
 *     and the two contingents in the same field refusing to touch each other. Checked against
 *     every path through `hostile()` that could put them on opposite sides, including
 *     provocation, which is the one that would break it.
 *   · PAID BY THE DAY. Which means the day the money stops, they walk — and a crew that stays
 *     on an empty purse is a recruit with extra steps.
 *
 *   node tools/guild.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    if (typeof guild === 'undefined' || !guild) { R.thereIsAYard = '!! THERE IS NO GUILD'; return R; }
    const roster = chars.filter(c => c.faction === 'guild' && c.state !== 'dead');
    R.thereIsAYard = `a yard at ${guild.x},${guild.y} with ${guild.walls.length} of wall and ${roster.length} in it`;

    /* ---------- 1. IT IS THE PEOPLE WHO WERE ALREADY OUT THERE ----------
       The report names three kinds by name. A guild of anonymous swords would satisfy every
       other assertion in this file and would not be the thing that was asked for. */
    {
      const flame = roster.filter(c => c.att && c.att.destruction >= 1).length;
      const dust = roster.filter(c => c.att && c.att.dust >= 1).length;
      const dark = roster.filter(c => c.npcNecro || c.gift === 'dark').length;
      R.andTheLetteredCameInOffTheRoad = (flame > 0 && dust > 0 && dark > 0)
        ? `and it is the wanderers, under one banner — ${flame} of the destruction art, ${dust} of dust, ${dark} of the dark`
        : `!! THE YARD HOLDS ${flame} FLAMEWRIGHTS, ${dust} DUSTERS AND ${dark} NECROMANCERS`;
    }

    /* AND IT IS ITS OWN PLACE. Sited away from the towns and away from the Bastion — a yard
       in somebody's suburbs is a district, not a faction. */
    {
      const nearTown = Math.min(...towns.map(t => dist(guild.x, guild.y, t.x, t.y)));
      const fromBastion = bastion ? dist(guild.x, guild.y, bastion.x, bastion.y) : 999;
      R.andItStandsOnItsOwnGround = (nearTown > 40 && fromBastion > 70)
        ? `and it stands ${nearTown.toFixed(0)} tiles from the nearest town and ${fromBastion.toFixed(0)} from the Bastion — nobody's suburb`
        : `!! THE YARD IS ${nearTown.toFixed(0)} FROM A TOWN AND ${fromBastion.toFixed(0)} FROM THE BASTION`;
    }

    /* ---------- 2. NEUTRAL, UNTIL SOMEBODY STARTS IT ---------- */
    {
      const mine = player().find(c => c.state === 'ok');
      const g0 = roster[0];
      R.andTheyAreNeutral = (mine && g0 && !hostile(mine, g0) && !hostile(g0, mine))
        ? 'and nobody in the yard has a quarrel with you — the charter is the whole of their politics'
        : '!! THE GUILD IS HOSTILE TO THE PLAYER ON SIGHT';
    }

    /* ---------- 3. THE ONE RULE ----------
       Two contingents licensed to two towns at war, and then every lever that could put them
       on opposite sides pulled in turn. `provoked` is the one that matters: it is how a
       neutral becomes an enemy everywhere else in this game, and if it works here the charter
       is decoration. */
    {
      const a = towns[0], bT = towns[1];
      const before = chars.length;
      /* One MARCHING and one holding a gate, which is how the world does it: a town at war
         fights in two places and they are different factions — the levy that marches is
         `warband`, the watch that holds the wall is `town`. A test that put both contingents
         in the same faction could never make them meet at all, and the charter would hold
         because the situation could not arise. */
      const nA = licenseCompany(a, bT, true), nB = licenseCompany(bT, a, false);
      const coA = chars.slice(before).filter(c => c.homeTown === a);
      const coB = chars.slice(before).filter(c => c.homeTown === bT);
      R.andTheGuildTakesBothSides = (nA > 0 && nB > 0 && coA.length && coB.length)
        ? `${nA} of them wear ${a.name}'s colours and ${nB} wear ${bT.name}'s, in the same war`
        : `!! LICENSING PUT ${nA} AND ${nB} IN THE FIELD`;

      const pairs = [];
      for (const x of coA) for (const y of coB) pairs.push([x, y]);
      const clash = () => pairs.filter(([x, y]) => hostile(x, y) || hostile(y, x)).length;

      const atPeace = clash();
      /* now start a war between the two towns, the way the world does */
      a.warWith = bT; bT.warWith = a; a.warDay = day; bT.warDay = day;
      relSet(0, 1, -100);
      const atWar = clash();
      /* and provoke every one of them, which is how a neutral becomes an enemy everywhere else */
      for (const c of [...coA, ...coB]) { c.provoked = true; c.neutral = true; }
      const provoked = clash();
      /* and a rebellion, and a purge flag, for the two other doors into `hostile` */
      for (const c of coA) c.rebelOf = 1;
      const rebel = clash();
      for (const c of coA) c.rebelOf = -1;

      R.andNeverAgainstEachOther = (atPeace === 0 && atWar === 0 && provoked === 0 && rebel === 0)
        ? `and across ${pairs.length} pairings not one of them will raise a hand to another — at peace, at war, provoked, and in a rebellion`
        : `!! GUILD FOUGHT GUILD (peace ${atPeace}, war ${atWar}, provoked ${provoked}, rebellion ${rebel} of ${pairs.length})`;

      /* CONTROL: they still fight the enemy's ORDINARY levy. A charter that made them
         harmless would pass everything above. */
      {
        const levy = chars.filter(c => c.faction === 'town' && c.homeTown === bT && c.guard && !c.guildLicensed && c.state === 'ok');
        const fights = levy.length ? coA.every(x => levy.some(y => hostile(x, y))) : null;
        R.andTheyStillFightTheLevy = fights
          ? `and every one of ${a.name}'s marching company goes for ${bT.name}'s watch — the oath is between them, not a truce with the world`
          : `!! A LICENSED COMPANY WILL NOT FIGHT THE ENEMY'S OWN GUARDS (${levy.length} to try)`;
      }

      a.warWith = null; bT.warWith = null;
      for (const c of [...coA, ...coB]) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
    }

    /* ---------- 4. PAID BY THE DAY ----------
       And the day the money stops they walk, which is the whole difference between a crew and
       a recruit. Run the real payday, not a copy of it. */
    {
      const co = GUILD_COMPANIES[0];
      const banner0 = bannerLoad();
      cats = 99999;
      const took = hireGuildCompany(co, startTown.x, startTown.y + 6);
      const crew = guildCrew();
      R.aCrewIsPaidByTheDay = (took && crew.length === co.n && guildWageDue() > 0)
        ? `${crew.length} take the contract at ${guildWageDue()} gold a day between them`
        : `!! THE CONTRACT PUT ${crew.length} IN THE FIELD`;

      /* AND THEY DO NOT FILL THE BANNER. `SQUAD_CAP` is what a banner holds — people who are
         yours. Counting a crew against it makes the whole feature a worse recruit. */
      R.andTheyDoNotFillTheBanner = bannerLoad() === banner0
        ? `and the banner still reads ${bannerLoad()}/${SQUAD_CAP} with four of theirs in the field`
        : `!! A CREW TOOK ${bannerLoad() - banner0} SLOTS OFF THE BANNER`;

      /* a day passes, and the purse covers it */
      const purse0 = cats, rep0 = guildRep;
      guildPayday();
      R.andPaydayComes = (cats === purse0 - guildWageDue() && guildRep > rep0)
        ? `and a day's pay leaves the purse — ${purse0 - cats} gold, and the Guild thinks better of you for it (${Math.round(rep0)} to ${Math.round(guildRep)})`
        : `!! PAYDAY MOVED ${purse0 - cats} GOLD AND STANDING ${Math.round(rep0)}→${Math.round(guildRep)}`;

      /* and now it does not */
      cats = 3;
      const repB = guildRep;
      guildPayday();
      const left = guildCrew();
      R.andWhenItStopsTheyWalk = (left.length === 0 && guildRep < repB)
        ? `and on an empty purse all ${crew.length} walk, and it costs you ${Math.round(repB - guildRep)} standing`
        : `!! ${left.length} STAYED ON AN EMPTY PURSE (standing ${Math.round(repB)}→${Math.round(guildRep)})`;

      /* AND THEY GO BACK TO BEING THEIRS. A body that walks off the payroll and stays
         `faction:'player'` is a free recruit with the wage deleted. */
      const walked = crew.filter(c => c.state !== 'dead');
      R.andTheyGoBackToBeingTheirs = walked.every(c => c.faction === 'guild' && !c.guildHire && !c.wage)
        ? 'and every one of them is the Guild\'s again — no wage, no banner, walking for the yard'
        : `!! ${walked.filter(c => c.faction === 'player').length} OF THEM ARE STILL YOURS FOR FREE`;

      for (const c of walked) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      selected = selected.filter(c => chars.indexOf(c) >= 0);
    }

    /* ---------- 5. AND STANDING IS A DISCOUNT, NEVER A SURCHARGE ----------
       A Guild that charges you more for being unreliable is a Guild that has decided not to
       work with you, and refusal is what that decision looks like. */
    {
      const at0 = (guildRep = 0, guildRate(1));
      const atHigh = (guildRep = 90, guildRate(1));
      const atLow = (guildRep = -90, guildRate(1));
      guildRep = 0;
      R.andStandingIsADiscount = (atHigh < at0 && atLow === at0)
        ? `and a day's blade costs ${at0} at nothing, ${atHigh} at ninety, and still ${atLow} at minus ninety — the punishment is refusal, not a bill`
        : `!! RATES: ${atLow} / ${at0} / ${atHigh}`;
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE CHARTER IS DECORATION (${bad.length + errs.length})`
    : 'THEY TAKE JOBS, AND THEY DO NOT TAKE SIDES');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
