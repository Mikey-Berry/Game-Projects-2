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
| `touch.js` | The touch layer, driven by real `TouchEvent`s built inside the page — that a tap on one of your own selects, a tap elsewhere orders, a hold reaches the right-click path, one finger pans, two pinch, the box-select toggle holds, the panel cycle shows one sheet at a time, and the manual override takes. **And, more importantly, that none of it touches desktop**: mouse mode still detected, touch controls still hidden, quality dials left alone, left-click still selects and right-click still orders. Desktop is the priority; a mobile scaffold that changes mouse behaviour is a regression whatever else it does. Two things it found that reading the source did not: `innerWidth` is *not* the layout width under real mobile emulation (it reported 1572 against a true 393, so the renderer was sizing an eighteen-megapixel framebuffer for a phone and every screen↔world conversion was dividing by the wrong number), and a long press locked the gesture so the drag after it did nothing. It also checks the topbar shrank, the gear carries what came out of it, the sheet cycle shows one thing at a time, and — by drawing each control's glyph to a canvas and comparing it against a private-use code point nothing has — that no button is rendering as a tofu box. It cost five false alarms of its own, all of them mine and all now written into the file: `offsetParent` is null for *any* fixed-position element; taps aimed at a character's head miss because the hit test raycasts to the ground plane; a CDP round-trip in this environment takes longer than the 460ms hold threshold, so every "tap" arrived as a hold; the panel-cycle assertion counted two sheets after the log became a third; and the first glyph check measured advance width against `M` and flagged the hamburger, which renders perfectly well and simply falls back to another font. |
| `mobile.js` | What a frame costs and whether a phone could hold it: triangles submitted and **which mesh they belong to**, draw calls, save size against a mobile storage budget, how many touch targets are under 44px, and what falls off a 393px screen. **The frame rate it can report at a phone viewport is not a phone prediction** — everything here is SwiftShader, software rasterisation with no GPU, orders of magnitude slower than any handset. Quote the triangle and call counts, which are device-independent; never the fps. It overturned the plan it was written for on its first run: the obvious suspect for a two-million-triangle frame was six hundred characters, and characters turned out to be **0.6% of it** — 367 triangles a body — while half the frame was the fog overlay, a single sheet with a vertex every two tiles across the whole world. It then found the opposite is true of draw calls: characters are 1.2% of the triangles and **91% of the calls**, at 28 separate meshes a body. |
| `simcost.js` | Isolated `update()` cost plus a 20-second soak. The primary perf number. |
| `bench.js` | Fuller picture: draw calls, scene objects, shadow casters, micro-costs for the hot paths, autosave size, and a dyn-group leak check. Writes a JSON file per label. |

### Visual

| harness | what it renders |
|---|---|
| `wep3.js` | One character holding one weapon, close. `node tools/wep3.js w_nod out.png` |
| `swing.js` | A swing, frame by frame, as a contact sheet — one row per weapon so a light blade and a heavy one can be read against each other. Animation is the one thing here that cannot be checked with a number, and a pose that looks right in the source can still read as a machine cycling. It steps the sim by hand at a fixed dt so frames are evenly spaced in *sim* time rather than wall time. `node tools/swing.js w_nod,w_kat out.png` |
| `faces.js` | The named origins, front and back, in one row. `origin.js` will happily report THE PRINCE IS WHOLE while he stands there in the default hash-rolled body, because every assertion in it is about state — this is the only way to check the claim "long white hair and a dusty black coat" instead of asserting it. Four things it caught that reading the source did not: the faction blue showing through every gap in the trim (a named body has to replace `bodyCol`, not paint over it), the worn armour drawing on top of the coat in its own palette, white hair on a pale face reading as one featureless block until a dark hairline and a fringe were put between them, and both heads of hair reading as *hats* — a wide slab resting on the crown with a level edge all the way round is a cap, and no amount of colour fixes it. `node tools/faces.js out.png` |
| `town.js` | A town from above. `node tools/town.js out.png <townIndex>` |

## Notes

- `update()` takes a `dt`. Calling it bare sends NaN through every position in the world and
  the first symptom is an unrelated-looking throw out of the audio envelope.
- `syncChars` builds a bounded number of character meshes per frame, so a probe that spawns
  test characters has to wait several seconds, or clear `chars` first, before the meshes exist.
- Worldgen is seeded from a constant, so repeat runs are identical. That proves determinism,
  not robustness — vary the seed to test that.
- `camX`/`camY` are the look-at point, not the camera position.
