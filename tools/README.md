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
| `board.js` | The town post end to end, plus the three notes that hang off it. That a board exists in every town on ground you can actually stand on; that it offers errands, blood work and a life in your hands rather than one kind of job forever; that a supply job goes taken → unfinished → delivered → paid and comes off the board; that a headcount bounty is counted where the bodies fall; that an escort is a real person who walks a real road and whose death costs you standing; that BODYGUARD names a ward out loud and a lone unit set to it no longer guards nobody in silence; that a sited job says which way to walk **and that the bearing is right**, checked against the sign of dx/dy rather than merely being present; and that the squad remarks on the situation it is in — starvation, an empty larder, a raising — with lines a cruel one says and a compassionate one never does, while still getting to tell you what it thinks of you. Two false alarms of its own, both written into the file: the world at day one has **no camps and no rifts**, so every job that needs an address is unrollable and the first run reported the scholar quests unfixed when what it had measured was a world too young to have anywhere to send anyone; and a supply job asks for what the town is short of, which is often something the player already has a pile of, so the not-yet assertion has to set its own target rather than trust the starting inventory. |
| `wanderers.js` | The six named companions who are in every world. The promise is not "some named NPCs exist" — it is that all six are there, in the same *kind* of place, never the same place twice, and every one can be reached and taken on; and every clause of that quietly stops being true the first time a placement falls through to a fallback nobody checked. So: all six placed, on ground you can walk to, inside the map, each a dated rumour; the gaoled one in a real cell that knows it holds him, the held one actually held, the redoubt one actually at a redoubt, none of them hostile on sight, and the road one somewhere different on six days of six. Then every gate is driven twice — refused with its stated reason, then opened once that reason is met — for a fine, a wounded companion, a written doctrine, keepers on the ground, and three *places* (not three button presses); the squad cap outranks all five. Then recruiting: out of the cell, off the rope, doctrine spent, on the banner, with stats worth crossing a map for. Then a save. Then a fortnight of sim proving the man in the cell does not file his way out — `workTheBars` would have undone the whole premise in about two weeks. Finally it opens **two more worlds at other seeds** and checks all six are still placed and 6 of 6 landed somewhere different. It also drives the real right-click handler at real screen coordinates for the conversation path — a dead-centre click opening the scholar rather than the generic menu, a distant one setting off a walk that remembers why and opens on arrival with no second click, and an unreachable one being dropped rather than walked at forever. Its own traps: aiming at head height (0.91 tiles off, which threads between the very branches being tested), staging the walk 18 tiles out where the night sight radius makes the target unclickable, and staging Cressa's "her keepers are still standing" test by killing one keeper the probe made itself, while the real slaver camp stood around her untouched. |
| `beasts.js` | The two new specimens and the four new bindings, each measured against the system it touches rather than its own fields. **The Cairn Beast**: that it eats the real `corpses` array and the bodies leave `chars` too; that forty bodies takes it past the Sixfold's 2.40 and slows it; that five thousand is still capped at 8 and a capped one still walks; that named dead and contracted wards are left where they lie; that a heavy blow sheds a piece as a real corpse and it picks that piece back up; that its drop table carries what it ate; and that a save stores only the count and rebuilds the body from it. **Brood-of-the-Door**: that it arrives with the door, stays anchored to it, that a *finished* hold does not close the sky while it stands, that the journal says why rather than deadlocking in silence, that two severed limbs drop the seal from 60 to 46, and that the same hold lands once it is down. **The bench**: that the Bone Mule is gone, the Knight costs stone, all four new recipes bind through the real `craftUndead`; that a Gravecart fetches six and destroys none of them; that a Stitch-Hand refuses fights, puts a severed arm back on, mends the rest, charges remains, and stops dead with the stores empty; that a Wisp lights measurably more ground, wards, and takes the room with it exactly once. Three of its own traps are written into the file: reading `blood` instead of the part pool, staging a Gravecart test inside a town (which measures the grave-robbery exemption, not the rounds), and a slack `||` fallback that let "0 on the bed" pass. |
| `threads.js` | Whether the game ever says what you are in the middle of. Two notes came back — the search for Lyre "gives absolutely zero leads whatsoever", and the second Fracture creates urgency with "zero clarity on how to actually stop what's happening" — and both quests were *fully implemented*. The property under test is therefore not "does it work" but "can the next move be read off a surface that is still there an hour later". It drives the real CHRONICLES panel and reads the step out of the DOM; checks a restated step says nothing and a new one is announced once; runs Lyre's whole trail (three halls with a count on each, a cairn in the field she was *put out at*, a scholar's ledger naming the field she is in now) and proves blundering into the last field early does not skip a leg; drives Saga's Q-readings and checks each one is written down and replaces the last rather than piling up; opens the closing rite at A STILLNESS, proves a scholar knows it, that a codex is needed to learn it, that the step then names the whole bill in advance, and that it turns into a live readout once the door stands. Also pins the escort ward being drawn out of vision, and that a ranged dark caster spends 0 mana over 400 ticks beside an already-marked foe. Its own traps: `charsNear` reads a per-frame bucket index, so a probe that pushes bodies in by hand and forgets `rebuildCharGrid()` scans an empty world — which made "it skips a marked target" pass for entirely the wrong reason. |
| `chores.js` | Three chores that existed but could not be reached. **Wall runs**: that one gesture stakes out a straight, contiguous, axis-locked line of walls; that every tile of it is still an ordinary 1x1 blueprint (decks, emplacement mounts, siege damage and the upkeep tally all look a wall up by its exact tile, so a wider footprint would break eleven other things); that a 500-tile drag is capped; that a run costs full price per tile; and that a run into a mountainside refuses **once** rather than six times. **The harvest job**: that HARVEST is in the JOB menu and choosing it sets the job, that four bodies get looted and then rendered down by the real `physics` tick, and — the whole safety story — that it refuses townsfolk, anyone with a home town, your own fallen, named lieutenants, VIPs, a body somebody is carrying and one the necromancer has already picked, and earns you no bounty you did not choose. **The ledger**: that a bounty can be settled at the bar as well as the Leader's desk, that the three doors are priced in order (Leader 1.5x < same-town bar 1.8x < courier 2.5x), that the watch stands down mid-arrest and lets go of the man they were walking to a cell, and that a bar in a town that does *not* want you will send the coin on — the only door reachable when the town that wants you is the one you cannot walk into. The harvest block also pins the give-up: the *nearer* of two bodies is made unreachable by replacing `travel`, and the job has to set it aside and clear the further one instead. Without that timer the nearest-corpse scan re-picks the stranded body every two seconds and a hand set to HARVEST walks at a cliff for the rest of the run, which in play reads as the job simply not working. |
| `survive.js` | How people actually die, and how much room there is between going down and being gone. Runs twelve even six-a-side fights and then takes the **real** casualties they left and lets them lie — untended, and with one bandage on the worst wound. This is the probe behind the survivability change: it found that an even fight kills nobody outright and then every single one of the fallen bleeds out where they lie, in about one game hour, which at `HOUR_SEC` 8 is nine real seconds between "X is down" and "X is dead" — and that a bandage saved 7 of 49. It also measures interposition (a bodyguard on the line must catch some blows and one standing behind the ward must catch none), and guards against the opposite failure: both sides must still fall at roughly the same rate, or the tweak has become a shield. Its own first version knocked people down by hand with sixty small cuts, which piles up five times the bleeding a real exchange leaves, and was measuring its own choice of damage size. Fight first, then measure the casualties. |
| `melee.js` | Two notes about how a fight behaves. **Target fixation**: stages a runner, a quarry ten tiles off and a picket line of six in between, and counts the passing cuts taken on the approach and whether the line is ever dealt with. This is the probe behind the `retaliate` fix — the old rule ignored being hit by anybody at all while any living quarry sat within *twelve tiles*, which is not "engaged", it is a third of the way across a battle. Also checks the other side of it: an order on clear ground is still carried out, and an order interrupted by a knife resumes once the knife is down. **Move variety**: what `pickMove` actually returns at novice and adept skill and in a crowd, that no single stroke is more than half of all swings, that being surrounded genuinely reaches for the wide strokes, and — the one that matters for the picture — that the arc handed to the animator is the same key the blow resolved with. Its own first version counted every jab across the whole run rather than the approach, reported 40, and was measuring the length of the fight instead of the recklessness of the charge; its second asserted that a right-clicked target is reached *through* a picket line, which is the bug restated as a test. |
| `moves.js` | **Visual.** One row per MOVE, which is a different question from `swing.js`'s one row per weapon: that one shows a nodachi and a katana swinging at different speeds, this one shows whether the six strokes read as six strokes. It replaces `window.pickMove` from the page (a top-level function declaration in a classic script is a property of `window`) and forces each key in turn. It is what showed that slash, overhead and thrust — 85% of every swing at low skill — all wound up with the blade straight over the head, which is exactly "I only ever see the overhead swipe": the numbers said the strokes were varied, and the numbers were right and irrelevant. `node tools/moves.js w_kat out.png [slash,thrust,...]` |
| `races.js` | Races and the lines inside them. A subrace is four mechanisms wearing one name — starting stats, a per-skill learning rate, damage-type vulnerability, and overrides for speed, lifespan, skill ceiling and whether the line can hold a gift — and every one of them is the kind of thing that can be declared in a table, read perfectly, and never once reach the sim. So none of it is read off the table: experience goes through the real `xpGain` and the two bodies are compared after 400 points, damage goes through the real `mitigate`, speed through `moveSpeed`. It also pins the migration — a body carrying `race:'scaleborn'` out of a pre-rework save must come back as a chimera of the scaleborn line and not as a human. Diagnosing its first red run turned up the actual bug: `makeChar` rolled the line off the raw `o.race`, and almost nothing in this world is created with an explicit race, so townsfolk, guards, bandits and children all became raceless humans with no line at all. The feature existed in the character creator and nowhere in the game. |
| `corpses.js` | How long a corpse actually lasts in real minutes at each game speed, how many things are competing for it, and what a body is worth once you have one. Answers "am I imagining that bodies vanish too fast" with a number. |

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
| `heads.js` | The three sculpted heads, close enough to judge, plus the assertions that go with them: that a sculpt is attached at all, that **nothing of the box head survives under it**, and how big it ended up. A baked asset has four ways to be wrong and every one of them is invisible at body distance — scale, height on the neck, which way it faces, and whether the head it replaced was actually hidden. It renders through a camera of its own rather than the game's: `focusY` is ground plus 0.8 and there is no dial for it, so a head at 1.8 projects twelve pixels from the top of the frame whatever you do with distance or pitch, and three separate attempts at hand-picked crops all photographed the belt. `node tools/heads.js out.png` |
| `bakehead.js` | Not a test — the importer. Turns a `.glb` into the base64 blocks the one HTML file carries, because an asset that lives next to the document does not exist as far as this project is concerned. **The first version simplified by vertex clustering and melted the faces**, and the lesson is worth keeping: clustering quantises vertices to a grid and replaces each cell with the average of what fell in it, which is fine for a rock and wrong for a face — a nostril, a lip edge and an eyelid are all sub-cell features, so each is replaced by the mean of itself and the flat skin beside it and every crease goes at once. The budget was never the problem; 3,000 triangles is more than a whole Quake character had. It uses **quadric error metrics** now (Garland & Heckbert): flat cheeks are cheap and go first, the ridge of a nose is expensive and survives. Three additions beyond stock QEM, each forced by these particular models — **weld first**, because a textured export splits vertices along every UV seam (Saga arrives as 14,834 vertices describing 5,004 points, and a doubled edge is never a shared edge, so half the mesh reads as boundary and refuses to simplify); **hold the boundary**, with a perpendicular plane quadric on every one-face edge, or an open rim erodes inward and the head grows holes; and **colour is a feature**, because an eyebrow is nearly flat and QEM would collapse straight through it, so the cost carries a term for albedo distance. Plus a flip *and sliver* rejection — a triangle left too thin to shade is what put shards across Saga's cheek on the first quadric pass. Budgets are per head (`key=file.glb:7000`) because QEM spends triangles where the curvature is and hair is nothing but curvature: on a model whose hair is half the mesh, the face starves at a budget that suits a smoother head. It samples the base-colour map bilinearly at full resolution into vertex colours (there is no texture path in this renderer), converts sRGB to linear on the way — not optional; `outputEncoding` is sRGB and this three build treats material colour as linear, so the bake that skipped it produced three heads the colour of paper — and normalises into a unit box so `HEADFIT` means rig units. Normals are not stored; they are recomputed at load, which is a quarter of the vertex payload. `node tools/bakehead.js key=head.glb[:tris] ...` |
| `faces.js` | The named origins, front and back, in one row. `origin.js` will happily report THE PRINCE IS WHOLE while he stands there in the default hash-rolled body, because every assertion in it is about state — this is the only way to check the claim "long white hair and a dusty black coat" instead of asserting it. Four things it caught that reading the source did not: the faction blue showing through every gap in the trim (a named body has to replace `bodyCol`, not paint over it), the worn armour drawing on top of the coat in its own palette, white hair on a pale face reading as one featureless block until a dark hairline and a fringe were put between them, and both heads of hair reading as *hats* — a wide slab resting on the crown with a level edge all the way round is a cap, and no amount of colour fixes it. `node tools/faces.js out.png` |
| `lines.js` | Every line of one race side by side, front and from behind, one column each. Written to answer "do the subraces have proper skins" by looking instead of by reading the table, and the answer on the first run was no: four golems came back as **one man in one blue shirt**, because a line's colour only ever reached the head and hands while the torso took `bodyCol` — the faction colour standing in for clothing — and the geometry underneath was the same rig every time. It found the second layer too, after the torsos were fixed: the four were still wearing dark brown work trousers, which is the single detail that gives away a thing poured out of clay as a man in a costume. Uses the cloned-camera trick from `heads.js` and frames off each body's own bounding box, so **relative size cannot be judged here** — a rock golem's `big:1.22` is normalised away. `node tools/lines.js golem out.png` |
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
  arrival lands on a tick where `wantFloor` is not set yet, which is why it came and went. The
  latch belongs where the crossing happens, after every reason not to cross is ruled out.
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
  roll. `guns.js` fires exactly ONCE inside its window: it landed on two worldgen streams and
  missed on a third, which reads as "THE LANCE DOES NO DAMAGE IN PLAY" and is really a coin
  coming up tails. `gunnery.js` watched six seconds, which catches the weapon mid-windup — two
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
  · `npm run check` — the serial chain, unchanged, for a push.
  · Run the full suite ONCE, at the end. Running it two or three times inside one sitting is
    the largest avoidable cost there is, and running two at once invalidates both.
  · roads.js was 233s — twenty-two percent of the suite in the file whose negative control
    passed. Halved to 112s after checking what the halving costs: still thirteen legs, both
    stall checks intact.
