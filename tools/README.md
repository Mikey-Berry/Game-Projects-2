# Dustward test harnesses

Headless probes that drive the real game in Chromium and report numbers. Nothing here ships —
`dustward3d_hd.html` stays one self-contained file. These exist so that claims about the game
can be checked instead of asserted.

Most of what is in here was written to answer a specific question during development, and
several of them found real bugs that reading the code had not: armour doing nothing against
projectiles, tiered armour drawing no geometry at all, a shared weapon geometry being disposed
out from under every other character holding that weapon, a town siting test too small for its
own building plan.

## Running them

```sh
npm i -D playwright && npx playwright install chromium
curl -Lo tools/three.min.js https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
node tools/prep.js                  # builds tools/game.html from the working tree
node tools/towncheck.js             # then run whatever you want
```

`prep.js` swaps the three.js CDN tag for the local copy (the harnesses load over `file://`),
refuses to build if a NUL byte has been written into the source, and syntax-checks the main
script block.

For an A/B against committed history:

```sh
node tools/prep.js HEAD~1 prev      # writes tools/prev.html
node tools/simcost.js game.html
node tools/simcost.js prev.html
```

Set `DUSTWARD_CHROME` to use a specific browser binary; otherwise Playwright's own is used.

**Interleave A/B runs.** Timings on a loaded machine vary more between runs than most changes
do — a single before/after pair once looked like a 44% sim regression that three interleaved
runs showed to be noise. Run each side two or three times, alternating.

**Average anything with a hit roll in it.** The same build measured one nodachi duel at 3.6s
and the next at 20s, purely on which body part the hits happened to land in. A single fight
is not a measurement. `cadence.js` runs nine and reports mean and median for exactly this
reason; the unaveraged version of that number would have been reported as a 3x slowdown when
the truth was 45%.

## What each one measures

### Correctness — run these before committing

| harness | what it checks |
|---|---|
| `boot.js` | Does the game still start. Ten seconds, no assertions, one question: did anything throw on load or on starting a world. The single-file layout makes one mistake very easy and very hard to see — a `const` declared beside the code that uses it, thousands of lines below the worldgen that *also* uses it, sits in its temporal dead zone when the world is built, kills the whole script, and makes every other harness fail somewhere unrelated. That happened twice while building the gaol. Run it first. |
| `towncheck.js` | Town geometry: overlapping footprints, buildings touching walls or standing in water, every door reachable by flood fill from the plaza, wells/flags/vendors/beds/guard posts in the open, town spacing. Takes a path, so it can be run across seeds. |
| `roundtrip.js` | Save/load fidelity for the Fracture clock, every hall's dread and wake state, shown-proofs, cooldowns, and the whole Compact including the muster roster. |
| `save.js` | The save format: that it shrinks, that it comes back byte-for-byte, and that **the saves people already have still load**. A save that writes fine and cannot be read back is discovered by somebody whose world is gone, so every path in and out is driven — the compressed one, the plain one a browser without `CompressionStream` would write (forced by making the constructor throw, the way an old Safari does), a gzip file recognised by its magic number rather than its extension, an old `.json` file, and a real `localStorage` round trip. Measured: 1,918 KB of JSON to 74 KB, 25.9x. It also pins something the compression work uncovered — **a snapshot is not a deep copy**, it shares nested arrays with the live world, so the autosave (which now packs asynchronously) must serialise before its first `await` or it writes a save that is half one moment and half another. There is an assertion for exactly that: snapshot, start packing, run the sim, and check what came out is the world as it was at the call. |
| `walls.js` | What a save does to the world that is not people. `save.js` proves the format round-trips and `roundtrip.js` proves the squad comes back; neither touches the structures, and two bugs lived in that gap. **The walls**: `restore` rebuilds the collision map from the world as generated — every wall solid again — but it never rebuilt the ring *arrays*, and the apply step could only splice. So a load into a session that had already seen a breach left the segment gone from the ring (no mesh, no hp, the town reads wide open) while it was still standing in `blocked` (nothing can walk through the gap), and loading an intact save after a siege did not bring the walls back at all. The guard against a foreign save razing a town it doesn't recognise was measured against the *live* ring rather than the saved one, so the worst-damaged towns were the ones that silently got their walls handed back. It asserts both directions: a clean ring round-trips, damage sticks and its gaps stay walkable, an intact save after a siege rebuilds every segment, loading twice lands where loading once did, a 70%-razed ring survives, a save from another worldgen is still refused, and "recorded flat" stays flat where "no wall data at all" keeps the generated ring. **The bodies**: `restore` read `s.kin` and `snapshot` never wrote it, so every risen came back as the generic rig — which is what the "skeleton mage's cape does not always persist" report actually was — and `kin` was missing from the mesh cache key too, so a mage and a plain risen shared a signature and whichever was built first handed the other its body. It reads the snapshot object itself rather than only the world after a restore, because the latter passes if the field happens to be recomputed elsewhere. Fails eight ways on the build before the fix. |
| `haulers.js` | What it takes to move a Sixfold, and what is left when you cut one up where it fell. A field rendering of a great body used to pay a quarter and delete the other three quarters with the corpse; and one necromancer could put a thing two and a half times the size of a man over a shoulder and jog home with it. It asserts the body survives, that the field share is an ADVANCE against the yard rather than a sale (105% of hauling it home whole, over sixty bodies each way), that shifting one takes a cart, a mule or four real bodies who are re-counted every frame, and that BONE HAUL delivers into the racks. **The claim that matters most is not in the report**: the HARVEST menu entry forged `body.looted = true` on the way in, which walked past the great-body loot gate and destroyed the two Preserved Formulae, three pieces of the Sundered and three thousand gold a Sixfold carries — so the one body worth hauling home was the one the interface quietly emptied first. Ten of thirteen claims fail on the build before the fix. |
| `scholars.js` | The Scriptorium, which was a shop counter: every living body in the squad listed with four buttons apiece, and pressing one moved an attunement tier instantly from anywhere on the map. It asserts the panel lists the pupil at the desk **and not** the one forty tiles away (in a pair, because a panel listing nobody passes the second half for entirely the wrong reason), that a course takes real hours, that it stalls when the pupil walks off and resumes when they sit back down, that calling it off refunds the fee and not the hours, and that it buys exactly one tier — routing the award through `attGain` puts it through the teacher bonus and 1.5x of "exactly enough" overshoots into the next tier. Also the study skill itself: on the sheet, earned at a bench, and distinct from labor. Twelve of thirteen fail before the fix. |
| `orders.js` | Giving an order without going through a menu, and letting go of one. Two of its three subjects were **half-built and unreachable**, which is this project's most common shape of bug: `findNode` had taken `'copper'` and `'iron_ore'` by name since ore was added and nothing ever passed them, so two live branches of the world scanner had no caller and ore was the only resource that could not be got by a job; and `toggleConcentrationOff` had been bound to X the whole time with nothing in the game saying so. So the assertions are about REACHABILITY — not "does the job work" but "can a player switch it on". It also drives shift+right-click with Playwright's own mouse on a seam, a tree and a bench, and checks the shortcut refuses a hollow risen the STUDY job the long way round would refuse. **Section 6** adds the chord that replaced it. Shift is the one chord no page is allowed to keep — both engines hand it to the browser, and the spec says they may — so the shortcut had been given the single modifier that summons "save image as" over the order it just placed. Ctrl was already half-wired for this (it is how a job is assigned at a BUILDING, off the same `BUILD_JOB`), so a gather node was the one subject it had never been aimed at. The two interesting assertions are the ones that must NOT change: a building keeps its fuller assign/shut-down/deconstruct menu rather than being preempted by the shortcut sitting first in the chain, and a visible body under the cursor still means FORCE ATTACK — checked as a pair, the same click on the same tile with a bandit on it and without, because the first half alone passes on a build where ctrl does nothing at all. Its own trap: the probe ticked `update` after dropping the bandit on the seam, and six tenths of a second is enough for a bandit beside an armed stranger to walk a tile and a half — it reported a failed force-attack guard when what had really happened is that nobody was standing there any more. |
| `tears.js` | Two ways to shut a tear, and why you would ever choose the slow one. **It asserts the premise first**, because the premise is the whole reason for the feature and it is measurable: the seal wants Quickened Flesh and Iron, which are a Flesh Vat behind a 700-gold project and a smelter behind a seam. Then the three properties that make the long rite a different thing rather than a cheaper one — 5.7x the hold, six through at the caster in two waves, and a hold that BLEEDS AWAY with nobody on it. The negative control is that the quick seal summons nothing, or the two roads would be one road with different arithmetic. |
| `vessels.js` | What a golem eats, and whether anything will give it any. Three faults that composed into one absurdity: the hunger tick said "the etchings want ore" and accepted only ingots, so a camp with a full bin of Iron Ore watched its golem seize up beside it (measured on the broken build: bin 6 → 6, hunger 10 → 9); the hand-feeding button is gated on `it.type === 'food'` and metal is 'mat' or 'trade', so there was **no way to give a vessel an ingot at all**; and that button never asked who it was feeding, so the one thing you could put into a golem was bread. Every claim is asserted through the panel's own buttons and `campTake` from a real bin, because "the mechanism works if you call it correctly" was true of all three before the fix. |
| `sixfold.js` | What a boss is supposed to do about a crowd. Measures an EXCHANGE RATE rather than a power level: the same twenty-four Old Bones against the same beast with its arsenal and with it switched off, asserting both that the swarm keeps its damage (48 blood against 30) and that it now pays for standing shoulder to shoulder (12 dead against 2). **The mechanism was already in the game.** `sweep` — {arc, reach, mult, max}, applied by `sweepAfter` out of `attack` — was written for the wyrm, and its own comment is this report about a different creature; the Sixfold was never given one. The first attempt wrote a second sweep inside the weapon-cleave branch and it fired alongside the original, and the only thing that caught it was the negative control passing on a build containing none of the new code. |
| `doorsave.js` | Save/load fidelity for the door, the doorborn, fallen seats and the ruin flag. |
| `fight.js` | 900 combat resolutions across every weapon × armour pair. Watches for throws and for NaN reaching a blood pool or a body part. |
| `wepsoak.js` | 160 weapon and armour swap cycles, then a save/load round trip. Catches geometry leaks and orphaned meshes. |
| `immortal.js` | Walks both immortal roads stage by stage through the real UI, checks every gated stage refuses until its condition is met, and confirms favor outlives the giver's corpse. |
| `regard.js` | Runs one of every conviction through the same career and checks they diverge, that education damps the swing, and that the ends of the scale actually act — walking out, turning, devotion. |
| `rite.js` | The Last Rite as a scene: that it opens rather than resolving, draws three waves, completes undisturbed, and collapses — still spending the offering — if the ritualist is driven off the circle or the offering is killed. |
| `axes.js` | That the four non-combat shaping axes actually bite in the sim rather than merely setting a field: knit against real severance rolls, plating through the damage-type matrix, quiet against accrued notice, will against attack and pace off the lead. |
| `shaping.js` | Binds the same recipe at three shapes and reports what actually came out — a Bone Golem should be seven times slower than a Skittering one, not five percent. Also checks promotion is gated on kills and frees a binding slot. |
| `names.js` | Name collision rate across a fresh world, and samples of what the generator produced. |
| `decay.js` | The corpse economy end to end: the stage ladder and how long each lasts in real time, what each stage raises into, that salt holds a body indefinitely, that a mule hauls three and a person one, and that all of it round-trips through a save. |
| `jail.js` | The law end to end: that an unwitnessed crime is not a crime, that a witnessed one raises a bounty, that guards subdue rather than finish someone with a price on them, that a lethal blow gets capped, that kit is confiscated, that a cell holds against a move order, that all of it survives a save, and that the sentence expires and returns what was taken. A jail is a lot of state that only works when several systems agree, and any one of them silently not firing leaves a feature that looks implemented and never happens in play. |
| `command.js` | Whether a band you sent away actually goes, does the thing, and comes back. A commander is made almost entirely of other features — it writes no movement, no fighting and no looting, it points the existing per-unit order fields (`attackMove`, `moveTarget`, `chestTarget`, `lootTarget`, `guardTarget`) at things — which makes it very easy to build something that reads correctly, syntax-checks, and does nothing at all in play. So this runs the real sim forward and looks at where the bodies ended up: did they leave, did they walk a circuit rather than a line, did the band keep up, did they open the chests inside the order's ground and leave the one outside it, did they come home when it was clear, does a captain who falls release his band, does the order survive a save — and does the band re-form after one, since `guardTarget` is an object reference and cannot. It also proves the break-off judgement differs by captain: compassion turns back at two down of four, ambition presses on to three; that a standing duty walks tour after tour on its own and will not begin one after dark; that a surgeon in the band both works in the field and moves the captain's break-off line; that a mule doubles what a sweep can carry; and that a contact call carries a count, a bearing and reaches the world news exactly once per contact. Three things it found that reading the source did not: a patrol had no END of tour, so a band that met nothing simply never came home and "standing duty" had nothing to stand between; a captain killed on a posted duty released his band in total silence; and the probe's own teardown used `chars.splice(chars.indexOf(o), 1)`, which on a body no longer in `chars` is `splice(-1, 1)` and deletes the last character instead — five of those took the player's own body out from under the next two blocks. |
| `notes.js` | Seven things reported from actual play, pinned so they cannot come back. Every one of them passed a syntax check and every other harness here while it was happening, which is the point. A lich shed one phylactery per blow that landed in the same frame (`updateState` runs at the end of every `applyDamage`, and the body was pulled out of `chars` without ever being marked spent) — and the same omission left every attacker swinging at the empty ground where it fell, because a target is an object reference. Hallowed ground was announced on every raise attempt rather than once. Hollowmere consecrated its own necromancers. A contraband stop read the shared stash, so anyone entering any town carried whatever the company owned, and went straight to a bounty. The walk cycle advanced at a flat rate whatever the speed. And a companion of three hundred days stood up as "Risen 14". Run against the build before the fixes it reports all of it, including the animator running at an identical 2.0 rad for a shambling golem and a sprinter. |
| `terrain.js` | What the mountains are like to walk on: rise per tile across each massif, how high you can actually climb against how high it goes, whether any range cuts the map in two, and whether the cliffs and the routes up both survive a save. This is the probe that found all fourteen massifs sealed from 40% of their height upward. |
| `origin.js` | That a chosen life actually starts. Takes an origin key (`node tools/origin.js game.html soldier`) and checks the three things every origin owes regardless of flavour: somebody to play, a squad standing on open ground rather than inside a wall, and a camera looking at them. An origin runs once, at the click of a button, before anybody is watching — `soldier` had been unpickable for months behind a duplicated `else if` head, and nothing else in the suite ever clicks Start with a particular origin selected. For a named origin it goes further and plays the whole start through. `lyonart`: the crown in the stash, the rite still gated behind the magic he does not have, three halls placing his sister and no credit for asking the same hall twice, her appearing at the site, her holding fire on his household, and the eleven-year search surviving a save. `saga`: that he is a Hollow whatever the picker said, awakened with the ceiling actually raised, that the godkiller bonus reaches the real damage path (measured off `applyDamage`, not `mitigate` — the first version of the probe looked in the wrong place and called the premise broken), and that the pull is vague at distance, sharp at the right mouth and *wrong in the wrong hole*, which is the only thing stopping the sense from solving the map for free. |
| `sister.js` | What happens AFTER the search for Lyre. The three legs all resolved and then `talkTo` set `questDone` and returned — she stood in that corpse-field for the rest of the run, which is what "she doesn't even join the party?" was. It asserts the shape of a relationship rather than the existence of a flag: she joins on one conversation as a full member at regard -25 (STRAINED — with you, not decided about you), the beats fire one at a time on facts about the world she could see for herself, past -45 she warns you once, past -60 she goes back to the corpse-fields rather than into the drifter pool, she can be talked back exactly once and only if the crown is off and the towns have stopped wanting you, at +60 she commits and the price of closing a tear drops, and all of it rides the save. 15 red on the build before. |
| `hire.js` | What the hiring bar advertises against what walks out of it. The row is the only place you are shown a person's character before paying for them, so it is a contract — and two of its fields were not being honoured. It reads the rendered row out of the DOM (the bug is a difference between displayed and delivered, so the display is the side that has to be read), hires every recruit on every board in the world, and compares. 23 of 29 changed conviction and 22 of 29 arrived with different numbers than the row printed. It also asks the two questions a lazy fix would fail: that more than one conviction still comes through (a fix pinning everything to `cold` would pass an equality test), and that a dark gift still forecloses Devout. |
| `nights.js` | How often the moon comes up wrong — as a GAP DISTRIBUTION over six thousand nights, not a mean rate. The mean was never the complaint: one every thirty-one nights is perfectly consistent with two in a row, and the build that shipped the report had a shortest gap of TWO with 75 of 194 pairs landing inside a fortnight. It drives `bloodMoonRoll` and the day counter directly rather than rolling the world over six thousand times, because a day rollover is the heaviest tick in this game and the subject is a clock, not an economy. Also pins the things a cooldown could quietly break: the event still happening, the opening grace, the Fracture stage still moving the rate, and the floor surviving a save (a floor that resets on load is one you walk through by saving). |
| `focus.js` | Who a squad decides to kill. Both acquisition paths called `nearestEnemy`, a pure distance sort — correct for one animal, wrong for eight people standing together, because identical inputs produce identical answers. Measured: eight on attack-move against six enemies inside the same nine tiles put EIGHT ON ONE and engaged one of six; against a brute worth no blows and a rank of crossbows they took down 0.71 of five bows and lost half the line. Nothing here asserts "they picked the right one" — one unit's choice is not the subject. It measures the SHAPE of the group's decision, and every pairwise preference is run TWICE with the two candidates swapped between the same two spots, because a line of four is not equidistant from two bodies and the first version went green on the broken build for that reason alone. |
| `board.js` | The town post end to end, plus the three notes that hang off it. That a board exists in every town on ground you can actually stand on; that it offers errands, blood work and a life in your hands rather than one kind of job forever; that a supply job goes taken → unfinished → delivered → paid and comes off the board; that a headcount bounty is counted where the bodies fall; that an escort is a real person who walks a real road and whose death costs you standing; that BODYGUARD names a ward out loud and a lone unit set to it no longer guards nobody in silence; that a sited job says which way to walk **and that the bearing is right**, checked against the sign of dx/dy rather than merely being present; and that the squad remarks on the situation it is in — starvation, an empty larder, a raising — with lines a cruel one says and a compassionate one never does, while still getting to tell you what it thinks of you. Two false alarms of its own, both written into the file: the world at day one has **no camps and no rifts**, so every job that needs an address is unrollable and the first run reported the scholar quests unfixed when what it had measured was a world too young to have anywhere to send anyone; and a supply job asks for what the town is short of, which is often something the player already has a pile of, so the not-yet assertion has to set its own target rather than trust the starting inventory. |
| `wanderers.js` | The six named companions who are in every world. The promise is not "some named NPCs exist" — it is that all six are there, in the same *kind* of place, never the same place twice, and every one can be reached and taken on; and every clause of that quietly stops being true the first time a placement falls through to a fallback nobody checked. So: all six placed, on ground you can walk to, inside the map, each a dated rumour; the gaoled one in a real cell that knows it holds him, the held one actually held, the redoubt one actually at a redoubt, none of them hostile on sight, and the road one somewhere different on six days of six. Then every gate is driven twice — refused with its stated reason, then opened once that reason is met — for a fine, a wounded companion, a written doctrine, keepers on the ground, and three *places* (not three button presses); the squad cap outranks all five. Then recruiting: out of the cell, off the rope, doctrine spent, on the banner, with stats worth crossing a map for. Then a save. Then a fortnight of sim proving the man in the cell does not file his way out — `workTheBars` would have undone the whole premise in about two weeks. Finally it opens **two more worlds at other seeds** and checks all six are still placed and 6 of 6 landed somewhere different. It also drives the real right-click handler at real screen coordinates for the conversation path — a dead-centre click opening the scholar rather than the generic menu, a distant one setting off a walk that remembers why and opens on arrival with no second click, and an unreachable one being dropped rather than walked at forever. Its own traps: aiming at head height (0.91 tiles off, which threads between the very branches being tested), staging the walk 18 tiles out where the night sight radius makes the target unclickable, and staging Cressa's "her keepers are still standing" test by killing one keeper the probe made itself, while the real slaver camp stood around her untouched. |
| `beasts.js` | The two new specimens and the four new bindings, each measured against the system it touches rather than its own fields. **The Cairn Beast**: that it eats the real `corpses` array and the bodies leave `chars` too; that forty bodies takes it past the Sixfold's 2.40 and slows it; that five thousand is still capped at 8 and a capped one still walks; that named dead and contracted wards are left where they lie; that a heavy blow sheds a piece as a real corpse and it picks that piece back up; that its drop table carries what it ate; and that a save stores only the count and rebuilds the body from it. **Brood-of-the-Door**: that it arrives with the door, stays anchored to it, that a *finished* hold does not close the sky while it stands, that the journal says why rather than deadlocking in silence, that two severed limbs drop the seal from 60 to 46, and that the same hold lands once it is down. **The bench**: that the Bone Mule is gone, the Knight costs stone, all four new recipes bind through the real `craftUndead`; that a Gravecart fetches six and destroys none of them; that a Stitch-Hand refuses fights, puts a severed arm back on, mends the rest, charges remains, and stops dead with the stores empty; that a Wisp lights measurably more ground, wards, and takes the room with it exactly once. Three of its own traps are written into the file: reading `blood` instead of the part pool, staging a Gravecart test inside a town (which measures the grave-robbery exemption, not the rounds), and a slack `||` fallback that let "0 on the bed" pass. |
| `threads.js` | Whether the game ever says what you are in the middle of. Two notes came back — the search for Lyre "gives absolutely zero leads whatsoever", and the second Fracture creates urgency with "zero clarity on how to actually stop what's happening" — and both quests were *fully implemented*. The property under test is therefore not "does it work" but "can the next move be read off a surface that is still there an hour later". It drives the real CHRONICLES panel and reads the step out of the DOM; checks a restated step says nothing and a new one is announced once; runs Lyre's whole trail (three halls with a count on each, a cairn in the field she was *put out at*, a scholar's ledger naming the field she is in now) and proves blundering into the last field early does not skip a leg; drives Saga's Q-readings and checks each one is written down and replaces the last rather than piling up; opens the closing rite at A STILLNESS, proves a scholar knows it, that a codex is needed to learn it, that the step then names the whole bill in advance, and that it turns into a live readout once the door stands. Also pins the escort ward being drawn out of vision, and that a ranged dark caster spends 0 mana over 400 ticks beside an already-marked foe. Its own traps: `charsNear` reads a per-frame bucket index, so a probe that pushes bodies in by hand and forgets `rebuildCharGrid()` scans an empty world — which made "it skips a marked target" pass for entirely the wrong reason. |
| `chores.js` | Three chores that existed but could not be reached. **Wall runs**: that one gesture stakes out a straight, contiguous, axis-locked line of walls; that every tile of it is still an ordinary 1x1 blueprint (decks, emplacement mounts, siege damage and the upkeep tally all look a wall up by its exact tile, so a wider footprint would break eleven other things); that a 500-tile drag is capped; that a run costs full price per tile; and that a run into a mountainside refuses **once** rather than six times. **The harvest job**: that HARVEST is in the JOB menu and choosing it sets the job, that four bodies get looted and then rendered down by the real `physics` tick, and — the whole safety story — that it refuses townsfolk, anyone with a home town, your own fallen, named lieutenants, VIPs, a body somebody is carrying and one the necromancer has already picked, and earns you no bounty you did not choose. **The ledger**: that a bounty can be settled at the bar as well as the Leader's desk, that the three doors are priced in order (Leader 1.5x < same-town bar 1.8x < courier 2.5x), that the watch stands down mid-arrest and lets go of the man they were walking to a cell, and that a bar in a town that does *not* want you will send the coin on — the only door reachable when the town that wants you is the one you cannot walk into. The harvest block also pins the give-up: the *nearer* of two bodies is made unreachable by replacing `travel`, and the job has to set it aside and clear the further one instead. Without that timer the nearest-corpse scan re-picks the stranded body every two seconds and a hand set to HARVEST walks at a cliff for the rest of the run, which in play reads as the job simply not working. |
| `survive.js` | How people actually die, and how much room there is between going down and being gone. Runs twelve even six-a-side fights and then takes the **real** casualties they left and lets them lie — untended, and with one bandage on the worst wound. This is the probe behind the survivability change: it found that an even fight kills nobody outright and then every single one of the fallen bleeds out where they lie, in about one game hour, which at `HOUR_SEC` 8 is nine real seconds between "X is down" and "X is dead" — and that a bandage saved 7 of 49. It also measures interposition (a bodyguard on the line must catch some blows and one standing behind the ward must catch none), and guards against the opposite failure: both sides must still fall at roughly the same rate, or the tweak has become a shield. Its own first version knocked people down by hand with sixty small cuts, which piles up five times the bleeding a real exchange leaves, and was measuring its own choice of damage size. Fight first, then measure the casualties. |
| `melee.js` | Two notes about how a fight behaves. **Target fixation**: stages a runner, a quarry ten tiles off and a picket line of six in between, and counts the passing cuts taken on the approach and whether the line is ever dealt with. This is the probe behind the `retaliate` fix — the old rule ignored being hit by anybody at all while any living quarry sat within *twelve tiles*, which is not "engaged", it is a third of the way across a battle. Also checks the other side of it: an order on clear ground is still carried out, and an order interrupted by a knife resumes once the knife is down. **Move variety**: what `pickMove` actually returns at novice and adept skill and in a crowd, that no single stroke is more than half of all swings, that being surrounded genuinely reaches for the wide strokes, and — the one that matters for the picture — that the arc handed to the animator is the same key the blow resolved with. Its own first version counted every jab across the whole run rather than the approach, reported 40, and was measuring the length of the fight instead of the recklessness of the charge; its second asserted that a right-clicked target is reached *through* a picket line, which is the bug restated as a test. |
| `arrow.js` | One arrow, one wound — and a feed with only your own news in it. Written after finding TWO `applyDamage` calls in the projectile impact branch, both of them running: every arrow, bolt and lance shot in the game had been landing double for as long as the armour pass and the audio pass had both been in the file. Measured on the build before: **24 loosed, 7 dodged, 17 landed, 34 wounds — exactly 2.00x.** Nothing in the suite could see it and no single harness was at fault; every combat probe asked whether somebody went down, and somebody always did, twice as fast as they should have. So this one asks a RATIO instead of an outcome — shots that landed against times damage was applied — and counts the landings off the dodge branch's own `miss` float, so the counter it compares against is a number the damage code had no hand in producing. It also insists the surviving call is the ARMOUR-AWARE one, since a build that deletes the wrong one of the two is one wound per arrow and still wrong. The rest of the file is the batch that came out of the same read: that five identical notices are one line reading ×5 in the feed and one entry carrying the count in the chronicle, while two notices taking turns stay four lines; that a town felling its own tree on the far side of the map says nothing and my own labourer still does; the same for a stray shot; that four Eyes weigh one body to the thing in the fields and render down accordingly while an ordinary body is untouched; and that a scrap nine tiles off is close enough for my own line to notice while twelve is still somebody else's business. Its own trap is written into the file: the help-radius block staged two bodies into `chars` without `rebuildCharGrid()`, so the spatial hash could see neither — the positive assertion went red honestly and the negative control went GREEN for the wrong reason, reporting "out of range" when the truth was "not on the map". That cost a debugging round with the game already fixed. |
| `clicks.js` | Whether you can click the thing you are pointing at. Written for "some creatures (especially gaunts/sixfold/etc) tend to be REALLY hard to right-click" — which was not a guessing game but PARALLAX: every pick compared the cursor to a body's tile, while `screenToWorld` follows the ray down to the GROUND, so a click aimed at a creature lands `height / tan(camPitch)` behind it. The file measures that drift in the running game before asserting anything — **0.61 tiles for an ordinary person and 1.54 for a Sixfold at the default pitch**, against catchments of 0.8-0.9 — so the premise is a number and not a claim. Then it drives the real right-click at real screen coordinates, aimed where a PLAYER aims: the middle of the visible mass for a standing body, and a tile off centre for a sprawled one. Four controls stay green on both builds: the feet still work (the fix accepts both points, so no learned habit is punished), an ordinary raider clicked on the chest still takes the order, and nine tiles of open dirt is still a move order with no menu. **Why nothing already here saw it:** `rightclick.js` and `wanderers.js` both drive the real handler at real coordinates and both aim at `groundY(t.x, t.y) + 0.05` — the feet — and a ray aimed at the ground lands exactly where it was aimed. They were testing the menus correctly, through the one aim point the bug cannot touch. Two traps of its own: the first version aimed at the CENTRE of the downed creature, where the drift is near zero, and passed on both builds proving nothing; and `wipe()` cleared everything flagged `__probe`, which included the probe's own player unit — it stayed in `selected` so `movers` still read 1 and the handler ran normally, but `computeVision` walks `chars`, so sight stopped being stamped and every branch gated on `visAt(...) === 2` quietly declined. Two cases reported "the order went to nobody" while the picking under test was working perfectly. |
| `patrol.js` | What a watch looks like when it is walking its beat. "Everyone moves super twitchy and fast... no methodical calmness... but I appreciate it over the weird circle it used to do." A middle ground cannot be asserted with a flag, because both ends of it pass "the job runs" — the old circle ran and the scatter ran. So this measures the SHAPE of the walk over four minutes of sim and holds it between **two** failures: too chaotic (reverses constantly, never stands still) and too rigid (holds one radius and orbits, which the report says was worse and does not want back). Measured on the build before: 873 tiles covered, **0% of the time standing still, 49 reversals of bearing**; after: 324 tiles, 63% standing, 9 reversals. The pace is measured too, because "fast" was in the report and is the one thing that was never true — `travel`'s last argument is an arrival radius, not a speed, and a patrolling body walks at 3.64 tiles a second against a plain walk of 3.68 on **both** builds. Four controls green on both: the pace, that it stays on its holding, that it still gets around rather than orbiting, and that a bandit five tiles off still ends the walk at once. |
| `charnel.js` | One word that was doing two trades. FLESH named both ends of a production line — the vats that make Quickened Flesh out of greenfruit and cloth, and the Charnel Houses that shape it into bodies — so a camp with both could not put a hand on one end without putting them on the other. **What it cost, measured on the old build:** a hand on FLESH with a Charnel House nearer than the vat stops at the house and never reaches the vat, which then produces nothing and says nothing. Splitting a job is easy to do halfway, because four separate places map a body to its work — `jobHasWork` (or a hand stands idle believing it has work), the job tick, the JOB menu, and `JOB_OF` behind right-clicking a building, where a Charnel House offering FLESH would send the hand to the vats and leave the house cold with nothing logged. This drives both ends through the real day tick and asks what came OUT of each building — 3 Quickened Flesh from the vat, a body on the ground from the house — rather than what flags got set. 9 red before, 0 after. Two traps of its own: the trades are not in `#jobrow` (which holds JOB, 2ND and COMMAND) but in the context menu the JOB button opens, so the first version read `["JOB: NONE","2ND: NONE","COMMAND…"]` and learned nothing; and staging the vat NEARER than the house made "a flesh hand does not tend the house" pass on both builds, because the old code walked to whichever was closest and never had the chance to fail. |
| `siege.js` | How often something comes at your gate. "It just feels like I'm constantly playing on the defense... struggling to catch my breath." The ask is pacing, not difficulty, and the thing to measure is not whether a raid happens — it always did — but the **distribution of gaps** between arrivals. Sixty game-days against a staged outpost with a host of twenty. Before: **21 dispatches, mean gap 2.9 days, shortest 0, two pairs on the same day.** After: 10, mean 5.8, shortest 4, none doubled up. The composition is the find: the Purge's contribution is identical on both builds (4 patrols, 1 Inquest, 1 hunt) and the entire difference is bandits, 15 down to 4 — a flat 25%-a-day clause with no gate on it was supplying two thirds of the pressure while the system that *looks* like the pressure, and had been tuned twice for this complaint, was behaving itself. It fails on SILENCE before it fails on crowding (a besieged necromancer nobody besieges is not the game), and checks the clock is genuinely SHARED — four per-system cooldowns would pass every distribution test here for the wrong reason. Three traps of its own, all written into the file: counting raids off `spawnHostileSquad` caught every bandit in the waste and reported 11 raids of which almost none were aimed at the outpost (count them off the notice the raid writes instead); `menaceFlag = true; hostSize = 20` set by hand is recomputed from the roster on the first day tick, so the patrol path — half of what the report names — never fired once; and standing the host back up once a day was not enough, because a hunt wipes twenty risen inside one day and `hostSize` is recomputed at the rollover BEFORE the top-up, so the menace flag still dropped on 16 of 60 days. |
| `kitrot.js` | Whether a body comes up wearing what it lay in. "Raising enemies who have been dead for a while tends to raise them without their armor/weapons... they should keep the armor/weapons they had upon their death, perhaps rusty or lower quality." It was a deliberate strip in `castRaise` — `if(rot < 0.7) r.armor = null` against a DECAY ladder putting `spoiled` at 0.66 — so five days dead meant no armour and eleven meant nothing. Nothing had gone wrong; it worked as written and the writing was the wrong call. The fix walks the kit down the quality ladder the game already has (Crude/plain/Fine/Masterwork) instead of deleting it. This raises the SAME corpse at four ages and reads what it stood up holding: **Masterwork, Masterwork, Fine, plain.** Plus a floor case (plain kit bottoms out at Crude, never nothing), a unique (no `tierOf`, no rung to fall to), and a looted corpse that still rises empty. 6 red before, 0 after. Two traps of its own: `castRaise` splices the corpse AND pushes the risen, so `chars.length` is unchanged across a success and the first version read every raise as a refusal — `raise.js` had this written down already from the same mistake; and "the kit is a lower grade than it was" is satisfied by there being NO kit, so it read green on the very build that deleted the gear. |
| `cloth.js` | A limb of the economy with no root. "There should be a building that makes fabric. Currently there seems to be no way to make it." Verified before building anything, and exactly true: the only producer of cloth in the world was the NPC town crafter, stocking a market you can buy from. The player could spend it — bandages, a Hunting Bow, a Leather Jacket, the Scriptorium, the War Table, the Flesh Vat, five binding recipes — and never make it. **The assertion worth keeping is not about the shed.** It walks everything the player is asked to SPEND (every build cost, every bench recipe, every binding recipe) and asks of each whether anything the player can do produces it: a material with a sink and no source is a dead end whatever its name is, so the next one fails this line without anybody noticing it in play first. It also drives the real panel and the real craft tick, because a recipe-table entry is not a feature until somebody can press the button and the cloth appears in the stores. 6 red before, 0 after. Two traps of its own: the general check first filtered out items of `type: 'trade'` believing that meant "a thing you buy" — it means "a trade good", and both FABRIC and HIDE carry it, so the one material the file exists for was excluded from the general check by the general check's own filter and it read green on the broken build; and reaching for `BUILD_TYPES.loom` unguarded killed the whole evaluate on the build without it, taking the economy assertions that had already found the defect down with it. |
| `craftwork.js` | Whether the craft sharpens from work or from waiting. "Magic skill grows fairly quickly... simply having undead followers should train magic, but this makes it far too easy to train the skill without really doing anything." A reversal by the hand that asked for it, so the ledger's warning is the design constraint — a caster who never trains BY CASTING is the opposite failure, and deleting the tick without replacing it walks straight into it. Three measurements over the same eight game-days: idle with a host (**+9.24 before, +0.00 after**), a host taking six kills a day (0.00 before, **+16.80** after), and casting eight raises (**+4.00 on both builds** — the control that says the fix did not become the opposite failure). No single number means anything; the ratio between them is the assertion. Its own trap is the good one: the first version gave the working necromancer the same host of eight as the idle one, and `castRaise` refuses at `risenLoad + 1 > risenCap` — five at MAG 20 — so every raise was declined and the entire gain came from kills. It read healthy at +16.80 while measuring exactly one of the two things it claims to measure, and the casting half, the thing the ledger warned about, was never exercised. |
| `mishap.js` | Whether an accident is a declaration of war. "Friendly fire by ranged allies onto escort mission people sometimes makes them turn hostile, and actually counts as an attack against that whole city... they would need a witness to properly deliver the news." Both halves were built and neither was wired up: `applyDamage` takes an `incid` ("incidental") argument that `crime` and the `provoked` rule both already honour, and the pyromancy splash four lines away has always passed `true` — but the projectile impact passed `false` unconditionally, so `p.ff`, computed at the moment of loosing, was carried the whole length of the flight and dropped on arrival. And the standing penalty ran with **no witness check at all**, in a file whose crime system opens with "nobody is wanted for what nobody saw". Fires real arrows through the real projectile mill and changes ONLY whether the shot was meant. On the build before, staged as reported — a ward ninety tiles from any town, clipped by your own archer: **"provoked true, hostile true, rep 0 → −4"**. Three controls green on both, because "accidents cost nothing" fixed too hard is just the consequence removed. Its own correction is the instructive part: the first unwitnessed case expected no standing lost and lost 4, correctly — `witnessNear` matches any living townsperson with line of sight, and **the victim is one**. There is no "nobody saw" while the victim is on their feet; the real unwitnessed case is one where nobody is left standing to carry the tale. |
| `cave.js` | Whether a cave is playable. "The camera does not follow. And it becomes impossible to select anyone underneath the mountain as the geometry appears to block clicking on them." Four causes, none of them geometry: the camera anchor asked `(floor||0) > 0`, a yes/no about being UPSTAIRS, and caves are NEGATIVE floors; the click marched the terrain and stopped at the mountain (**measured: a click aimed at a body on storey −4 resolved 11 tiles away on the hillside** — it was landing exactly where it was asked to); the drag box projected every body at `groundY + 0.9`, the surface, whatever floor it was on (which hid squads on ramparts too); and deselecting reset `activeFloor` to 0, so one empty click snapped the view up and the squad could no longer be picked. Two controls green on both builds — `descend.js`'s claim that the STOREY follows, which was always true and is why the suite never noticed any of this, and that the surface is completely unchanged. Three traps of its own, all written into the file: dispatching `mousemove` at the **window** when that handler is bound to the canvas, so the drag stayed a click and the file blamed the game; clearing `selected` before clicking, which reset `activeFloor` to the surface and measured the wrong storey; and clicking while the camera anchor was still LERPING thirteen tiles downward, so the aim was projected through one camera and checked against another. |
| `opaque.js` | Whether a building is solid when nobody is in it. "Redoubts and multi-story buildings are see-through even if none of my squad are inside." The Bastion's citadel has always had this right — it tests whether one of your SELECTED bodies is in the footprint — and four other places asked a weaker question: a deep redoubt asked whether any of your people were on that FLOOR NUMBER **anywhere in the world**, so one hand on your camp's rampart opened every redoubt on the map; a shallow redoubt's parapet was solid only while you stood on it; and town ramparts and your own watchtower asked only whether the camera was on the ground, which it nearly always is. Counts see-through parts **by difference** — with the building in the world and again with it lifted out — so it isolates exactly what that building drew, needs no hook into the renderer, and runs identically on a build that predates the change. Reads the BUILT MATERIALS, since a rule that changes an expression and never reaches a material would pass a flag test and change nothing on screen. It also checks the building OPENS when you walk in, because these groups are cached against a sync key and a fix that does not reach the key is a building that stays shut behind you. 2 red before, 0 after. Its own trap: the empty-tower case used `selected = []`, and `activeFloor` HOLDS when there is no selection — so it was left at 1 from the previous section, which happens to satisfy the old `activeFloor < 1` rule, and the case passed on the broken build for a reason that had nothing to do with towers. |
| `pins.js` | Marks of your own on the map. A new feature has no subtle wrong answers, only whole missing ones — a button that does nothing, a pin drawn under the fog, a pin that does not survive a reload — and all three look identical to "it works" from inside the code. So every one is driven through the real DOM: the real button, real mouse events at real coordinates on the real minimap canvas, **real pixels read back off the minimap** (0 lit on unexplored ground without a pin, 37 with one), and a real save round trip. The fog check is the one that matters: everything else on that map is drawn beneath the fog sheet, so a pin added the ordinary way is invisible on exactly the ground a pin is for. Two controls: an unarmed click still jumps the camera, which is what that map has always been for, and an armed click does not also jump it. 4 red before, 0 after. |
| `flank.js` | How a squad gets to a fight, from the report "everyone tries to beeline towards the enemy and gets caught on allies — they should attempt to flank around where possible". **The first half of that was a wrong diagnosis and the probe is worth keeping mostly for having said so.** Four stagings went looking for the stall and none of it exists: eight bodies given one order all reach striking distance inside three seconds with *zero* ticks of the approach spent going nowhere; a runner sent through his own six-man picket line pays 1.03x the open walk for it; two lines of six meet with two changes of mind between twelve bodies; and eight ordered through a **one-tile gate** in a wall are all through and fighting in three and a half seconds. Nobody was getting caught on anybody, and the pathing needed nothing. What was actually wrong was the picture: all eight walked at the same point — his tile — and arrived as a column standing inside each other, eight bodies within one tile of the quarry on five of the eight sides. So the assertions are about **sides and bearings**, not speed: seven of eight sectors occupied after, five before; and three men joining a fight somebody else is already holding must come round off the quarry's face, which fails 0/3 on the build before at bearings of 0.81, 0.83, 0.87 to his nose. The other four measurements stay in as guards, because a flanking rule is exactly the kind of change that would break them. Two traps of its own, both written into the file: the quarry has to be **pinned to its tile** every tick or a crowd arriving shoves it and the probe measures a moving fight (the same lesson `rites.js` learned); and a bearing taken at first contact reads 0.83 for a body that goes on to fight from the north, because walking round to the north side clips the man's reach on the way past — the honest moment is the first **windup**, when the body has stopped choosing. |
| `kiting.js` | What a shot costs the legs, and what a blade costs the exit. Written for "kiting should slow down the ranged attacker" and "catching a ranged attacker in melee should somewhat lock them down from fleeing". **It measures ground covered, never a flag**, because the complaint is written in ground and because the flags all read correctly on the broken build. The hunt it records is the useful part: the obvious theory was a seam between the branch that opens a draw and the one that looses it, since `clearOrders` never touches `c.windup` — and there is no seam. `ai()` returns immediately for anything player-faction, so `physics` drives orders and combat together, and it already returns for the whole length of a windup. Traced tick by tick, an archer given the run order on the tick the draw opens walks **0.000 tiles** before the arrow leaves. Case 1 is what survived that hunt and it passes on every build on purpose — it is the control that says the draw really is rooted, which is the premise the rest of the file rests on. The real answer was arithmetic: a bow is a 2.3s cycle of which the rooted draw is 0.45, so a perfectly rooted archer still walks four fifths of it flat out, measured at **86% of the ground the same archer covers doing nothing but running**. Hence the reload drag, and hence 68% after. The grip half runs the same four seconds three ways — alone, with a swordsman on them, and with a swordsman on them whom an ally has by the throat — and gets 13.4 / 7.3 / 13.0 tiles. It is also the file that proved a grip has to outlive the contact that made it: with the grip scoped to the 1.45-tile contact test alone the same three runs read 13.4 / 12.7 / 13.4, because the archer steps out of contact on the second tick and an equal-footed chaser never closes again. |
| `bound.js` | Every kind the Binding Circle can make, DRAWN — alive, and again lying on the ground. Written for "summoning a wisp crashes the game" and deliberately not written for the wisp: the wisp was one of three rigs raising the same flag, and a probe that summoned a wisp would have gone green over whatever else shared it. **The crash is in the draw, not in the rite**, which is the whole design of the file: `craftUndead` returns true, the body is in `chars`, the materials are spent — every state assertion you could write about the summon passes, and the exception comes out of the pose machine on the next frame. It asserts the CONTRACT rather than the symptom: anything flagged to be posed by the float rule must carry every part that rule dereferences without asking (`float`, `sigil`, `spineBits`), because a future rig raising that flag without one of them is the same crash under a new name. Two traps of its own, both written into the file: the making loop clears each summon out of `chars` before the next rite so the binding does not fill up, which leaves every body but the last OUT of the world where `syncChars` cannot see it — and a body with no rig is never posed, so the draw checks went green over an empty frame until `everyRigIsActuallyBuilt` was added to catch exactly that; and an exception thrown inside `render()` reaches Playwright's `pageerror` channel rather than the evaluate's return value, so a probe reading only its own `try/catch` reports a clean run while the console fills with the crash. |
| `start.js` | Can a finger start this game? Written for "I can't even start the game since the character creation screen is too packed" — which turned out to be UNREACHABLE rather than cramped: 843px of panel inside a 640px box, WAKE UP at y=799, and a tap that did nothing on any phone. Four assertions because **three separate faults shared the symptom** and fixing any one alone still leaves an unstartable game: the panel did not scroll; `justify-content:center` on a flex column overflows *both* ends and overflow past the START edge is outside the scroll range in every browser (so adding `overflow-y:auto` alone buys the bottom and loses the top — the top is asserted separately, and it is the half most likely to be "simplified" back out); and the squad bar, at z-index 35 in a `body.touch` rule, sat in front of the button, which is why scrolling never helped and why a desktop never showed it. Its own trap, and a sharp one: **`locator.tap()` cannot hit this page.** It reports "visible, enabled and stable", says "done scrolling", then hangs on its own hit-target retry against a canvas that repaints every frame — while `touchscreen.tap()` at the identical coordinate starts the game. Taking that red at face value would have been the probe blaming the game for its own failure; asserting on a scripted `.click()` instead would have been worse, since that bypasses layout and passes just as happily on a button parked off the bottom of the screen. It dispatches a real touch at the middle of the button and checks occlusion separately with `elementFromPoint`. |
| `rightclick.js` | What a right-click offers on somebody who is not your enemy, and on one on the ground. Three reports, one surface, and **not one of them was a missing feature**: Lyre's conversation is written and long (five answers depending on what you did with the eleven years, plus the `found_sister` deed), cross-faction bandaging is built and says in its own comment that it exists for "an escort you were paid to deliver alive", and the squad menu is built. All three were behind branches nothing could reach — she is spawned faction `exile` and the TALK menu takes only `drifter`/`town`; a downed hostile is claimed by the EXECUTE/SEIZE branch, which returns two hundred lines above the bandage one; and the squad menu was bound to the group HEADER rather than the portrait. So this file **reads the menu, not the state behind it** — it dispatches the real click and reads the labels out of `#ctxmenu`, then clicks the entry and checks the order lands, because "the order can be given" was already true in all three cases and is not what anyone was complaining about. Three traps of its own, all written into the file: the branch under test opens with `visAt(...) === 2`, so a body pushed in while paused stands on ground nobody has looked at and the click falls through to a *lower* branch — the medic even took the order, from the wrong place, which is the exact confusion the file exists to prevent; `updateState` stands a downed body back up during the ticks that lift that fog, so the staging must survive its own settling; and `hideCtxMenu` sets `display:none` without clearing the markup, so reading `#ctxmenu button` after a click that opened nothing hands back the PREVIOUS case's entries — it once reported Lyre's menu, with her name in it, for a click on a raider forty tiles away. **Section 6** is a different question on the same button: whether the BROWSER's menu — "save image as" — comes up over the game. Only the two canvases ever guarded themselves, so it was suppressed exactly where a player looks hardest and passed straight through on the HUD, the squad bar, the log and every panel, which are DOM on top of the canvas and most of the screen. It asserts through `ev.defaultPrevented` on a real dispatched event at three points, because the question is what the browser would DO and only a dispatched event answers that — and it asserts the EXEMPTION as its own claim, that a textarea keeps its menu, since the save-transfer boxes are the one place a player needs the browser's own copy and paste and a blanket guard is the kind of fix that quietly takes something away. **Section 7** is the half that guard can never reach: shift+right-click belongs to the browser by design — Gecko does not fire the contextmenu event at all while shift is held, and the HTML spec blesses it as the user's escape hatch — so any feature bound to that chord is broken by design. The stores panel had one. "Take the whole stack" read `ev.shiftKey` inside an `oncontextmenu` handler, so in Firefox it never ran: the top gear was gone in an entire engine with the tooltip still advertising it, and nobody had filed it because a button that silently does the wrong amount just looks like a button not working. Asserted on all three gears at once through the real button, because the fault that reached the player was not "ctrl is missing" but "the top gear is unreachable" — a test that only asked about ctrl would pass on a build where ctrl took ten and nothing took all. Two traps of its own: the probe filled the pack and called `refreshInv`, which draws the shared squad stash and has no such control — the buttons come from `mkBulk` inside `openInventory`, and the panel under test was never open; and matching the button by the new tooltip made the negative control fail on a CHANGED STRING rather than changed behaviour, so it matches "for all", which every build with the feature says. |
| `mimics.js` | The Mimic race and its three lines — succubus, doppelganger, Fallen — and the models all three wear. Every case is built to test the CLAIM rather than the table: the sex rules are asked for **backwards** (a succubus requested male, a Fallen requested female), because a rule that only holds when nobody argues with it is not a rule and `makeChar` takes a `sex` from its caller everywhere else in the game; the innate charm is measured against a human control with *more* magic and the same mana, since "she can cast it" is worth nothing next to "and the art skipped the gift, the attunement and the research a Duster needs"; fertility is asserted on the **pair** against a golem, because the claim is not that she breeds but that she breeds with something that cannot; and permadeath is measured as an **absence** — no corpse — with a human killed in the same breath as the control. The sharpest case is the one that checks a limit rather than a feature: changing form voids every warrant in the world but must NOT clear a town's reputation, because a warrant is out for a face and an opinion is not, and without that line the ability is a delete-consequences button. The models are read off the **built mesh**, never off flags — the lesson the helms taught — so each line has to put real geometry on a real body (22/17/24 boxes against a plain human's 10), and the Fallen and the Messenger have to carry the same `oldGod` motif while a plain human does not. |
| `moves.js` | **Visual.** One row per MOVE, which is a different question from `swing.js`'s one row per weapon: that one shows a nodachi and a katana swinging at different speeds, this one shows whether the six strokes read as six strokes. It replaces `window.pickMove` from the page (a top-level function declaration in a classic script is a property of `window`) and forces each key in turn. It is what showed that slash, overhead and thrust — 85% of every swing at low skill — all wound up with the blade straight over the head, which is exactly "I only ever see the overhead swipe": the numbers said the strokes were varied, and the numbers were right and irrelevant. `node tools/moves.js w_kat out.png [slash,thrust,...]` |
| `races.js` | Races and the lines inside them. A subrace is four mechanisms wearing one name — starting stats, a per-skill learning rate, damage-type vulnerability, and overrides for speed, lifespan, skill ceiling and whether the line can hold a gift — and every one of them is the kind of thing that can be declared in a table, read perfectly, and never once reach the sim. So none of it is read off the table: experience goes through the real `xpGain` and the two bodies are compared after 400 points, damage goes through the real `mitigate`, speed through `moveSpeed`. It also pins the migration — a body carrying `race:'scaleborn'` out of a pre-rework save must come back as a chimera of the scaleborn line and not as a human. Diagnosing its first red run turned up the actual bug: `makeChar` rolled the line off the raw `o.race`, and almost nothing in this world is created with an explicit race, so townsfolk, guards, bandits and children all became raceless humans with no line at all. The feature existed in the character creator and nowhere in the game. |
| `corpses.js` | How long a corpse actually lasts in real minutes at each game speed, how many things are competing for it, and what a body is worth once you have one. Answers "am I imagining that bodies vanish too fast" with a number. |
| `pace.js` | Whether a party given ONE order arrives as a party. One order handed to five bodies was five independent walks — measured at 7.1 tiles of spread on average and 13.3 at the worst on a forty-tile march, so the fast one met whatever was at the far end alone. Nothing in the suite could see it because every unit involved was doing precisely what it was told. It asserts BOTH halves, because pacing everybody to nearly zero is the cheap way to pass the first: the party holds together (1.6 tiles) **and** the march still takes the slowest member's honest time (14s against 13s) rather than a crawl. Three controls that only do real work once the band exists — a lone body is never slowed, a body in contact walks at its own speed (a pace band that survives contact is the reported bug wearing a hat), and a body sent off on its own leaves the band. |
| `voices.js` | Who is allowed to say what. A harness cannot judge whether a line is in character; what it CAN do is refuse to let one table be read by two kinds of body. Every string written for the living is flattened into a set, then four hundred barks are drawn from a soul-bound risen, a lieutenant and a lich and checked against it — 1200 of 1200 came out of the living tables on the build before. A fourth assertion stops the cheap fix of one shared undead pool, because a lich and a stitched cadaver do not sound alike, and two controls hold the other end: the living are untouched, and a risen with nobody in it is still refused the floor. |
| `pain.js` | What comes out of a body that has just lost an arm — measured at the site, with a real stalker, a real cut and whatever ends up in the bubble, rather than by reading a table. `say(d, 'AAAGH!')` sat in the severance branch of `applyDamage` with no test of any kind on it, so a Watcher screamed a human scream in English in capitals. It also holds the two things that would make the fix cosmetic: the eldritch noise has to RENDER (the bubble is canvas `fillText` at 10px monospace and an unknown codepoint draws as a box, so every gaunt glyph is checked against Latin-1), and a thing with no words has to say nothing rather than fall back to the human line. Plus one assertion with nothing to do with the report: **a speech bubble must not move the simulation** — 200 barks for zero movement of `seed`. |
| `names.js` | Whose name it is. Measured in a live world off the bodies worldgen actually built, because the fault was never in the namer: the race was rolled AFTER the name in three places and patched on afterwards in a fourth, so a golem was called Bosk Drybones and every homunculus in Copperhold had a family name. It also pins the invariant this file has been bitten by four times — **building a body costs the same number of draws whatever the body is** — directly off `seed` rather than off a fingerprint: fifty full names cost the same on all six races and a bare given name costs less. Two probe faults are written into it: `Warden`/`Pauper` are ROLE LABELS deliberately shared, and one-name people are supposed to collide; and a probe that reads only the streets meets three homunculi and no golems at all, because worldgen puts the made races behind a bar waiting to be paid. |
| `hosts.js` | The two spells that step around the binding — Old Bones and Mass Reanimation — and what they cost INSTEAD, which is the only interesting question about them. "Does it raise something" is not a test; a spell that raises free and keeps free is the end of the dark art's entire cost model and would read as nothing but a bigger army. So: the clock actually runs out (24 game-hours, and nothing left to harvest — a working that ran out is not a death), the head room is actually taken (65% of the pool, and letting go dismisses them), the rite can actually be interrupted, and neither puts a permanent host on the binding. That last one found the real bug: `risenLoad` sums `(x.bindWeight || 1)` and both spells set it to 0, so twenty propped bodies read as twenty slots off a ceiling of seven — the whole cost model inverted, invisible to any outcome test. |
| `wyrm.js` | An imperfect dragon, and the three claims about it that could quietly be false while the creature worked perfectly well. The sweep is the one that had to be BUILT: the cleave that catches bystanders is gated `if(wpn && !wpn.range)` — it comes off the weapon — so everything in the game that fights with what it IS struck one body per blow however large it was, and six men could stand shoulder to shoulder in front of a house-sized animal and take it in turns. Measured **by difference**: twelve blows at one man in a rank of five reach five of them with the sweep and one without, because an absolute number passes on any build where the thing merely hits hard. The breath is checked as a LINE (two bodies outside the bearing take nothing, so stepping aside is the answer), rarity as distance and not just count, the hoard against the richest thing already in the game, and the rig against the grazer's. Three probe faults in it, all named in the file: `neutral = false` takes a body OUT of the rule that would have made it hostile; `syncChars` builds rigs for what is on screen and nothing else; and a size bound that passed by 2% is not a bound. |
| `guild.js` | The Mercenary's Guild, and specifically the one clause that makes it a guild rather than a gang. A faction is almost impossible to add WRONG in a way anything notices — the yard stands, the people are in it, the screen opens — so the weight is on **never against each other**: two towns at war, both paying the same organisation, and every lever that could put the two contingents on opposite sides pulled in turn, including `provoked`, which is how a neutral becomes an enemy everywhere else in this game. The control is the other half — they still go for the enemy's ordinary watch, since a charter that made them harmless would pass all of it. Licensing had to be able to PRODUCE the situation it forbids, which took a second pass: a town at war fights in two places and they are different factions, so both contingents in one faction could never meet and the rule would have held vacuously. |
| `purge.js` | The three things in the world that are not a town and not your problem, and which between them did almost nothing. Weight is on the **sequence**, because every step of it can be true while the one after it is not: seized, held, held for a WEEK, burned on the day, and a stake left standing with a name on it. The week is the feature — an execution that resolves the moment it is decided is a log line, so BOTH halves are asserted (nothing happens for six days; on the seventh it does), plus that walking them out of the cell actually ends it. The save round-trip earns its line on its own: "permanently altering the world" that does not survive a reload reads identically in play until the day you reload. Two vacuous greens were closed here after the fact — forty draws that never picked a player unit is free when the pool is EMPTY, and `0 of 0 hands have a bench` clears any percentage floor you like — so both now require the measurement to have happened. Every block is fenced in a `guard()`, because a harness that throws on the build before the feature dies at the first missing name and reports nothing about the other seven claims. |
| `trades.js` | Whether a town looks like it is doing something. The economy worked perfectly, which was the problem: a bookkeeping pass over people standing anywhere, run at the DAY ROLLOVER — midnight. Measured on the build before: 3 of 64 shifts in a working day and none anywhere near a workplace, because there were no workplaces. It checks that the places exist and are recognisable (each prop unique in the world), that every trade has somewhere to be and the outdoor ones are outdoors, that people GO, and that the making happens there in daylight. The control is the important one and it is asserted **exactly rather than statistically**: shifts against worker-days (0.62 against the 0.70 the productive roll has always paid), because counting SHELVES moves by a third on plague and war alone — 232 units on one build and 163 on the other, both perfectly correct. |

### Balance

| harness | what it measures |
|---|---|
| `pierce.js` | Damage actually taken from an identical nominal hit through each armour. This is the probe that showed ranged delivering a flat 30 through naked skin, masterwork plate and carapace alike. |
| `matrix.js` | The full damage-type × armour-class matrix, plus binding strain and Darkbolt scaling. |
| `dps2.js` | Effective DPS per weapon against five target archetypes, through the game's real mitigation. |
| `ttk.js` | Swings to put a target down, by weapon and armour. The readable form of the matchup table — it is where "the club beats plate" stops being a claim. |
| `behave.js` | Lance cells and overheat, massed-fire stray scaling, the Darkbolt mark (must be +10% for undead and +0% for the living), binding strain. |
| `cadence.js` | How a fight *feels*, in numbers: swings per second, the length of the telegraph, the fraction of the fight you are rooted and cannot act, damage per landed blow and how often it staggers. Where `ttk.js` zeroes the cooldown to ask a balance question, this one leaves the clock alone to ask a pacing one. It is the probe that showed every melee weapon in the game — plank to Sundering Edge — swinging at an identical 0.83/s behind an identical 0.26s wind. Also walks the same weapon up a skill ladder (what competence is worth), measures what toughness and armour training buy against being knocked about, proves the recovery beat actually roots a body, and averages nine duels to report how long a fight really takes. |

### The endgame

| harness | what it measures |
|---|---|
| `fracsim2.js` | Fast-forwards whole runs at three play styles. Reports when the Fracture lands and how town dread moves, with and without a player working the halls. Use this after touching `FRACTURE_DAYS`. |
| `compact.js` | Compact mechanics end to end: signing gates, what a signature costs a town, willing versus held, the tithe, the muster going to tears, a neglected signatory walking out. |
| `demand.js` | Seal uptime against demand scaled to the ladder, by Compact size. Shows whether three seats is still enough at each stage. |
| `sustain.js` *(if present)* | Whether the common stock survives sustained sealing over 60 days. |
| `endgame.js` | Plays the Fracture phase out day by day at each Compact size: which seats fall, how wide the door gets, what closing it then costs. |
| `door.js` | The closing rite end to end, including the failure case where the rite completes with nothing to pay for it. It must not close for free. |

### Performance

| harness | what it measures |
|---|---|
| `touch.js` | The touch layer, driven by real `TouchEvent`s built inside the page — that a tap on one of your own selects, a tap elsewhere orders, a hold reaches the right-click path, one finger pans, two pinch, the box-select toggle holds, the panel cycle shows one sheet at a time, and the manual override takes. **And, more importantly, that none of it touches desktop**: mouse mode still detected, touch controls still hidden, quality dials left alone, left-click still selects and right-click still orders. Desktop is the priority; a mobile scaffold that changes mouse behaviour is a regression whatever else it does. Two things it found that reading the source did not: `innerWidth` is *not* the layout width under real mobile emulation (it reported 1572 against a true 393, so the renderer was sizing an eighteen-megapixel framebuffer for a phone and every screen↔world conversion was dividing by the wrong number), and a long press locked the gesture so the drag after it did nothing. A third context turns the phone **sideways** (851×393), because landscape is not a tweak of portrait — every assumption inverts. Portrait spends horizontal space freely (full-width sheets) and hoards vertical (a button column up the edge); turned, 292px of column does not fit above the squadbar on a 393px-tall screen and a map sized off `100vw` is taller than the screen it is on. So the landscape pass checks the arrangement rather than the styling: touch mode survives the turn, the renderer's aspect follows it (which is what `orientationchange` re-fitting is for — `resize` alone fires before iOS has settled the layout and sizes the canvas to the shape the phone just stopped being), nothing chrome-level hangs off, every target is still 44px, an open sheet covers *a third* of the screen rather than most of it, the map is square off the short side, and the attack button still arms. Its clipping check deliberately excludes anything inside a scrolling panel: a stat row below the fold of the character sheet is scrolled, not clipped, and a first pass counted six of those and called the layout broken. It also drives the two controls added after the first round of real-device play: the **MAP** button (one tap, big enough to read, on screen, and mutually exclusive with the other sheets — it was hidden on touch and reachable only through the gear menu) and the **ATK** button (arm it and tap a body for an attack order, or open ground for an advance-and-fight; a hold cannot do this because the hit test resolves against the ground plane and there is no `A` key on a phone). The attack assertions go the long way round on purpose: there is no `worldToScreen` in the game, so the target is placed by converting a known-open SCREEN point back to the world with `screenToWorld`, which also means the tap is a real `TouchEvent` through the real gesture layer rather than a synthesised mouse event. It also checks the topbar shrank, the gear carries what came out of it, the sheet cycle shows one thing at a time, and — by drawing each control's glyph to a canvas and comparing it against a private-use code point nothing has — that no button is rendering as a tofu box. It cost five false alarms of its own, all of them mine and all now written into the file: `offsetParent` is null for *any* fixed-position element; taps aimed at a character's head miss because the hit test raycasts to the ground plane; a CDP round-trip in this environment takes longer than the 460ms hold threshold, so every "tap" arrived as a hold; the panel-cycle assertion counted two sheets after the log became a third; and the first glyph check measured advance width against `M` and flagged the hamburger, which renders perfectly well and simply falls back to another font. |
| `mobile.js` | What a frame costs and whether a phone could hold it: triangles submitted and **which mesh they belong to**, draw calls, save size against a mobile storage budget, how many touch targets are under 44px, and what falls off a 393px screen. **The frame rate it can report at a phone viewport is not a phone prediction** — everything here is SwiftShader, software rasterisation with no GPU, orders of magnitude slower than any handset. Quote the triangle and call counts, which are device-independent; never the fps. It overturned the plan it was written for on its first run: the obvious suspect for a two-million-triangle frame was six hundred characters, and characters turned out to be **0.6% of it** — 367 triangles a body — while half the frame was the fog overlay, a single sheet with a vertex every two tiles across the whole world. It then found the opposite is true of draw calls: characters are 1.2% of the triangles and **91% of the calls**, at 28 separate meshes a body. |
| `simcost.js` | Isolated `update()` cost plus a 20-second soak. The primary perf number. |
| `bench.js` | Fuller picture: draw calls, scene objects, shadow casters, micro-costs for the hot paths, autosave size, and a dyn-group leak check. Writes a JSON file per label. |

### Visual

| harness | what it renders |
|---|---|
| `wep3.js` | One character holding one weapon, close. `node tools/wep3.js w_nod out.png` |
| `swing.js` | A swing, frame by frame, as a contact sheet — one row per weapon so a light blade and a heavy one can be read against each other. Animation is the one thing here that cannot be checked with a number, and a pose that looks right in the source can still read as a machine cycling. It steps the sim by hand at a fixed dt so frames are evenly spaced in *sim* time rather than wall time. `node tools/swing.js w_nod,w_kat out.png` |
| `lich.js` | The one authored body in the game, front, back, and mid-stride — and the only harness here that both renders and asserts, because half of what was wrong with the lich was countable and half was not. It writes a four-frame sheet *and* checks that the plain box body is hidden, that the hem reaches the ground, that the head survived, that the legs are frozen, and that the float is actually moving. The counted half found the real bug: the lich hid `e.boxBody`/`boxArm`/`boxLeg` **before** `bakeBoxes()`, which then merges those proxies into fresh visible meshes and reassigns the arrays — so every flag was thrown away and the plain body had been showing straight through the robe the whole time, as a purple slab across the shoulders and another at the waist. The uncounted half needed the picture: the first rebuild came back a flat mid-purple because a Lambert surface under this sky lifts a dark colour by better than two stops, and the mantle ended *inside* the shoulder joints at spine-local ±0.31, so the sleeves hung off nothing and the top half read as slabs bolted to a post. `node tools/lich.js out.png` |
| `kit.js` | The three authored assets that arrived after the named origins, and the only harness in the suite that also produces pictures — because "the lance is the size of a pen", "the helmet looks awful" and "use his own head when he ascends" are judgements about a picture and cannot be asserted into existence. It writes four sheets (Lyonart living and ascended beside a robed Deathless, the redoubt helm against a box head and a sculpt, the same row cropped to a head band, and the Aether Lance carried and levelled beside a nodachi) and then asserts the claims underneath them: the lance out-reaches its wielder and beats a nodachi by 1.6x; it stands upright when carried (dir.y 1.00) and comes level when firing (dir.y -0.01) and those are genuinely two poses; no other weapon grew an aim pose; the helm is as wide as it is deep and sits over a 0.31 box head; Lyonart ascends into his own head while keeping legs, torso and coat, and his mesh key moves so a body already on screen is rebuilt; and a lich with no name of its own still arrives in the robe with no legs under it. Fails eight ways on the build before this. Its own traps are written into the file: a body faces what it is shooting at, so setting `c.target = c` merely to trip the firing state pins it to `atan2(0,0)` and photographs the levelled lance end-on, which is a dot; and the numbers block ran after the sheets had emptied `chars`, so it read a position off a squad that no longer existed. |
| `heads.js` | The three sculpted heads, close enough to judge, plus the assertions that go with them: that a sculpt is attached at all, that **nothing of the box head survives under it**, and how big it ended up. A baked asset has four ways to be wrong and every one of them is invisible at body distance — scale, height on the neck, which way it faces, and whether the head it replaced was actually hidden. It renders through a camera of its own rather than the game's: `focusY` is ground plus 0.8 and there is no dial for it, so a head at 1.8 projects twelve pixels from the top of the frame whatever you do with distance or pitch, and three separate attempts at hand-picked crops all photographed the belt. It also measures the SKIN, because "her face looks awful, like an old grandma with those heavy lines" is a real complaint that a picture cannot make in a suite — the eye is not in the chain. Not global contrast, which is the obvious number and the wrong one: most of a pale head's spread is hair against skin, large-scale shading that has to stay, and a sweep against it plateaued while the creases were still there. What a painted wrinkle IS, precisely, is a vertex sitting far from the ones touching it, so that is what gets read — as a **ratio against Lyonart**, the face the note named, with Saga exempted by name rather than by widening the bound until it catches nothing. Alongside it: that Lyre still has her red irises, 38 vertices out of 2,004 that a heavier smoothing pass would delete without anything else noticing. `node tools/heads.js out.png` |
| `bakehead.js` | Not a test — the importer. Turns a `.glb` into the base64 blocks the one HTML file carries, because an asset that lives next to the document does not exist as far as this project is concerned. **The first version simplified by vertex clustering and melted the faces**, and the lesson is worth keeping: clustering quantises vertices to a grid and replaces each cell with the average of what fell in it, which is fine for a rock and wrong for a face — a nostril, a lip edge and an eyelid are all sub-cell features, so each is replaced by the mean of itself and the flat skin beside it and every crease goes at once. The budget was never the problem; 3,000 triangles is more than a whole Quake character had. It uses **quadric error metrics** now (Garland & Heckbert): flat cheeks are cheap and go first, the ridge of a nose is expensive and survives. Three additions beyond stock QEM, each forced by these particular models — **weld first**, because a textured export splits vertices along every UV seam (Saga arrives as 14,834 vertices describing 5,004 points, and a doubled edge is never a shared edge, so half the mesh reads as boundary and refuses to simplify); **hold the boundary**, with a perpendicular plane quadric on every one-face edge, or an open rim erodes inward and the head grows holes; and **colour is a feature**, because an eyebrow is nearly flat and QEM would collapse straight through it, so the cost carries a term for albedo distance. Plus a flip *and sliver* rejection — a triangle left too thin to shade is what put shards across Saga's cheek on the first quadric pass. Budgets are per head (`key=file.glb:7000`) because QEM spends triangles where the curvature is and hair is nothing but curvature: on a model whose hair is half the mesh, the face starves at a budget that suits a smoother head. It samples the base-colour map bilinearly at full resolution into vertex colours (there is no texture path in this renderer), converts sRGB to linear on the way — not optional; `outputEncoding` is sRGB and this three build treats material colour as linear, so the bake that skipped it produced three heads the colour of paper — and normalises into a unit box so `HEADFIT` means rig units. Normals are not stored; they are recomputed at load, which is a quarter of the vertex payload. `node tools/bakehead.js key=head.glb[:tris] ...` |
| `faces.js` | The named origins, front and back, in one row. `origin.js` will happily report THE PRINCE IS WHOLE while he stands there in the default hash-rolled body, because every assertion in it is about state — this is the only way to check the claim "long white hair and a dusty black coat" instead of asserting it. Four things it caught that reading the source did not: the faction blue showing through every gap in the trim (a named body has to replace `bodyCol`, not paint over it), the worn armour drawing on top of the coat in its own palette, white hair on a pale face reading as one featureless block until a dark hairline and a fringe were put between them, and both heads of hair reading as *hats* — a wide slab resting on the crown with a level edge all the way round is a cap, and no amount of colour fixes it. `node tools/faces.js out.png` |
| `lines.js` | Every line of one race side by side, front and from behind, one column each. Written to answer "do the subraces have proper skins" by looking instead of by reading the table, and the answer on the first run was no: four golems came back as **one man in one blue shirt**, because a line's colour only ever reached the head and hands while the torso took `bodyCol` — the faction colour standing in for clothing — and the geometry underneath was the same rig every time. It found the second layer too, after the torsos were fixed: the four were still wearing dark brown work trousers, which is the single detail that gives away a thing poured out of clay as a man in a costume. Uses the cloned-camera trick from `heads.js` and frames off each body's own bounding box, so **relative size cannot be judged here** — a rock golem's `big:1.22` is normalised away. `node tools/lines.js golem out.png` |
| `wyrmpix.js` | **Visual.** The wyrm beside a MAN, four angles, plus the wing close. The man is the whole instrument: "bigger" is a comparison and a lone animal on an empty plain fills whatever frame you give it and reads the same at any size in the file — which is how it went ten tiles long while standing exactly as tall as a grazer. It stages the animal by copying `big` off a LIVE wyrm rather than rebuilding one, after a first run photographed a hand-made body at `big` 1.0 and produced four pictures of an animal that is not in the game; `wyrm.js` had the same drift hard-coded at 2.6 against a spawner that sets 2.2. Bounding boxes are taken over meshes only — `setFromObject` swallows the nameplate sprite and put a man at 2.12 tall and 1.0 across, neither of which is the man. `node tools/wyrmpix.js [outdir]` |
| `under.js` | Whether there is anything under the rest of the map. The assertions are about **extent and reach** because that is what the report is about — 1.7% of the world was within forty tiles of a cave mouth, which is not a feature with a problem, it is the size of the feature. Extent is **sampled over the map** rather than counted over the generator: stand anywhere and ask what is beneath you. The load-bearing one is `andItIsOnePlace` — a generator that scatters eighty halls and joins none of them scores identically on extent, on tile count and on every picture, and is eighty rooms you can never walk between, so it floods from one tile and counts what the flood reaches. Two probes were tightened after the A/B showed them green on the old build: the flood's denominator could exceed 100% (the dig's counter skips tiles the warrens had already decked), and "the warrens hang off it" originally asked whether any storey-F tile sat near a mouth, which is true of every warren that ever existed. The control is the one that matters most: `floorY` is read by every storey in the game, so it asserts a rampart is still one storey up. |
| `ccpix.js` | **Visual, and a ruler.** The start screen at the three sizes it is read at, with the numbers that back the words: overlay height against viewport, smallest text, option count, and whether the button that starts the game is below the fold. A layout complaint cannot be answered from the source, and "jank" turned out to understate it — 912px of overlay in an 800px viewport, twenty-five options at once, and WAKE UP off the bottom of the screen on desktop, laptop AND phone. `node tools/ccpix.js [outdir]` |
| `underpix.js` | **Visual.** The headframe from the surface and from a field away, the hall under it, and a tunnel. Two things no assertion answers: whether a tunnel reads as a tunnel rather than a grey path floating in the dark, and whether the way DOWN is visible from a distance — a shaft nobody can see is a feature nobody finds. It cost three staging bugs to get a picture of the right place, all of them in the probe: `camSX/camSY` is where the camera IS and `camX/camY` is only what it is aiming at (eighty tiles apart while the view moves), and the camera's vertical anchor follows the SELECTION, not `activeFloor` — so a probe that moves bodies underground without selecting any of them photographs the surface, correctly, and looks exactly like a renderer that does not work. `node tools/underpix.js [outdir]` |
| `kin.js` | Whether you can ever actually hire a Mimic, and the two with names. The first half is a **rate taken over the boards the game builds**, not over the function in isolation — `makeRecruit` could pay any number you like and the player would still be reading six lists of five, which is what decides whether the race exists for them. It was one across every bar in the world at a time. The A/B turned up a bug nobody had reported: 11 of 12 recruits from a line that FIXES its sex came out the wrong one, so bars were offering male succubi and female Fallen. For Albedo and Rubido the assertion that matters is not that they exist, it is that their gates can be **reached** — a wanderer you can never take is scenery with a name — so each gets two: shut on a fresh world, and open once the condition it names is true, with the condition produced the way the game produces it rather than by setting the flag. |
| `mimicpix.js` | **Visual.** The three Mimic lines, close enough to judge — four sheets: the bodies BARE, the heads large, the succubus across all six hides her line can come in, and the three of them at the camera you actually play at. `lines.js` answers the general question and gets three things wrong for this one: it dresses the body (a helmet hides the entire head, which on a succubus is the whole of what anybody is tuning), it frames the whole body so a face is forty pixels across, and it builds one body per line so a palette of six shows exactly one. The last sheet is the one that argues: at play distance the three lines are nearly the same silhouette in the same blue shirt, and the horns are the only tell. `node tools/mimicpix.js [outdir]` |
| `town.js` | A town from above. `node tools/town.js out.png <townIndex>` |

## Notes

- `update()` takes a `dt`. Calling it bare sends NaN through every position in the world and
  the first symptom is an unrelated-looking throw out of the audio envelope.
- `syncChars` builds a bounded number of character meshes per frame, so a probe that spawns
  test characters has to wait several seconds, or clear `chars` first, before the meshes exist.
- Worldgen is seeded from a constant, so repeat runs are identical. That proves determinism,
  not robustness — vary the seed to test that, with `?seed=N` on the URL. `wanderers.js` is the
  one that does: a thing which must exist in EVERY world is exactly the thing a single fixed
  world cannot tell you anything about.
- `camX`/`camY` are the look-at point, not the camera position.
- **Assert against the code under test, not against something that resembles it.** The skeleton
  mage could not be given a stance because the panel's stance row asked `c.undead && !c.lich`
  while every other row beside it asked `mindedDead`. The first check written for that asserted
  `mindedDead(mage)` — which was true the whole time, on the broken build as well — and passed.
  The only version that catches it opens the panel on a real mage and counts the buttons in the
  DOM. A proxy for the expression you are fixing is how the bug got there.
- **A signature that mixes shape and colour will pass on the same body in four tints.** The
  first uniqueness check in `races.js` stamped each line as triangles + bounding box + a hash
  of its vertex colours, and reported all four golems distinct while they were provably the
  identical rig — because each line's *skin* colour differed, and that was enough to separate
  the stamps. Shape has to be compared on its own. At the distance this camera sits at, a tint
  is not a character.
- **Two top-level `function foo` declarations in one classic script do not collide loudly —
  the later one silently wins.** The closing-rite work added a `riteTick`, and the Last Rite
  already had one eleven hundred lines further down. Nothing threw, nothing warned: the new
  tick was dead code, and the `riteTick(dt)` added to `update()` was advancing the *ascension*
  rite a second time every frame. In a single file of this size, grep the name before you
  define it — and prefer a name that says which system it belongs to (`closingTick`, not
  `riteTick`). A probe that had asserted on the new mechanic alone would have caught the dead
  half and missed the double-tick entirely.
- **A click probe that aims at head height misses the branches under test.** `w2s(x, y,
  groundY + 0.9)` projects a point *above* somebody, and `screenToWorld` maps it back to ground
  roughly 0.9 tiles PAST them — which is just outside the two 0.9-tile radii that the NPC
  right-click branches use. The talk probe passed on a build where a dead-centre click on a
  scholar did nothing at all, because it had never once clicked dead centre. Project at
  `groundY + 0.05` and assert on the round-tripped distance, so the aim cannot drift back.
- **A click handler is a chain of `find`s, and every one of them is right about what it
  matches.** Three separate branches all correctly matched a scholar within 0.9 tiles — the
  generic townsperson menu, then (after excluding scholars from that one) the `foe` check,
  which answered "they are not hostile" and did nothing. Excluding a case from one branch just
  hands the click to the next. Order by SPECIFICITY: the most specific thing you could have
  meant goes first, with the deliberate overrides (ctrl to force, a body underfoot) above it.
- **An order that completes is an order that is gone.** `touch.js` armed attack-move and tapped
  the same screen point the unit had just been walked to, then read `me.attackMove` 400ms later
  — and on a loaded machine they sometimes arrived first and cleared it. It passed alone and
  failed inside `npm run check`, which is the signature of this every time. Set `paused` around
  the assertion. The obvious alternative — move the actor out of range — fixed that assertion
  and broke the *next* one, because the long-press test after it shares the same screen point
  and wants somebody standing near it. Stop the clock; do not move the furniture.
- **`findOpenNear` is sixty random darts inside a box, not the nearest open tile.** It is right
  for scattering a camp and wrong anywhere the placement is a PROMISE — it can return a spot
  most of the radius away, and it returns a *different* one whenever anything upstream consumes
  a different number of random values. Czarina "starts beside him" held for months and broke the
  day six wanderers were added three hundred lines earlier. Use `findAdjacent` (a deterministic
  ring search) when the position is part of the design rather than set dressing.
- **`Box3.setFromObject` is world-space, and world space carries both the body's POSITION and
  its SCALE into every geometry assertion.** Two harnesses shipped with this bug and both broke
  on the same day, for the same reason — a new spawn upstream moved the worldgen RNG along.
  `lich.js` checked the robe's hem reached the ground with `lo < 0.06` on an absolute Y, which
  is the hem height *plus* `groundY(c.x, c.y)`; it was measuring the hill under the lich.
  `wepsoak.js` measured the Sundering Edge's length off the same kind of box, which is the
  blade *times* whatever body `makeChar` rolled — a chimera is a few percent bigger than a
  human, and 1.41 became 1.49 against a 1.45 ceiling. Subtract `getWorldPosition` for anything
  positional and divide by `getWorldScale` for anything dimensional; never assert on raw world
  coordinates.
- **`charsNear` hands back one shared scratch array, and anything that damages inside the loop
  refills it.** `_nearOut` is module-level and reused by every caller, so a loop over
  `charsNear(...)` that calls `applyDamage` — which calls `charsNear` again — is walking a list
  that empties itself mid-iteration. The Wisp's death burst took nothing off a bystander one
  tile away for exactly this reason. `.slice()` before iterating whenever the body of the loop
  can reach the sim.
- **`blood` is the bleed-out pool, not a health bar.** A blow lands on `parts[k].hp` and adds
  `bleed`; `blood` only drains on the bleeding tick. A probe that measures `blood` immediately
  after `applyDamage` sees no change and reports the damage never happened — which is how the
  Wisp burst read as broken while it was taking thirty-five points off a chest. Sum
  `blood + parts` (as `axes.js` does) to measure a hit.
- **The on-screen log keeps only its last seven lines.** `log()` trims `logEl` down to seven
  children on every call, so counting `div`s in the DOM to prove a change did not spam the log
  reports "quiet" no matter how loud it was. The first version of the `chores.js` run-quietness
  check did exactly that and reported *zero* lines for a run that logs one. Count `chronicle`
  instead — it is the uncapped record, and it is what the player can actually scroll back to.
- An animator can overwrite what a body was built with. The tail lift is set every frame from
  a constant written for the scaleborn, so a hound's tail built to hang came out held straight
  behind it; the fix was to let the body name the number (`e.tailLift`), not to change the
  pose at build time. Anything the animator drives each frame — cape lift, tail lift, the
  frozen legs on the lich — has to be parameterised there, not set once in the mesh builder.
- **A field `restore` reads is not a field `snapshot` writes.** `restore` had `c.kin = s.kin || null`
  and `sChar` never wrote `kin` at all, so it silently resolved to null on every load and every
  risen came back as the generic rig. Nothing throws, nothing warns, and the two lines are nine
  thousand apart. When you add a property that a body carries across a save, grep for it in
  *both* halves — and prefer a probe that reads the snapshot object itself
  (`snap.chars.find(...).kin`) over one that only checks the world after a restore, because the
  latter passes if the field happens to be recomputed somewhere else.
- **`restore` rebuilds the collision map from `baseBlocked` but not the arrays that describe
  it.** Anything the world generates and play can destroy — town walls are the case that bit —
  has to be snapshotted at worldgen time and rebuilt from that snapshot on load, or the restore
  is one-way: it can delete a wall and never put one back, and the ring and `blocked` drift
  apart into segments that are invisible and still solid. A load must be idempotent; loading
  the same save twice must land in the same place as loading it once, and `walls.js` asserts
  exactly that.
- **A "this save doesn't match this world" guard has to be measured against the SAVE, not the
  live world.** The wall guard bailed when fewer than half the *generated* ring's coordinates
  appeared in the save, which is indistinguishable from a town that legitimately lost most of
  its wall to a siege — so the worst-damaged towns were the ones that silently got their walls
  back. Compare matches against the saved set's own size, and keep a probe for both directions:
  a real siege must survive, and a save from another worldgen must still be refused.
- **A living body is not a fixed yardstick.** `baseSY` is a coin-flip on sex plus a hash of the
  id, so a male dustborn stands about 10% taller than a female one, and `player()[0]` is
  whoever worldgen rolled. `notes.js` compared the servitor's floating skull against the first
  crew member's head in absolute metres; six new wanderers upstream moved the RNG, the roll came
  up male instead of female, and the reference head rose from 1.65 to 1.82 while the skull sat
  exactly where it always had. The harness went red and the game was fine. When you need a
  human-scale reference, divide it by that body's own `getWorldScale` so you are comparing
  against a canonical build — the same discipline `lich.js` and `wepsoak.js` already needed.
- **The baker normalises a model on its LONGEST axis, and that is often not the one you mean.**
  The alchemy helm arrives 0.709 wide by 0.768 tall by 1.000 deep, so a uniform scale that puts
  it at head width leaves it half again as deep as the head — a helmet that is too narrow from
  the front and too long from the side at the same time, from one number. Anything whose depth
  and width should match needs per-axis multipliers (`sx/sy/sz` on `HELMFIT`), and the check is
  `|w - d|`, not either one alone.
- **A rotation that looks right in one stance points somewhere else in the other.** The Aether
  Lance's `rx:80.2` was measured against the braced firing pose, where it reads as levelled;
  with the arm hanging at rest the same number aims the muzzle into the dirt, and because the
  weapon had only one pose nobody saw the second case for what it was. When a fit angle is
  measured, measure it *in each stance it will be seen in* — drive the sim into that state and
  read the weapon's world-space direction vector, rather than reading the local Euler and
  reasoning about it.
- **`c.target` drives which way a body faces.** `want = atan2(target.x - c.x, target.y - c.y)`,
  so a probe that sets `c.target = c` just to trip a firing branch also pins the body to
  `atan2(0, 0)` — facing zero, every time, whatever you then write to `e.rotY`. Give it a real
  mark standing off camera instead; the facing is then the one the game would have chosen.
- **This file is one enormous block comment away from not parsing.** The fit tables are
  documented in long `/* ... */` prose blocks sitting directly above the line they describe, so
  an edit anchored on the code line — `w_lance: {key:...` — inserts new prose AFTER the comment
  closed, and 1.8 MB of valid JavaScript becomes `SYNTAX ERROR: Unexpected identifier`. It
  happened three times in one sitting on the same table. Anchor on the `*/` when you mean to
  extend a comment, anchor on the code when you mean to precede it, and let `node tools/prep.js`
  be the thing that tells you which one you did — it syntax-checks the main script block and
  refuses to write, which is why this class of mistake never reaches a harness.
- **The worst bugs are starvations, and no probe that spawns what it needs will ever see one.**
  Five reports came back from one playthrough — dust hounds gone, iron unbuyable, the Cairn
  Beast never met, the log unreadable, the bound resigning — and every existing harness passed
  on all five, because a harness spawns exactly what it wants to measure and measures it a
  second later. The bugs lived in the gap between systems over hours of world time: one shared
  spawn ceiling that outlaws silt up until the animals can never come back; a commodity with a
  consumer and no producer; a creature 515 tiles away announced by news that named no place.
  `world.js` is the answer to that class — it runs `update()` forward for twelve game-days and
  then asks what is still in the world.
- **A long-run assertion can pass on the broken build and prove nothing.** The first version of
  the dust-hound check counted animals after twelve days and reported 27 alive — on the fixed
  build AND the broken one, because extinction takes longer than that. Counting the symptom was
  useless; the fix was to test the RULE. Once the outlaws alone are past the old shared ceiling
  (they reach thirty by day twelve unaided), kill every animal and run four thousand more ticks:
  the old build respawns exactly zero, the new one refills to eight. When a bug is a starvation,
  starve it deliberately rather than waiting for the world to do it.
- **Uncovered canvas is not the same as open ground.** `touch.js` found a tap point by asking
  `document.elementFromPoint` for something whose id is `game`, which proves only that no HUD
  div is in the way. The click handler is a chain of `find`s ordered by specificity, and a
  townsperson within 0.9 tiles wins the tap long before the move order is reached — so a point
  that is plainly canvas can still produce no order at all. It went red when an upstream change
  added twenty-one `ri()` draws to worldgen (three per town, seven towns), every roll after them
  shifted, and one civilian moved from 1.0 tiles away to 0.6. The game was correct in both
  worlds. Resolve a screen point to the WORLD and assert the ground there is empty, and note
  that **any new `ri()`/`rnd()` call at worldgen moves every body placed after it** — that is
  now three separate harnesses broken by the same mechanism.
- **Widening an exclusion zone deletes whatever was placed just outside the old one.** Clearing
  decor out to the town wall (15 tiles to 28) was two lines and looked self-contained. It also
  silently destroyed both mining towns' ore: the rich seam is centred 13 tiles from the town
  with a radius of 15-17, which cleared the old sweep by a whisker and sits wholly inside the
  new one, so `findNode` came back NONE for iron from every town in the world. Nothing threw and
  no existing harness noticed. When a radius grows, go and look at everything positioned
  relative to the old one — the fix here was to push the seam out past the wall, where a pit
  belongs anyway, which ended up leaving MORE iron in the world than before (80 vein tiles to
  114) because the seam now lands on ground that is not swept.
- **While a probe is `await`ing, the game is still running in real time.** `wanderers.js` drove
  its own walk with explicit `physics()` calls and looked deterministic, but every step was
  separated by an `await frame()` — and how far the world moves across one of those depends
  entirely on how busy the machine is. It passed three times out of three run alone and failed
  twice inside `npm run check`, because under load a second scholar drifted into the click
  radius between the order and the arrival and the panel opened on the wrong person. That
  signature — green alone, red in the suite, same build both times — is a wall-clock dependency
  and never a real bug. Set `paused = true` for any probe that drives the sim itself; it costs
  such a probe nothing and removes the whole class.
- **A balance number belongs in the output, not always in the pass/fail.** `host.js` prints the
  host-versus-garrison exchange rate as `WATCH_` lines rather than asserting on it, because the
  change it was written alongside (upkeep) is an economy lever and was never going to move that
  number. Failing the suite on a value the current work is not trying to change would make the
  suite lie about what is broken; leaving it unmeasured would lose it. Print it, name it a
  watch, and promote it to an assertion when something is actually aimed at it.
- **A stat can be two stats wearing one name.** `atk` decides whether a blow lands *and*
  multiplies how hard it lands (`d *= 1 + atk * 0.03`). For anything the world spawns that is
  harmless, because their atk is a constant — but `craftUndead` scaled both the claw and the
  atk off the necromancer's magic, so bound damage came out as a product of two linear terms.
  Quadratic, with the two halves four thousand lines apart, and neither line wrong on its own.
  When auditing a scaling system, follow every stat it touches all the way to where the damage
  is finally computed; reading the stat line and stopping is how an earlier pass called this
  curve "linear".
- **Behaviour keyed to an item's NAME breaks the second item of that kind.** The archer draw —
  bow arm locked, string hand back to the jaw — was gated on
  `(wI.tierOf || c.weapon) === 'w_bow'`. Adding a second bow silently dropped it into the `gun`
  branch and gave it the braced crossbow crouch, which is a different weapon entirely, with
  nothing thrown and nothing logged. Gate on a property (`wI.bow`), not on a key, and when
  adding a variant of an existing thing, grep for its key before assuming the systems around it
  are generic.
- **Counting meshes on a baked rig counts buckets, not detail.** `raise.js` first asked whether
  an undead quadruped had more BOXES than a live one, to prove the new ribcage was really being
  built. It reported the same number for both, because `bakeBoxes` merges every `obox` proxy
  into a handful of vertex-coloured buckets before the mesh is returned — so a solid slab and a
  twenty-bar ribcage are both "two meshes". Count `geometry.attributes.position.count` instead.
  The same trap is waiting for anything that tries to measure a rig by object count.
- **A ceiling passed as an argument is not a ceiling.** `castRaise` computes
  `atk: Math.min(4 + m*0.7, bs.atk)` — "a corpse is never stronger dead than it was in life" —
  and hands it to `makeChar`, which then adds the flat bonuses of whatever subrace it rolled for
  the new body. An Ironscar-bred roll is +3 atk over the stated clamp. Nothing was wrong on
  either side: `makeChar` adding the line's worth to a caller's number is deliberate and
  documented. Clamps have to land AFTER construction, or they are suggestions.
- **A build-time fallback does not survive a save.** The beast rig picks its body with
  `const K = c.kin || (c.mule ? 'mule' : 'hound')`, so a pack mule with no `kin` renders
  correctly forever — until something copies the body and copies `kin` (null) without copying
  `mule`. Resolve a fallback at the point the object is CREATED, not at the point it is drawn,
  whenever the field rides the save.
- **Two gates on the same feature, in two places, both saying `&& !c.undead`.** The chimera
  geometry looked like one block; it is two — the scaleborn rig and the general line rig — and
  both excluded the dead. The bug read as "a raised chimera loses its `kin`", and a whole
  session could have gone into the cache key and the `kin` table without touching the cause.
  Before theorising about why a feature is missing on some bodies, grep for the flag that
  turns it on and count how many places test it.
- **A feature that works in a quiet camp and never in a fight is a race, not a wiring fault.**
  The gunnery job read as correctly wired end to end — job key, `emplGunner`, `emplacementTick`,
  all consistent — and did nothing in play. Three staged orders separated it: assign the job in
  a quiet camp and the crew mans the turret in eight seconds; man it first and then raid, and it
  fires nine bolts; raid first and then assign, and the crew is stolen by target acquisition on
  the walk and never arrives. Only the third is the order a player uses. When a system "does
  nothing" but reads correctly, vary the ORDER of the setup, not the setup.
- **`render()` assigns state that `update()` does not.** `activeFloor` is set from
  `selected[0].floor` inside `render()` and nowhere else, so a `paused = true` probe that only
  steps `update()` reads 0 forever. The first `descend.js` reported a camera bug that does not
  exist. Before asserting that a display value is wrong, check which loop writes it.
- **`deck` and `blocked` are two different questions.** Decking a tile says "there is something
  to stand on here"; it does not clear the wall somebody already wrote at the same coordinate.
  Cave stairs were decked and drawn and still solid. Any generator that carves after it walls
  needs one helper that does both, not two calls the reader has to remember to pair.
- **A guard flag can outlive the order that set it.** `onStair` stops a body yo-yoing on a
  stair, and is tested BEFORE `wantFloor` — so a body that lands on a stair keeps the flag and
  silently discards every later order to use it again. Anyone who walked into a cave could never
  leave. When a latch gates an intent, make sure issuing a NEW intent clears the latch.
- **Kill the target before you ask what the weapon can see.** `guns.js` first checked
  `emplTarget` after its run and reported the turret blind; the turret had killed the only
  hostile on the field. Spawn a fresh one — and note `charsNear` reads a grid rebuilt inside
  `update()`, so a body pushed while paused is invisible to it until a tick passes.
- **A give-up timer makes an unrelated assertion lie.** `wanderers.js` walks somebody to a
  scholar and then checks the conversation opened. `talkTarget` carries a 30-second give-up, so
  one townsman standing on the last approach tile ran the clock out, dropped the order without
  opening anything, and the NEXT assertion reported "arriving opened nothing" — for a walk that
  never arrived. Green alone, red in `npm run check`, because the crowd around the scholar
  differs by one body between runs. Two lessons: stage the leg you are testing in the open and
  let a separate assertion cover the crowded case, and when an order can end two ways, have the
  harness say which way it ended rather than inferring it from what happened next.
- **A stale DOM read makes a failure message point at the wrong thing.** The same assertion
  printed the modal's `title()` in its failure text — and the title still held the value from an
  earlier, successful open, because hiding a panel does not clear it. The message read as though
  the right panel was open when the panel was closed. Assert on the thing that changes
  (`display`), and do not quote a field that persists across the state you are reporting.
- **A flaky harness is a hypothesis, not a verdict.** `descend.js` passed a full suite and failed
  the next one on the same file, which is the shape of a load flake and was not one. `useStairs`
  set its anti-yo-yo latch (`onStair`) BEFORE checking whether the body was trying to change
  floors at all — so a body that merely stood on a stair tile latched itself, and if it never
  stepped off, every later order to descend was read and discarded. It only bites when the
  arrival lands on a tick where `wantFloor` is not set yet, which is why it came and went.
- **A boolean where an identity belongs is a wider rule than the one you meant.** Two branches
  fixed that latch independently and the difference between the two answers is the lesson. Moving
  the latch to where the crossing happens is correct and passes every test, including a stair
  standing next to a stair — a stair that refuses the crossing never reaches the latch. But
  `onStair = true` still means "do not use ANY stair until you have stood on ordinary ground
  again", so after a REAL crossing it goes on blocking the stair next door, and a cave mouth
  very often has one. Remembering WHICH stair (`onStair = st`) says the thing that was actually
  meant — no bouncing on the one under your feet, a different stair is a different door — and is
  strictly stronger. When two fixes both go green, ask which one states the rule.
- **A rebuild is where a geometric guarantee goes missing.** Both helms moved from baked meshes
  to boxes, and `e.helm` — the thing two harnesses measured — stopped existing. The temptation
  is to delete the assertions along with the mesh. What they were about (square, bigger than the
  skull, one helmet per garrison) survives the rebuild perfectly well; only the handle changed,
  to `e.helmParts`. Move the claim to the new handle. One claim genuinely changed in KIND and
  says so in the file: a baked helm REPLACED the head, a built one COVERS it, so "nothing shows
  through" became "does it enclose the skull".
- **Snapshot the moment you are making a claim about.** `curse.js` asserts that Malathuun's
  Curse arrives "not fully grown but not nascent either" — and read the beast's size at the END
  of a four-day run, by which time it had eaten the ninety corpses that summoned it and stood at
  7.1x against a ceiling of 8. It read 3.6x the first time only because that run happened to end
  before it finished its meal. The probe was measuring the appetite, not the arrival. If the
  claim is about a moment, step the world and catch that moment; the growth afterwards is a
  second, separate assertion — and worth having, since it is the thing that broke the first one.
  **And the fix went in for the size and not for the tile, which is the same fault twice in one
  block.** "It rose from sundered ground" is also a claim about a moment; the probe read the
  beast's position after four more game days of it hunting and reported 26 tiles from the
  nearest site for a thing that is spawned ON a site by construction. It went red on a change to
  how bodies walk to a fight — which moved the beast and touched nothing about the rite. When you
  find one assertion reading the wrong moment, check its neighbours in the same block: they were
  written by the same hand on the same afternoon.
- **A threshold pinned to one build's exact arrangement fails on the next unrelated change.**
  `press.js` asserted that no more than THREE of twelve bodies end up in one eighth of the
  circle, because the build in front of it measured two. Three revisions later the same fixed
  behaviour measured 2, 3 and 4 while the number that actually matters — sides occupied — went
  6, 7, 7. The assertion went red for a lance change that had nothing to do with flanking. Set
  the line where it SEPARATES the bug from the fix (the queue puts seven there) and leave room,
  rather than where the current build happens to sit.
- **`R.x = 'some string'` is not an assertion.** `gunnery.js` carried
  `R.andItSpendsNoCells = 'the emplacement runs off the camp...'` — a hardcoded sentence with no
  reading behind it, printing a green line forever and testing nothing. It survived a rewrite of
  the thing it claimed to describe. If a line cannot fail, delete it or give it a number.
- **Measure a rule only where the rule applies.** `press.js` asserts that a body holding a bow
  does not shoot inside 1.7 tiles, and the first version counted every draw over the whole run:
  24 violations, for a body that never once loosed inside its own guard. `separate()` pushes
  hostile bodies apart and keeps shoving, so a probe staged in contact drifts back out past the
  threshold and is then perfectly entitled to shoot. The assertion was measuring the separation.
  Sample the condition and the rule in the same tick.
- **A harness going red after an unrelated change is sometimes the harness finding your
  backlog.** `guns.js` failed after a combat-AI commit that had nothing to do with lances. It
  was not flake and not the commit: the new timing walked the lancer into a documented dead end
  — inside 1.7 tiles it would not shoot, and it never reached the melee branch to swing — that
  had been filed twice in the To Do and never hit. Before blaming the change or the harness,
  read what state the probe actually ended in.
- **When a duration comes in under what the constants allow, the feature is not what broke.**
  `rites.js` reported "AT MAGIC 150 THE RITE IS OVER IN 39s" on a build whose `RITE_WORK` (120)
  and rate cap (2.0) were byte for byte the ones that measured 60s the day before. 120 at a hard
  cap of 2.0 is sixty seconds and cannot be thirty-nine — so the rite was not finishing early, it
  was ENDING SOME OTHER WAY (`collapseRite`, because summons crowding the ring shoved the
  ritualist off their own circle). Do the arithmetic on the constants first: it tells you whether
  you are hunting a slower feature or a different exit, and those are different searches.
- **Pin everything the probe calls fixed, not just the half you remembered.** The same harness
  declared the ritualist "rooted and defenceless by design" and pinned their STATE and limbs
  every tick — but not their TILE, which is the one the collapse rule actually reads. It was
  measuring a rite that had been pushed out from under its own caster. If a comment says a body
  is held still, hold all of it.
- **A single shot is not a measurement.** Both lance-damage assertions in this repo rode on one
  roll, and both have now been widened after each duly went red on a build that was working.
  `guns.js` fired exactly ONCE inside its window: it landed on two worldgen streams and missed
  on a third, which reads as "THE LANCE DOES NO DAMAGE IN PLAY" and is really a coin coming up
  tails. The reason it was one shot is worth keeping, because it was not the rate of fire —
  3.7s at atk 20 means twenty seconds is five shots. It was the raider, which crosses the five
  tiles in about a second and a half, after which a body inside 1.7 tiles makes the lance guard
  instead of shoot: the probe was measuring the opening shot of a fight and then a wrestle.
  **Pin whatever is turning your window into a footrace** — the raider's tile here, the same way
  `rites.js` had to pin the ritualist's. And then pin the second thing: with the raider held
  still the same window fired fourteen times and dealt nothing, because `foe()` hands out a
  tough-40 body and the lance does 44, so the mark was face-down for thirteen of them. A soak at
  tough 400 gives eight shots and 43 blood, repeatable. The assertion now refuses to pass on
  fewer than four shots, so it cannot silently decay back into a coin flip.
  `gunnery.js` watched six seconds, which catches the weapon mid-windup — two
  cells spent for a graze of 0.4 blood, one rounding step from failing on every run, and it duly
  failed one suite run in three. Widened to thirty seconds it is 100 -> 42 on seven cells and
  identical every time. Give the thing room to happen several times; do not re-baseline the
  number it happened to produce once.
- **Widen the window, but keep a control in the same loop.** The fix above is only trustworthy
  because the DRY case runs the identical thirty seconds and still does nothing at all. A longer
  window that makes every case pass has not proved the weapon works — it has proved the window
  is long enough to hide the question.
- **Rounding inside a pass message hides how close it was.** `gunnery.js` printed "the mark
  drops from 100 to 100 blood" as its SUCCESS string, because `Math.round` turned 99.6 into 100.
  The assertion was passing on four tenths of a point and the message gave no hint of it. Print
  enough precision that a near-miss looks like one.
- **Path length, not net displacement.** The first version of `kiting.js` measured `|x - x0|`
  and reported 9.2 tiles for a kite that had in fact run most of forty. A kiting archer walks
  BACK into range between shots, so the two directions cancel and the number flatters the build
  by a factor of four. If the question is "how much ground did that cost", accumulate the ground
  per tick. The same file had the disease in miniature a second time: a case that counted a flat
  1.4 seconds around a shot, including the tiles walked AFTER the loose, when the archer is
  entitled to run — it read 3.7 tiles on the broken build and 2.4 on the fixed one, two numbers
  that were both measuring the wrong thing and looked like the same answer. **Bound the window to
  the event, not to a convenient span around it.**
- **A snapshot of an intermittent state reads as the state being absent.** `kiting.js` sampled
  its melee-grip factor once, two ticks after the order, and got 1.00 for a case the ground
  measurement in the very same run proved was being slowed — the separation pass had shoved the
  two bodies apart that exact frame, and the chase closed again a moment later. A grip that comes
  and goes is still a grip. Take the extreme over the run (here the minimum) rather than the
  value at some arbitrary instant, or the diagnostic will contradict the measurement and one of
  them will be believed.
- **Check the fix against the measurement before keeping it.** The first change written for the
  kiting item was a guard that planted the feet during a windup, from a theory about a seam
  between two functions. It was plausible, it was cheap, and the probe measured it at exactly
  zero: `physics` already enforced that rule, and `ai()` — the function the theory was built on —
  returns immediately for every player unit. It came back out. A change that provably moves no
  number is not free; it is regression risk carried for nothing.
- **A body that is supposed to stand still does not stand still.** `press.js` stages a soak with
  `noFight` and a near-zero speed multiplier and expects it to sit in contact for twelve seconds.
  It wanders, and the separation pass shoves it, and it was out of the measured band inside two
  seconds — so `aBowKeepsItsGuard` counted 88 frames in contact on one build and 18 on the next,
  from a change that touched neither the bow nor the guard, and the threshold sat between the
  two. **The count was measuring how long the staging happened to last, not the rule.** Pinned to
  its tile every tick the same case reads 120 of 120 on both builds. `noFight` is not `nailed to
  the floor`; if the case needs a body held, hold it, the way `kiting.js` and `flank.js` do.
- **A scan nested inside a scan of the same buffer is a silent wrong answer.** `charsNear` hands
  back one module-level array. A proposed grip rule walked the neighbours of a body and, inside
  that loop, asked for the neighbours of each one — which empties the list the outer `for...of`
  is walking and refills it with somebody else's neighbours, so the outer loop finishes over the
  wrong set with no error and no zero. The same class of bug had already been found once, in a
  burst that damaged nobody. Either `.slice()` the outer list, or get the numbers from the pass
  that already walks every close pair — `separate()` here, which is both cheaper and impossible
  to nest wrongly.
- **A green assertion over an empty frame.** `bound.js` reported "every one of the 11 draws
  standing up" on a run where **not one of them had a rig at all**. `syncChars` builds at most
  eight meshes a frame and only walks bodies that are in `chars`, and the probe had spliced its
  own summons out between rites — so `render()` returned cleanly because it had nothing to
  draw, and "no exception" was read as "drew fine". The check that saved it was added on
  suspicion and not after a failure: assert the PRECONDITION your measurement rests on, in the
  same file, so it goes red when the staging stops staging. Anything of the form "X did not
  throw" needs a companion assertion that X ran at all.
- **An exception in a render loop does not come back through your evaluate.** The same file's
  crash surfaces inside `render()`, which the animation loop also calls. A probe that wraps its
  own call in `try/catch` and reports the result will print a clean run while the page throws
  every frame. Read Playwright's `pageerror` channel as well, and fail on it.
- **Fix the contract, not the two things that broke it.** The wisp crash was one pose branch
  helping itself to a jaw that only one of three rigs builds. Naming the two broken rigs in the
  harness would have pinned the symptom; what is asserted instead is that anything posed by the
  float rule carries every part that rule dereferences. The next rig to raise that flag without
  a `sigil` fails on the way in rather than in a player's session.
- **A branch behind a condition that cannot be true is invisible exactly like a missing one.**
  The Soulbound's whole authored mesh — a blank wax figure hung in three turning rings of
  binding — sits inside `if(c.beast)`, and its summon is the one of the three float rigs that
  never sets `beast`. It has never been drawn, and nothing logs, and it went unreported through
  every playthrough because a humanoid rig is a perfectly plausible thing to see. This is the
  second one of these in this repo (the armet was built into the war-automaton branch, which
  `helmKind` refuses). **When an asset looks wrong in play, check that its branch runs before
  checking what it builds.**
- **A budget file is not a "does it work" file, and one can be green while the other would be
  scarlet.** `tools/mobile.js` measures triangles, draw calls, save size and touch-target
  counts at a phone viewport, and it passed every run while the game could not be started on a
  phone at all — because it never opens the start screen and never taps anything, and its
  "mobile UI not started" list is deliberately non-failing so an unfinished port does not block
  every commit. Both of those choices are right for that file. The lesson is that they leave a
  claim uncovered, and the fix is another file that fails, not a louder one that does not.
  **Ask what a green suite would still let you ship.**
- **`locator.tap()` can fail on a page that is working.** Against a canvas repainting every
  frame it reports "visible, enabled and stable", says "done scrolling", and then hangs on its
  own hit-target retry without ever dispatching — while `page.touchscreen.tap()` at the exact
  same coordinate does the job. Reading that timeout as a product bug is the probe blaming the
  game for its own failure. The tempting alternative is worse: a scripted `element.click()`
  bypasses layout entirely and passes just as happily on a button parked off the bottom of the
  screen, which is the very bug under test. Dispatch a real input at a coordinate you derived
  from layout, and assert separately — with `elementFromPoint` — that the coordinate belongs to
  the thing you meant to hit.
- **A media query is not a bigger hammer than source order.** The phone block for the start
  screen was written above the rules it overrides. Same specificity, so the desktop `width:480px`
  won on every phone and the panel went on overflowing exactly as before — with the media query
  right there in the file, plainly correct, and doing nothing.
- **Check what else answers to the selector you just widened.** `.overlay button{width:100%}`
  was written for one button. `.ccopt` is a `<button>` too, so it caught all forty character
  creation chips, turned four wrapped rows into forty stacked ones, and made the panel 1546px
  tall. It scrolled, so the assertion still passed; it was simply awful to use. Numbers a
  harness watches will not tell you that — look at the thing.
- **`click(); waitForTimeout(n)` hands the machine's load a vote.** Almost every file here
  starts the game and then waits a couple of seconds before staging anything, and in that
  window the world RUNS — for however many sim steps the box manages, which is not a fixed
  number and drops sharply when a 51-harness suite is loading it. Every body ends up somewhere
  slightly different and the measurements inherit it. `guns.js` and `flank.js` have both been
  caught by this now: flank returned `worstDetour` 1.67, 1.67, 1.09 and `switches` 1, 1, 0 over
  three runs of ONE unchanged build. The fix is one line — pause in the same evaluate as the
  click, so no frames run between them — and after it, three runs are identical.
  **It bites a case that touches the live world**, which is why the other fifty files have got
  away with it: a probe that stages its own bodies on empty waste and measures only those does
  not care where the townsfolk got to. Four files are frozen (`guns`, `flank`, `mimics`,
  `rightclick`); the rest are not, and the one-line fix is what to reach for the moment one of
  them starts disagreeing with itself.
- **A harness that gives two answers on one md5 is not measuring the build.** `guns.js` passed
  and failed on files that were byte-identical, minutes apart, and five runs of the same file
  split three to two. Every obvious explanation was checked and eliminated — world state, fog,
  and even the PRNG seed were identical at probe start — which is what forced the real one out:
  the RENDERER was drawing from the SIMULATION's generator. `updateDust` spawns motes from
  inside `render()` at frame rate, and `buildCharMesh` rolled a gait offset when a body first
  came into view, so how fast the machine painted and where the camera pointed both advanced
  the world's dice. Measured with the game PAUSED: thirteen `rnd()` calls in two and a half
  seconds of pure drawing. **Before hardening a flaky probe, find out whether the thing it is
  probing is deterministic at all** — otherwise you are tuning thresholds against noise, and
  every threshold in the repo is quietly resting on machine load.
- **Derive it, do not roll it — especially in a function the camera calls.** The gait offset
  only needed to be arbitrary, and `hash2(c.id, …)` is arbitrary without touching the stream.
  It is also strictly better than the roll it replaced: a body that walks out of view and back
  keeps the gait it had, where `rnd()` gave it a new one on every rebuild.
- **When you make one assertion independent of a dice roll, check its neighbours.** `curse.js`
  had already learned that WHICH sundered site answers the Curse is the game's choice, and had
  been fixed to find out afterwards rather than assume — but only the two cache assertions were
  fixed. `andItGoesOnEating` still needed the beast to be standing in the dead, and the dead
  were laid on site[0] only, so it was really asking "did `pick` choose site zero" and passing
  on a margin of ONE body (ate 32 -> 33). Laying a field on every site keeps the game's choice
  free and moves the margin to 32 (ate 32 -> 64). A fix that stops at the assertion that went
  red leaves its siblings loaded.
- **A hidden element still has its children.** `hideCtxMenu` sets `display:none` and leaves the
  markup alone, so a probe that reads `#ctxmenu button` after a click which opened NOTHING gets
  the previous case's entries and cheerfully asserts against them. It reported Lyre's menu,
  complete with her name, for a click on a raider forty tiles away. Ask whether the thing is on
  screen before believing what is inside it.
- **A fall-through can satisfy your assertion from the wrong branch.** The same file checked
  that a medic was ordered to a downed enemy and got a PASS on a build where the menu never
  opened — because the click fell past the branch under test into one two hundred lines below
  that gives the same order without a menu. The state was right and the surface was dead. When
  the complaint is about a surface, assert on the surface.
- **Staging has to survive the settling it needs.** The branch under test requires the tile to
  be visible NOW (`visAt === 2`), which needs real ticks with one of your own bodies standing
  there — and those same ticks stood the downed raider back up, so the click took the ordinary
  attack path. Settle first, then break what you need broken.
- **Assert the limit, not just the feature.** The doppelganger's change-of-form clears every
  bounty in the world, and the case that matters most is the one proving it does NOT clear a
  town's reputation. Without it the ability passes its own tests while being a
  delete-consequences button, and nothing in the suite would ever have said so. When a feature
  removes something, the interesting assertion is usually about what it leaves behind.
- **Ask for the wrong thing on purpose.** `sexOnly` on a line has to beat an explicit `sex`
  passed by the caller, because everywhere else in the game `makeChar` honours that argument.
  A probe that requests a female succubus proves nothing; one that requests a male and gets a
  female proves the rule outranks the caller.
- **A carving inside the shirt is a carving nobody sees.** The Fallen's sculpted chest went in
  at z 0.02 on a torso whose garment is a box drawn around it, so it rendered perfectly and was
  perfectly invisible. Bodies here are layers; anything meant to read has to sit proud of the
  layer above it. Looking at the screenshot found this in seconds and no assertion would have.
- **A negative control that also passes means the harness is unproven, not that the bug is
  fixed.** `roads.js` found zero caravan stalls; stripping out the `travel` fallback whose
  comment names that exact failure produced zero stalls as well. So the harness guards against
  wagons that stop moving, and it is NOT established that it would catch the reported failure if
  it returned. Worth keeping, worth writing down honestly, not worth calling the item fixed.
- **A browser re-serialises CSS, so grep the RULE, not the sheet.** `aid.js` checked for
  `animation: none` inside a `prefers-reduced-motion` block by regexing the concatenated
  `cssText` of every rule. Chrome expands it to the eight-part longhand
  (`animation: none 0s ease 0s 1 normal none running`), so the naive test missed it and
  reported a bug that was not there. Walk `styleSheets` -> media rules -> `cssRules` and ask
  which selectors are inside, rather than pattern-matching the serialised text.
- **Check the container id before asserting on zero.** The same file queried `#squad .port`
  and got `0 of 0`, which reads exactly like "the class is never applied". The bar is
  `#squadbar`. A count of zero out of zero is a selector bug until proven otherwise — print
  the denominator in the failure message so the difference is visible at a glance.
- **`PARTS` are anatomical, not generic.** `'torso'` is not a body part in this game
  (`head, chest, stomach, l.arm, r.arm, l.leg, r.leg`), and passing it to `applyDamage` throws
  from inside the render path rather than failing an assertion. Read the constant.
- **A restored world starts running the moment it arrives.** `carry.js` snapshots a world, sends
  it to a second browser as a code, and checks the same person is on the same tile. It compared
  coordinates to two decimal places across an unbounded wall-clock wait — so it was measuring a
  LIVE world against a frozen snapshot, and flaked the first time the marker's walk crossed a
  rounding boundary (1085.07 -> 1085.06 was the entire failure). Green for many runs, then red
  when an added harness shifted the suite's timing. Two fixes, and both were needed: pause the
  receiving world the instant the restore reports done, and compare PLACES rather than
  centimetres. When a probe samples something that is allowed to move, either stop it moving or
  give the comparison a tolerance the design actually promises.
- **A feature can be fully built and still have no reason to exist.** The Watchtower had a
  footprint, a walled ground floor with a doorway, an upper deck, a stair and a parapet — and
  stamped the same 11 tiles of sight as a shack, so building one opened SEVEN more tiles than
  a shed on the same ground. Nothing was broken; the number was just never given. When a report
  says a feature "does not work", check whether the feature does anything *different* from the
  cheapest thing next to it before looking for a fault.
- **A bonus for height that reads the terrain gives nothing for architecture.** The sight bonus
  came off `heightAt`, which is the ground, so a lookout on a tower deck saw exactly what they
  saw in the mud beside it — 5750 tiles either way. Anything keyed to elevation needs to ask
  `c.floor` as well, or every storey the player builds is decoration.
- **A cap expressed relative to the thing it caps is not a cap.** The shaping ceiling was
  `shapeBudget(caster) + 4`, so it grew with exactly the stat it was meant to bound: an archlich
  reached 32 against a theoretical maximum of 30 and could max every axis at once. If a ceiling
  is supposed to force a trade-off, it has to be a constant, and the progression has to be moved
  to something that is not the ceiling — here, what the same shape *costs*.
- **Assert what you built, not the sentence you liked.** `study.js` first claimed "the fifth
  bench is a shed" and went red on its own build — a power curve gives constant RELATIVE
  falloff, so the fifth bench pays about three-quarters of the third, not nothing. The
  temptation was to steepen the curve until the sentence became true. The right move was to fix
  the sentence, in the assertion AND in the panel's hint text, since both were telling the
  player something the code does not do.
- **A harness that cannot RUN against the broken build cannot prove it catches the bug.**
  `study.js` referenced a new constant bare, so on the old build the evaluate threw a
  ReferenceError and the whole probe crashed before printing a single line — which reads
  exactly like a clean pass at a glance. Guard any new global a harness touches
  (`typeof X !== 'undefined' ? X : fallback`) if you ever intend to point it at an earlier
  revision, which is the whole A/B discipline.
- **A tolerance can smuggle in a second assertion.** `aLoneScholarIsUnchanged` used `< 0.12`,
  which also happened to fail on the old build for reading 1.16 — nothing to do with what the
  line claims to check. A guard that fails for a reason outside its own sentence will send the
  next reader after the wrong thing.
- **Never run two `npm run check` at once.** Every run starts with `node tools/prep.js`, which
  rewrites `tools/game.html` — so two concurrent suites clobber each other's build mid-flight
  and every harness after the collision is reading a file that does not match what it is being
  asked about. Neither result means anything. The same applies to editing the game while a
  suite is running: a `prep` from your own shell lands in the middle of somebody else's run.
  One suite at a time, and rebuild only between runs.
- **Killing the suite reports 144, including on the command that does the killing.** A
  `pgrep`-driven kill matches the shell wrapper that launched it and takes your own command
  down with it, so `kill` "fails" with 144 while having worked perfectly. Confirm with
  `ps -eo args | grep -E "^(npm|node tools/)"` instead — and note a bare `pgrep -c -f "npm run
  check"` also matches the agent's own process, whose arguments contain the whole system
  prompt, so it will happily report processes that do not exist.
- **A harness that asks about an OUTCOME cannot see a doubled cause.** Every combat probe in
  this suite asked whether somebody went down, and for a long time somebody did — twice as
  fast as they should have, because the projectile impact branch carried two `applyDamage`
  calls and ran both. Twice the damage reads as a working bow. Nothing went red, and no
  individual harness was at fault: the question they all asked could not distinguish one hit
  from two. What catches it is a RATIO — count the shots that landed, count the times damage
  was applied, insist the two match (`tools/arrow.js`). When a system has a rate as well as an
  effect, at least one assertion should be about the rate.
- **Count the landings off something that is not the thing under test.** A shot resolves two
  ways and both take it off the board, so "the projectile went away" answers nothing.
  `arrow.js` counts misses off the `miss` float the dodge branch already draws, and takes
  landings as shots minus misses — so the wound counter is compared against a number the
  damage code had no hand in producing.
- **A stale base is the single-file hazard, and its diff reads as an addition.** The armour
  pass replaced a line; the audio pass, authored against a copy of the file from before that,
  brought the old line back beside the new one and looked like ordinary new code. There is no
  module boundary here for a stale base to collide with. When applying work written against an
  older revision, diff the REGION rather than the change — the lines it does not mention are
  the ones that matter.
- **A body pushed into `chars` is not yet anywhere.** Proximity goes through a spatial hash
  rebuilt by the frame loop, and a staging probe has stopped the frame loop on purpose. Stage
  bodies for a `charsNear`/`nearestEnemy` test without calling `rebuildCharGrid()` and the
  hash cannot see either of them — at which point the positive assertion goes red honestly and
  the NEGATIVE CONTROL GOES GREEN for the wrong reason, reporting "out of range" when the
  truth is "not on the map". This cost a real debugging round: the game was already fixed and
  the harness was still red. A control that cannot tell those two apart is not a control.
- **The suite reads a snapshot, so the danger is `prep`, not the editor.** `tools/game.html` is
  frozen at the moment `prep.js` ran, so editing the source mid-run does not by itself corrupt
  anything — running `prep` again does, and so does anything that calls it (`npm run check`,
  `check:fast`). Check `ls -la tools/game.html` against the suite's start time before trusting
  a run you are unsure about; if the snapshot is newer than the run, throw the run away.
- **A probe that aims where the code is easiest to hit will confirm the code is easy to hit.**
  Two harnesses drove the real right-click handler at real screen coordinates, and both aimed
  at `groundY(t.x, t.y) + 0.05` — the body's feet — because that is the coordinate that is
  trivially correct to compute. A ray aimed at the ground lands exactly where it was aimed, so
  both of them stepped around a parallax bug that made every large creature in the game
  effectively unclickable. When a probe has to pick a point to act on, ask whether the point a
  PLAYER would pick is the same one.
- **Check a new assertion goes red for the reason you think.** The first version of the downed
  case in `clicks.js` aimed at the dead centre of a sprawled creature — where the drift is
  near zero — and passed on both builds. It read like a control and was really a no-op. Run
  every new assertion against the old build and look at WHICH ones flip, not just how many.
- **A teardown flag that catches the staging is a teardown that eats the staging.** `wipe()`
  cleared everything carrying `__probe`, and the probe's own player unit had been made by the
  same helper. It stayed in `selected`, so `movers` still read 1 and the click handler ran
  perfectly normally — but `computeVision` walks `chars`, so sight stopped being stamped and
  every branch gated on `visAt(...) === 2` declined. Two cases reported "the order went to
  nobody" about picking code that was working. `command.js` records the same family from the
  other end (a `splice(-1, 1)` teardown deleting the last character); the shape is that the
  probe's own scaffolding is not a subject and must not wear the subject's mark.
- **Code can run and still cancel itself one line later.** `patrolTick` set its own timer to
  zero on arrival under a comment reading "stand and look around a beat", and the very next
  `if` tested that same timer and picked a new destination in the same tick. The pause was
  written, was executed, and had no duration. This is the authored-but-unreachable pattern's
  quieter cousin: nothing is dead code, nothing is behind a false condition, and the effect is
  still zero. Reading the two branches separately makes each look right.
- **A "middle ground" report needs a band, not a floor.** When the user says the previous
  behaviour was worse AND the current one is wrong, a one-sided assertion passes both ends.
  `patrol.js` fails high and low — too chaotic and too rigid — because either alone would have
  been satisfied by the thing the report was trying to get away from.
- **Check whether the word in the report is the thing that changed.** "Super twitchy and fast"
  contains a measurable claim about speed, and the speed was never touched: `travel`'s last
  argument is an arrival radius. Measuring it on both builds (3.64 against 3.68) turned one
  third of the complaint into a control instead of a change.
- **Stage the negative case where the old code would actually have failed it.** "A hand on
  FLESH does not tend the Charnel House" passed on both builds, because the probe had put the
  vat nearer and the old job walked to whichever building was closest — it never got the
  chance to do the wrong thing. Moving the house to the hand's elbow and the vat six tiles
  past it turned the same sentence into a real failure. An assertion about what code will not
  do has to be staged so that the broken code would have.
- **Splitting one name into two means finding every table that maps to it.** Four separate
  places turned a body into its work: `jobHasWork`, the job tick, the menu, and the
  building-to-trade table behind a right-click. Miss any one and the new job exists, appears
  in the UI, and quietly does nothing — or worse, sends the hand to the wrong building with
  nothing logged. Grep for the old string and account for every hit before writing the test.
- **Measure the distribution, not the event.** "Raids come too often" cannot be tested by
  asking whether a raid happens — it always did, on both builds. The gaps between arrivals are
  the complaint, and they are what `siege.js` asserts on: shortest gap, mean gap, and how many
  landed on the same day as another. When a report is about tempo, the assertion has to be
  about tempo.
- **A staged flag that the sim recomputes is not staged.** `menaceFlag = true; hostSize = 20`
  survived exactly until the first day tick, which derives both from the actual roster — so
  the Purge patrol path, half of what the report named, never fired once and the run still
  looked healthy. Stage the CAUSE (raise a real host), not the flag. And check it held: a
  `theStagingHeld` assertion caught the host dying by day 44 of 60, which would have made the
  two builds incomparable.
- **"Top it up each day" is the wrong cadence when the thing can die inside a day.** A purge
  hunt wipes twenty risen between rollovers, and `hostSize` is recomputed at the rollover
  before any per-day top-up runs. Restoring every step turned the host into a fixture, which
  is what a pacing measurement wants — the question is the tempo of what gets sent, not
  whether the probe survives it.
- **When several systems can cause one symptom, measure their shares before tuning any.** The
  Purge had been tuned twice for "they come too often" and was contributing identically on
  both builds. The bandit clause — a flat 25% a day with no gate, which nobody had ever looked
  at — was two thirds of the pressure. The system that looks responsible is not the one the
  numbers name.
- **A comparison a missing value satisfies is not a comparison.** "The long-dead body's kit
  is a lower grade than the fresh one's" used `rank()`, which returns -1 for absent kit — so on
  the build that DELETED the gear the sentence was satisfied by there being no gear, and read
  green while describing the bug it was written to catch. Any ordering assertion needs an
  existence check in front of it.
- **Check the ladder is long enough to show a ladder.** The first version gave the probe PLAIN
  kit, which can only fall one rung before it floors at Crude — so "the wear is gradual"
  reported `c` for both spoiled and bare bones and passed without ever showing more than one
  step. Giving it Masterwork made all four rungs visible; the floor is worth its own case.
- **Read the file for the mistake before making it.** `castRaise` splices the corpse out of
  `chars` and pushes the risen, so the length is unchanged across a success. `raise.js` had
  that written into its own comments, from having been caught by it — and `kitrot.js` was
  caught by it again anyway, reporting "(no body)" six times. The lessons in this file are
  cheaper to read than to rediscover.
- **Guard every reference to the thing under test, or the harness dies before it reports.**
  Three files this session threw a ReferenceError or a TypeError when run against the build
  BEFORE the change — `bodyWorth` in `arrow.js`, `siegeSent` in `siege.js`, `BUILD_TYPES.loom`
  in `cloth.js` — because a new name is `undefined` on the old build and reading through it
  takes the entire `page.evaluate` down. In `cloth.js` that killed the economy assertions that
  had ALREADY FOUND the defect, so the run reported a crash instead of a diagnosis. Any file
  testing something newly named needs a `typeof X === 'function'` or a presence check that
  writes the red line and returns.
- **A filter written for one purpose will quietly exclude the case you care about.**
  `cloth.js` skipped items of `type: 'trade'` believing it meant "a thing you buy". It means
  "a trade good", and both FABRIC and HIDE carry it — so the one material the file exists for
  was excluded from its own general check, which then read green on the build where fabric
  could not be made. When a general assertion passes on the broken build, suspect the filter
  before the assertion.
- **The general question outlives the specific bug.** "Is there a building that makes fabric"
  is answered once. "Does every material the player is asked to spend have something the
  player can do that produces it" is answered forever, and finds the next dead end on its own.
  When a report names one instance of a shape, spend the extra ten lines asserting the shape.
- **A healthy-looking number can be entirely one of the two things you are measuring.** The
  working necromancer in `craftwork.js` gained +16.80 and the assertion passed — and every
  point of it came from kills, because the probe had put him over his binding cap so all eight
  raises were refused. The half the ledger had explicitly warned about was never exercised.
  When a measurement sums two sources, check the split, not the total: `48 * 0.35 = 16.80`
  exactly, and that arithmetic is what gave it away.
- **When the user reverses their own earlier call, the warning in the note IS the spec.** "A
  caster who never trains by casting is the opposite failure" is not commentary — it is the
  second assertion, and it belongs in the harness as a control that stays green on both
  builds. Removing a mechanic is easy to over-do, and the file should be able to fail in that
  direction too.
- **Balance complaints are arithmetic — roll a few hundred and look at the distribution.**
  "Escorts pay insanely well" is not testable one job at a time, and it does not need to be
  felt. Rolling 420 of each kind across every town gave median purses of 230 / 980 / **12,402**
  and named the cause in the same breath: linear distance on a map 1440 across. Assert the
  SPREAD, with a floor as well as a ceiling — "escorts pay too much" fixed too hard becomes
  "escorts are not worth the risk", which is the same complaint upside down.
- **Price a guarantee against the real system, not against a constant that usually satisfies
  it.** A supply job paid `base * 0.75` per item, which beats the local sale price for most
  goods and loses to it for iron, where a high base and a high town multiplier compound. 37 of
  420 jobs were strictly worse than ignoring the quest. Pricing off `priceSell` with a premium
  makes the property structural: it cannot come apart when somebody adds an expensive item or
  retunes a town multiplier.
- **When one function guards a case and another one two hundred lines away does not, the
  second one wins.** `contractTick` deliberately exempted a delivered contract from expiry —
  right instinct, written down, correct. `refreshBoard` filtered the same jobs on the raw date
  and took them off the board anyway, so the purse vanished from under a protection that was
  working perfectly. When you find a deliberate exemption, grep for every other place that
  filters the same collection.
- **A flag computed at one end of a system and ignored at the other looks like a missing
  feature.** `p.ff` was set when the arrow was loosed, travelled with the projectile, and was
  replaced by a hardcoded `false` at the impact — while the argument it should have filled was
  read correctly by everything downstream, and a sibling call four lines away passed it right.
  When a report says "the game does not know X", grep for X: the odds are it knows and drops
  it, and the fix is one argument rather than a mechanism.
- **Check WHEN a branch runs relative to the state it reads.** The standing penalty asked "did
  anyone see this" before the blow was applied, so the victim was still `state === 'ok'` and
  matched as their own witness — the gate was vacuous for anyone caught alone, whatever
  happened to them one line later. The ordering, not the predicate, was the bug.
- **An assertion about "nobody saw" has to be staged where nobody could have.** The first
  version of that case put a living victim on an empty road and expected no consequence. A
  traveller you shot who lives will of course tell their town; there is no unwitnessed case
  while the victim is on their feet. Restaging it as a felling blow with nobody left standing
  made the assertion describe a rule somebody would actually want.
- **A probe that reaches past the door will confirm the room behind it is furnished.**
  `jail.js` called `placeStructure('cell', ...)` directly and proved the whole prisoner system
  worked — while the Holding Cell was missing from `BUILD_CATS` and could not be built by
  anybody. `rightclick.js` aimed at a body's feet and proved the menus worked while every
  large creature was unclickable. Both are the same mistake: the probe used an entrance the
  player does not have. When a harness sets up state through an internal function, ask what
  the player's route to that state is, and assert THAT exists too.
- **For any table the player picks from, assert the round trip in both directions.** Every
  buildable must be offered, and nothing offered may fail to exist. One line each, and the
  next stranded entry fails on its own instead of waiting to be reported.
- **Know which element each listener is bound to before dispatching at it.** In this file
  `mousedown` and `mousemove` are on the canvas and only `mouseup` is on the window. A
  `mousemove` dispatched at the window never reaches the handler that builds `dragRect`, so
  the drag silently stayed a click and `cave.js` reported a selection failure about code that
  worked. Grep the `addEventListener` before writing the dispatch.
- **A lerping camera is staging that has not finished settling.** Every screen coordinate a
  probe computes goes through the camera, so aiming with `w2s` and then checking a moment
  later can aim through one camera and check against another. The anchor took four seconds to
  fall thirteen tiles; at 700ms the answers disagreed by a tile and a half and the file
  reported a picking bug that was its own impatience. If the probe moved the camera, wait for
  it to ARRIVE, not merely to set off.
- **Snapping to a tile throws away more than the thing being measured.** `storeyHit` returned
  the centre of the nearest decked tile, which is right for a move order (name floor that
  exists) and wrong for picking a body, because up to a tile of error is larger than the whole
  0.8-tile catchment. Return both and let each caller take the one it needs.
- **A constant that encodes "the other storey" ages badly the moment there are three.**
  `elevatedHit` hardcoded floor 1 and `-FLOOR_H`, correctly, back when a rampart was the only
  thing that was not the ground. Caves are negative floors and everything downstream — the
  camera flag, the projection height, the plane constant — carried the same assumption
  independently. When a dimension gains a direction, grep for every place that assumed the old
  one rather than fixing the first symptom.
- **Measure by difference and you need no hook into the thing you are measuring.** Counting
  see-through parts with a building in the world and again with it lifted out isolates exactly
  what that building drew — every other group cancels — so `opaque.js` needs no accessor on
  the renderer and runs unchanged on a build that predates the fix. The first version added a
  `fn.group` reference to the game to make the group reachable; the difference method made
  that surface unnecessary and it was taken back out.
- **When one place in the codebase already does it right, its comment is the spec.** The
  citadel's "stand outside and it is a black tower, step through the door and it opens like a
  diagram" describes exactly what four other buildings should have done. Finding the correct
  instance first turned a design question into a copy — and reading its comment named the
  weaker questions the others were asking.
- **A cached group needs the fix in its KEY as well as its body.** These renderers rebuild
  only when a signature string changes, so making opacity depend on where the player is
  standing without adding that to the signature gives a building that is correct when it
  happens to rebuild and stale the rest of the time — which reads as an intermittent bug and
  is the hardest kind to chase. Assert the transition, not just the two states.
- **A new feature fails whole, not subtly, and every whole failure looks like success from
  inside the code.** A button wired to nothing, a thing drawn under the fog, a thing that does
  not survive a save — the state is right in all three cases and the player has nothing. Drive
  a new feature through the real DOM and read the real pixels; asserting that `marks.length`
  is 1 would have passed on a pin nobody could see.
- **When adding a mode to an existing control, assert the old behaviour explicitly.** The
  minimap has always jumped the camera. A pin mode that hijacked the click would pass every
  assertion about pins and quietly break the thing the map was for, so "an unarmed click still
  jumps" and "an armed click does not also jump" are both in the file.
- **A `||` chain that ends in `rnd()` is a determinism bug waiting for its first user.**
  `sex: _sb.sexOnly || o.sex || (rnd() < 0.5 ? 'f' : 'm')` never spent the draw for a line
  that dictates its own sex — which cost nothing until Mimics became the first lines that do.
  Three more of the same shape were found in an afternoon: `if(SUBRACES[o.race] && !o.sub)
  o.sub = rollSub(...)`, `rollSub`'s own `if(!t) return null` ahead of its draw, and a
  `!mim && ... && rnd() < 0.2` I wrote myself while fixing the other two. **Spend the number,
  then decide.** The invariant is testable directly and now is: every kind of body must cost
  the same number of draws to build.
- **The fingerprint is the instrument.** Hash every body's position and identity after
  worldgen and compare across a change. It caught a hoisted draw that left every body standing
  in exactly the same place while changing who they all were (same count, different order),
  and it caught eighteen people vanishing from a world of 633 when one branch short-circuited.
  Neither was visible from the code, and no harness asserted on either.
- **Poll until it is built; do not count frames.** `syncChars` builds at most eight rigs a
  frame and spends that budget on the world first, so any fixed number of `render()` or
  `syncChars()` calls is a bet on how busy the box is. `races.js` bet two and `mimics.js` bet
  eight; both won alone and lost inside a 63-harness suite. `bound.js` had already written this
  down, and both files were sitting next to it.
- **One sample of a noisy quantity is not a measurement.** `mimics.js` compared ONE succubus
  against ONE woman on `baseSX`, which is `(0.90 + h3 * 0.12) * build.sx` — a per-body spread
  of 0.12 against a build difference of 0.08. The noise was bigger than the signal, so the
  assertion passed or failed on which two ids the pair happened to get, and it read as a load
  flake for months. Average enough of each that the spread cancels, and say in the output how
  many you averaged.
- **Never keep a hand-copy of a rule the game owns.** `touch.js` decided whether a patch of
  ground was empty with `dist(c, w) < 1.6`, a copy of the pick radius. When picking changed to
  scale with the size of the body, a creature two and a half tiles away passed the probe's
  filter and still won the tap — and the file reported the touch layer dead about a game
  behaving exactly as designed. Call `bodyHit` itself. A copied constant is correct exactly
  until somebody improves the original.
- **A hand-copied LIST is the same fault as a hand-copied constant.** `raise.js` carried
  `['houndkin', 'oxbound', 'thinblood', 'scaleborn']` and went red the day one of those lines
  was cut — reporting "A RAISED CHIMERA LOSES ITS LINE" about a line that no longer exists,
  which is a probe telling you about itself. `Object.keys(SUBRACES.chimera)`.
- **A margin of 2% is not a bound.** `wyrm.js` first passed its own size check at 11.75 against
  a ceiling of 12, and `mimics.js` had passed `sx < wx * 0.99` by 0.001 for a year on a clause
  that was measuring nothing at all. If the number the probe reports sits inside a hair of the
  threshold, either the threshold is wrong or the thing is. Move one until there is real air
  between them, and say in the output how much.
- **Measure what the game stores, not what the table says.** The succubus `build` carries `sy`
  and does NOT carry `sx`, so her `baseSX` is drawn from exactly the same distribution a plain
  woman's is — the clause asserting she was narrower had never once measured narrowness. The
  narrowing is real and lives in `sh`, which is never stored on the rig at all: it is spent
  placing the SHOULDER ANCHORS. Reading those gives 8.0% on every build with no noise on it.
- **`x || 1` is a trap the moment 0 becomes a legal value.** `risenLoad` sums
  `(x.bindWeight || 1)`, and both temporary-host spells set `bindWeight = 0` — so twenty
  propped bodies read as twenty slots off a ceiling of seven, inverting the whole cost model
  of the dark art. No outcome test could see it: the army works, the spell works, the ceiling
  is simply gone. Fixed by asking the question that was actually being asked (`propped`) at the
  three places the ceiling lives, rather than by chasing `|| 1` through eleven call sites.
- **Anything generated after `baseBlocked` is taken must patch it too.** It is the world AS
  GENERATED and `restore` rebuilds `blocked` from it — so a generator that runs later (caves,
  at line 18327, against a snapshot taken at 5457) writes walls that exist only until the first
  reload. 1759 tiles of chamber wall to zero. The mountains already carried a comment about
  this and the caves still had it; when you add worldgen, check which side of that line it
  falls on. A save round-trip assertion that is exact rather than "within a percent" is what
  surfaced it — the slack was hiding 404 tiles.
- **Order the round-trips.** Two probes in one file that each call `restore` are not
  independent: measured second, the warren check read "ROCK 0 → 0" because the earlier
  round-trip had already eaten the walls on a broken build — a red line about something that
  was solid when the run started. Put the pristine-world measurement first.
- **`display:none` on a PARENT does not show up on the child.** `getComputedStyle(child).display`
  returns the child's own value, so a probe asking "is this button visible" about a control
  inside a hidden panel gets `inline-block`, a rect of 0x0 at the origin, and — because 0 is
  within every bound — a perfectly plausible tap coordinate in the top-left corner. It then
  taps the wallpaper four times and reports the feature broken. Ask `offsetParent === null`, or
  check the rect has a size, or drive the UI the way a player reaches it.
- **A hundred and eleven harnesses open the game the same way.** Every file in the suite calls
  `document.getElementById('btn-start').click()`, so that element is load-bearing infrastructure
  and not just a button. Rebuilding the start screen around a step flow was safe only because
  `.click()` fires on a `display:none` element — the button is hidden from the eye on early
  steps and never from the suite. Before restyling anything on the start overlay, grep for what
  the suite reaches through it.
- **Reset the STAGING, not just the wounds.** A bodyguard probe reset blood, parts, stagger
  and state between swings — and never position. Every blow the guard caught knocked it back,
  so it drifted 56 tiles from its ward and 1359 of 2000 swings failed the distance gate. Worse,
  the ward eventually died (parts fail whatever the blood is) and `kill` runs `releaseTargets`,
  which clears `guardTarget` — ending interposition permanently, at a moment set by the PRNG.
  That was the whole of a "10% on one build, 4% on another". Pinned and re-stated, the real
  rate is 39%. **Ask what the loop carries forward, not just what it visibly resets.**
- **Pause in the same evaluate as the click.** Starting the game and then sleeping before you
  pause leaves the world running live for seconds — hundreds of frames, each spending an
  unpredictable number of `rnd()` draws — so the stream position at first measurement depends
  on machine speed and on how many bodies the world holds. One harness read 43% and 59% on the
  same build, and 43/56/58 across three builds, entirely from this. Closing it made three
  consecutive runs identical to the digit. Roughly forty files still click without pausing;
  most are fine (the visual and performance ones want it running), but any file that sleeps,
  then pauses, then measures something statistical is carrying it.
- **Check the denominator is made of trials.** `survive.js` reported interposition as a share
  of 400 *swings*, but `attack` returns early on cooldown, on a miss and on a stagger, so most
  of them never reached the code being measured. The same unmodified guard read 10% on one
  build and 4% on another — four standard deviations apart if n really were 400, and ordinary
  noise once you count the blows that landed. Against a real denominator it is 2% on every
  build tested. **A rate whose denominator includes no-ops is not a rate.**
- **Measure the PRNG sensitivity before blaming the diff.** Burning 0, 1, 7, 33 and 101 draws
  before an otherwise identical experiment on one unchanged build moved a survival share
  through 54, 63, 57, 63, 57 — nine points at n≈120. Any bound inside that spread is a coin,
  and a batch that shifts worldgen will flip it while touching nothing the assertion is about.
  Burning draws is a two-line experiment and it is the fastest way to tell a real regression
  from a relocated one.
- **A suite is a stopwatch as well as a test.** The confirming run took 3987s against the
  first run's 2846 — 40% slower on a byte-identical build — and two harnesses that sleep to
  advance the world went red purely on that. Compare the per-harness times before reading a
  red line as a regression: `mimics.js` 72s → 102s across the same two runs said more than the
  failure did.
- **A statistic over twenty-one bodies is not a measurement, it is a coin.** `trades.js`
  counted one town's tradespeople against a 60% bar — a threshold of thirteen people — and the
  figure walked 17 → 13 → 12 across a batch that changed nothing about work. Proved by
  measuring the thing the assertion is actually about on both builds: identical trade mix,
  identical midnight-fallback rate (42% against 43%). A worldgen PRNG shift does not change
  behaviour, it relocates individuals, and a small sample cannot tell those apart. **Widen the
  sample, not the bound** — seven towns and 139 hands lands at 72% with margin and repeats
  exactly.
- **Never assert exact equality on a number the game moves on purpose.** `f0.blood === 100`
  read two and a half game-hours of hunger as gunfire (measured: 99/100, nothing within
  twenty-five tiles). It had been green only because the arithmetic used to land the other side
  of a tick. Bound it by what the feature would do — a Heavy's bolt is worth far more than five
  blood — and the assertion survives the world drifting under it.
- **One failure string must not cover two causes.** The same probe printed "A DRY HEAVY FIRES
  ANYWAY (0 bolts)" — a sentence that cannot be true — because the firing check and the control
  check shared a message. A red line that describes the wrong failure sends you into the
  feature when the fault is in the staging. Split them, and have the probe report what else was
  on the measuring ground.
- **A fixed-point iteration is not an algorithm, it is a hope.** `storeyHit` and `aimGround`
  both re-sampled the terrain where the last guess landed, four times and three times. That
  converges at `slope / tan(pitch)` — a third of the error a pass on the hillside a cave is dug
  into, and not at all if the camera is ever pitched shallower than the ground. It was landing
  0.47 tiles out against a 0.8 catchment and had been green for months, which is luck, not a
  pass; moving the underworld deeper grew the initial error and the same passes left 4.49 and
  the body could not be clicked. Both bisect now (bracket the crossing, halve it forty times),
  the residual is 0.16, and the rate has nothing to do with the terrain. **When a bound is
  cleared by less than half its margin, the algorithm is the finding.**
- **Ask which one, not which storey.** Two separate renderer bugs this session had the same
  shape — `occ` built from every player body in the world rather than from the body in THIS
  redoubt, and then again in THIS cave. Both were harmless while the thing being asked about
  was private to one building, and both became an x-ray the moment a floor was shared. If a
  visibility test keys on a floor NUMBER, it is asking the wrong question.
- **A whole-map feature has to be sampled over the map, not counted over the generator.**
  "94,000 tiles of floor" and "1.7% of the world has anything under it" were both true of the
  same build at different moments. The count is a fact about the dig; the player's question is
  "is there something under where I am standing", and only a sample over the map answers it —
  which is also what caught the 140-tile dead band round the edge that a tile count could not
  see.
- **Measure the rate the player sees, not the rate the function pays.** Mimics came off
  `rollNpcRace` at a healthy-sounding 4%, and a player could go a whole run without meeting
  one — because what they actually read is six boards of five, refreshed at 40% a day, which
  works out at about one in the world. A probe on the function would have been green. The
  question is always "how often does this reach the screen", and the answer usually needs the
  surrounding system in the measurement.
- **A gate on world state can be unreachable, and nothing else will tell you.** Both new
  wanderers are gated on things the player cannot buy, which is the good version of that
  design and also the version that can quietly never fire. Each gets two assertions — shut on
  a fresh world, open once its condition is true — and the condition is produced by running
  the game's own tick, not by setting the flag, because setting the flag tests the `if` and
  not the feature.
- **Do not build geometry out of a chain of Euler angles.** A wing nested four groups, each
  with its own XYZ rotation; one sign was wrong on the humerus and the whole thing came out as
  a fan of spikes standing off the back like antlers. Composed Eulers are not something you can
  hold in your head, and the debugging loop is guess-render-look. Naming the joints as POINTS
  and laying a box between them (`bone(a,b)`, `web(root,e1,e2)`) is the same geometry with the
  errors made visible: if the elbow is meant to sit above the spine, it says so in one line.
- **A harness can assert the fault.** `wyrm.js` demanded the animal be longer relative to its
  height than the grazer — which is a bound that rewards exactly the long, low silhouette that
  got reported as wrong, and it was green the whole time. It was also clearing that bound by
  0.001. When a report contradicts a green assertion, check whether the assertion encodes the
  intent or the accident before touching the code.
- **`setFromObject` is not the body.** It swallows the nameplate sprite and the selection ring
  and put a plain man at 2.12 tall and 1.0 across. Expand over `isMesh` descendants instead —
  and if a scale measurement looks strange before you have changed anything, that is why.
- **A sentinel is not a boolean, and `-1` is truthy.** `isLeader` defaults to `-1` and every
  other site in the file tests `c.isLeader >= 0`. `suspectNear` filtered with `!c.isLeader`,
  which is false for every non-leader in the world — the pool went 23 → 0 and the Paladins
  took nobody. It cost a whole run to find because the *adjacent* assertion went GREEN on it:
  "forty draws never once landed on one of your own" is free when forty draws land on nobody
  at all. **A probe that counts a bad outcome must also count that the outcome had a chance to
  happen** — assert the draws, not just the misses. Same shape as `0 of 0 hands have a bench`,
  which clears any percentage floor.
- **Read the green lines too.** The run said "5 of them speaking for a cell" where six cells
  were seeded, and that one digit was a real design fault: `suspectNear` prefers the marked, so
  the Order is likelier than chance to burn the cultist who does the talking, and a cell with
  no speaker can never recruit again. The Bastion's fire was quietly load-bearing for whether
  the cult could grow. Nothing was red. The number just did not match the seed.
- **Anything a feature writes on a body has to be in `snapshot`/`restore`, and only a
  round-trip finds the ones you forgot.** Three went missing in one pass — `coilSpeaker`,
  `guildFolk`, `coilHeld` — and every one of them is invisible until a reload, at which point
  the cult stops recruiting and the Guild's seven tradespeople forget where they work. The
  save was written for the field the feature is *about* (`coil`) and not the fields that make
  it *behave*.
- **Fence every block in a harness for a new feature.** An unfenced probe run against the
  build before the feature dies at the first `ReferenceError` and reports nothing about the
  other seven claims, so the A/B is a stack trace instead of a list. `guard(keys, fn)` records
  the ReferenceError as a red — which is what it is — and lets the rest run. Gate only the
  claims that genuinely depend on an earlier step; `purge.js` bailed out of six independent
  assertions behind `if (!held) return R`.
- **A rule the situation cannot arise for is not a rule.** The Guild's charter — a guild oath
  never fights a guild oath — held perfectly in the first draft of `guild.js` because both
  licensed contingents were faction `town` and `hostile()` returns false on the first line for
  two of the same faction. A town at war fights in TWO places and they are different factions;
  until one company marched and the other held its gate, the assertion was true and empty.
- **`HOUR_SEC` is 8.** 240 real seconds is thirty game-hours, not four minutes of town life.
  `trades.js` ran a town past dusk and through the next midnight and then asked why nobody was
  at work. Any probe that reasons about the CLOCK — working hours, a day's wage, a spell that
  lasts three days — has to convert.
- **A probe that puts a crowd on one tile is measuring `separate`, not the feature.**
  `trades.js` pointed eight smiths at one doorway; they arrived, were shoved back out past
  their own post radius, walked back, and were shoved out again forever. The game was right and
  the design was wrong, and the fix belonged in the game: each of them gets its own square
  metre, drawn off its id so it is the same one every morning.
- **`provoked`, not `neutral = false`.** `hostile()` reads the two as a pair — "a neutral that
  has been started holds the grudge against the player" — so clearing the neutral flag takes a
  body OUT of the rule that was about to make it hostile, and a `fauna` with neither flag is
  hostile to nobody at all. `wyrm.js` reported a breath that caught nothing, about a breath
  that works.
- **`blood = 1e6` does not mean unkillable.** `updateState` drops anybody whose VITAL PARTS
  are at or below zero, whatever is in the veins — and `physics` calls `clearOrders` on a body
  going down, which wipes the order under test. `melee.js` spent a year reading whether its
  runner happened to switch target before it was knocked out. Raise the parts with the blood.
- **A body staged with no race rolls a LINE, and a line carries stats.** Salt-cured is +3 tough
  +3 armour, Ironscar-bred is +3 atk +3 blades, and `xpGain` reads the line's per-skill `learn`
  as well. `survive.js`, `melee.js` and `watchers.js` all let that into a measurement and all
  three went red the day fourteen bodies were added to worldgen a thousand lines above them, on
  builds where nothing they test had changed. Pin `race`/`sub` — Dustborn has no bonuses and no
  gaps — or level the pair by hand.
- **A probe whose subject may not exist is not a probe.** `names.js` asked its golem question of
  whatever golems worldgen happened to produce, and golems are 1.8% of what walks: one on the
  first run, none on the second, and it reported "THERE ARE NO GOLEMS TO CHECK" about a naming
  convention that works. Ask the mechanism directly and report the world as colour.
- **Check what a file actually prints before counting it.** `cave.js` does not use the `***`
  summary line the other harnesses do, so `grep -c '^\*\*\*'` returned zero for three
  consecutive FAILING runs and they were read as passes — which sent the next hour looking for
  a load flake that was a real defect sitting still.
- **A yes/no cannot tell you it passed with nothing to spare.** `cave.js` asserted only that a
  click selected the body, and it had been doing that with a residual of 0.32 tiles against a
  catchment it blew through at 1.32. Print the margin and the thing that moves it — the slope,
  here — and drift shows up as a number creeping rather than as an assertion flipping.
- **A preference test needs the geometry swapped.** `focus.js` asked whether a squad prefers the
  enemy already aiming at them over an idle one at "the same range", and got 4 of 4 for the right
  answer ON THE BUILD WITH NO CHOOSER IN IT. Four units strung along a line are not equidistant
  from two bodies, so a pure distance sort had a favourite and it happened to be correct. Run
  every pairwise preference from both sides — same two spots, the two candidates swapped — and
  require it to win both. Anything decided by position wins one and loses the other, which is
  exactly what the broken build then printed: `0-4 and 4-0`.
- **`findOpenNear` is not "put it here".** The same file staged two bandits two tiles apart and
  got them 5.94 and 11.36 tiles out, one of them past the nine-tile scan — so the trial was
  reading a one-candidate list and reporting a preference between one thing and nothing. It
  spirals off anything already standing there, including the probe's own squad. Where the
  geometry IS the control, place bodies directly and assert the distances you meant.
- **Do not assert about a state the game cannot be in.** The same file staged a bandit at 14% of
  its blood to test "finish the nearly dead" and got 0 of 4 in both orientations — not a
  tie-break lost, a body that `updateState` puts on the ground below 40 of 100. The scan was
  right to skip it. Check the thresholds before choosing a number to stage.
- **A consequence turns a working assertion into a vacuous one.** `origin.js` proved Lyre reads
  the man by calling `talkTo` twice — plain, then as a lich — and diffing her speech bubble. That
  worked for exactly as long as talking to her did nothing. The moment the conversation had a
  consequence, the second call read a SQUAD line instead of a greeting, the two strings still
  differed, and the assertion went green while measuring nothing at all. The fix is the same one
  this file keeps arriving at: ask the question without also answering it — the world-reading half
  is `sisterGreeting()` now, a function with no side effects, and the joining is a separate line.
  When you give an existing action a new effect, go and look at every probe that used that action
  as a *read*.
- **A bubble must not move the simulation.** Every bark in the game spent `rnd()`, the world's
  seeded stream, so which of three lines a body shouted decided what the next arrow did — a
  whole run of combat able to diverge on a speech bubble. Nothing downstream reads which line
  came out, so nothing downstream should pay for it: `vpick` draws on `vrnd`, the renderer's
  counter, which until then drew nothing but dust motes. `pain.js` asserts it at 200 barks for
  zero movement of `seed`.
- **The spatial hash is rebuilt inside `update`, and nowhere else.** A probe that stages
  bodies and then calls a tick DIRECTLY is asking `charsNear` about where everybody stood in
  the previous test. It reported a Sixfold stamping at two bodies — counting six from the
  staging before — and then hurting none of them, because they were not in the map it damaged
  through. `rebuildCharGrid()` after staging.
- **Give both sides of an A/B the same dice.** `rnd()` is one seeded stream and the second
  staging inherits wherever the first left it, so a two-run comparison measures the world's
  mood as much as the change. Three trials a side did not fix it and neither did alternating
  the order: the same 9-against-3 came back on a build with the feature and on one without.
  `seed = 90210` at the top of each run is what leaves the thing under test as the only
  difference.
- **A blow lands on a PART, not on the blood pool.** `applyDamage` takes a limb down and the
  blood follows later through the bleed, so "was this body hurt" read off `blood` says no to a
  fresh wound. sixfold.js measured blood first and reported six hurt on both sides of every
  comparison — it was counting bodies knocked to the ground, not bodies struck.
- **A synthetic `MouseEvent` on `#game` arrives at the element and does nothing.** The
  mousedown handler is bound to the canvas the renderer owns; dispatching at the id gets a
  listener hit and no branch taken, and the probe reads "no menu opened" on a build whose menu
  works perfectly. Playwright's own `p.mouse` goes through the browser's hit-testing and lands
  on whatever is actually under the cursor, which is the only way to be sure the thing being
  tested is the thing a player touches. Modifiers too: `p.keyboard.down('Shift')` around it.
- **`camX`/`camSX` are inputs to the render loop, and no frame is drawn inside an `evaluate`.**
  Move the camera and ask where a tile is on screen in the same breath and you get an answer
  from where the camera *was*. In haulers.js that projected a body to (-1621,-518) — a thousand
  pixels off the left of the window — and `screenToWorld` mapped it straight back onto the body
  to within a hundredth of a tile, because a ray-plane intersection does not care whether the
  pixel is on screen. The round trip agreed perfectly and the cursor was nowhere. A
  `waitForTimeout` between the camera move and the aim is the whole fix. And `w2s` /
  `screenToWorld` are not inverses on a pitched camera: the round trip lands about two tiles
  past a large body, so take one Newton step off the measured error before clicking.
- **A test that re-implements the caller cannot see a bug in the caller.** haulers.js first
  reproduced the order handler — `lootCorpse(body, true, who, true)` — and passed on the broken
  build, because the fault was in the menu entry that calls it. If the thing you are testing is
  a UI affordance, press the affordance.
- **One name, one meaning — a second top-level `function` of the same name wins silently.**
  The tear rite was written as `riteTick`/`RITE_WORK`, both of which THE LAST RITE already owns,
  and there is a comment in the file saying so in as many words. Only the `const` threw; the
  function would have collided in silence, the later declaration would have won, and it would
  have shipped as a dead tear-rite plus an ascension advanced twice a frame.
- **Measure the thing the complaint is about, not the nearest number you already have.**
  "Her face has heavy lines" looks like a contrast problem, so the first sweep tuned against
  luminance spread across the head's vertex colours — and plateaued at 36.7 against a target
  of 27.8 with the creases plainly still there. Most of that spread was near-white hair
  against skin: LARGE-scale shading, which is most of what makes the thing read as a face at
  all, and no amount of tuning would ever have removed a wrinkle by moving it. A painted
  wrinkle is precisely a vertex sitting far from the ones touching it; measured that way the
  same passes went 16.08 -> 6.78 and the pictures agreed. A metric that only *correlates*
  with the complaint will happily plateau, and you cannot tell that from a metric that has
  stopped improving because the work is done.
- **A negative control tells you where the floor is, not only whether you moved.** The same
  head baked with EVERY trace of painted detail removed came back near enough identical to
  the shipped setting — so what remains is the sculpt's own geometry, and there was nothing
  further to win by smoothing colour harder. That turns "0.3 is where I stopped" into "0.3
  is where the technique ends", which is a different claim and the one worth writing down.

## HOW LONG THE SUITE TAKES, AND WHY

Measured rather than guessed, because the first two guesses were both wrong.

Per harness, before a single assertion runs:

  · 6.5s to `goto` the built game.html — parsing 1.82 MB and 25,713 lines of script.
  · ~5.1s more for worldgen and the start click (2.5s + 2.6s, polled).

That is ~11.6s of startup on EVERY harness, about seven minutes across the chain. For the
cheap harnesses it is most of their runtime: raise.js takes 15.1s total, so roughly three
seconds of it is testing.

**The two 3-second sleeps are not the problem.** Every harness opens with
`waitForTimeout(3000)` twice, which looks like six seconds of pure waste — and polling for
real readiness instead takes 5.1s, so the whole change is worth about 0.9s a harness, half a
minute across the suite. Worth doing to remove a guess, not worth doing for speed. Measure
before rewriting thirty-seven files.

**Parallelism does not work here yet, and that was worth finding out.** A four-harness sample
ran 102.2s serial and 61.1s at four-way with all four passing, so the whole suite was tried at
four-way. Four harnesses went red that pass serially: `carry.js`, `wanderers.js`, `kit.js`,
`races.js` — the last with "golem/clay BUILT NO BODY", a mesh that did not finish building
inside the probe's window. None is a real defect. All are the same wall-clock class this file
already documents three times, and concurrency makes it more likely rather than less. There is
deliberately no `npm run check:par`; `tools/run.js --jobs N` exists so the next person can
re-measure after fixing those four.

**What actually helps:**

  · `npm run check:fast` — six harnesses that would notice a broken build at all (boot, save,
    roundtrip, fight, towncheck, races). 104s instead of ~15 minutes, for the edit loop.
  · **The start-click freeze is applied to the 25 suite harnesses that already manage `paused`
    for themselves.** A click followed by a `waitForTimeout` lets the world run for however
    many frames the machine manages — not a fixed number, and markedly fewer when a
    sixty-harness suite is loading the box — so every body is somewhere slightly different by
    the time the probe stages anything. Pausing inside the same `evaluate` as the click leaves
    no frames between the two. The 21 harnesses that never touch `paused` are deliberately NOT
    swept: they rely on the world running for their whole duration, and freezing them would
    measure a dead world, which is a different job and wants a different fix.
  · `npm run check` — the serial chain, unchanged, for a push.
  · Run the full suite ONCE, at the END OF A DESIGN SESSION, and only when asked for. Standing
    instruction from the owner of this project, and it is the right call: the chain is ~30
    minutes of wall clock, and running it after each batch spends most of a session watching
    it rather than building. Running two at once invalidates both.
  · DURING a session, run the harnesses the change actually touches — usually the new one plus
    the two or three named in the table above for the systems involved. That is seconds, not
    half an hour, and it catches nearly everything a full chain would. The full chain is for
    the things it alone can see: a change in one system quietly moving another.
  · roads.js was 233s — twenty-two percent of the suite in the file whose negative control
    passed. Halved to 112s after checking what the halving costs: still thirteen legs, both
    stall checks intact.
