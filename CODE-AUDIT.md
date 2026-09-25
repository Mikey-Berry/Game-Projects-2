# Dustward code review — 2026-09-24

A line-by-line read of `dustward3d_hd.html`, done on `claude/dustward-code-review-m1ek3v` and
branched from `main` at 30223c9. I was asked to look for needless repetition, dead features and
inefficiencies. Reading every line also turned up ten real bugs, and those come first.

This replaces the audit of 2026-09-17, which is in git at `30223c9:CODE-AUDIT.md`. §8 says what
that audit got right and what it missed. §9 checks this branch against PR 39, which was open at
the same time: one silent break if the two are merged naively. PR 39 has since been merged
(9e92e86), and this branch merged it back in with the resolution §9 describes.

Every number here comes from the file or from the running game, not from memory, and the
appendix says how to re-run each one. Items marked **fixed** are in this branch and checked by a
harness. Everything else is a finding I did not change, and it says why.

| | before | after |
|---|---|---|
| `dustward3d_hd.html` | 46,064 lines, 3,206,130 bytes | 45,935 lines, 3,196,597 bytes |
| ESLint `no-unused-vars` | 31 | 4 (three are hooks the harnesses use; one is a counting loop) |
| lines with a `typeof` check | 51 | 14 (each one left tests something that can really be absent, or a value's type) |
| per-frame render signatures, 1,688 bodies | 2.19 ms/frame | 0.22 ms/frame |

---

## Where to start

Ranked by what each one buys against what it costs.

1. **Every four-legged beast was drawn at the north edge of the map** (§1.1). *Fixed.* Elk,
   hounds, mules, wyrms, Bone Mules and carts had all been drawn at world z = 0 since
   2026-09-13. No harness checks where a mesh is drawn, so it lasted 42 commits.
2. **A built Waylines could not be used** (§1.2). *Fixed.* It is a researched building, and the
   only way to open it had never been reachable.
3. **One render signature cost 2 ms every frame** (§2.1). *Fixed.* `syncRedoubts` filtered the
   whole roster once per cave, on every frame, just to decide whether to rebuild. That was 90%
   of the per-frame signature cost.
4. **Decide what the authored barks are for** (§5.1). 53 hand-written lines of dialogue are
   attached to characters and never spoken, and one harness asserts they exist. This is a
   design call for the owner, not a cleanup.
5. **Add the lint** (§6.1). This is the third audit in a row to recommend it. This time it
   would have caught 27 unused variables, a self-comparison and a stray `}` in the stylesheet
   that silently dropped a rule.
6. **The per-step singleton ticks** (§2.3). This was the 2026-09-17 audit's #3 and it is still
   open. It now has a measured cost: `gauntTick` is 0.77 ms of a 7.07 ms step (11%), most of
   it spent walking the whole roster to find one or two bodies.

---

## 1. Bugs — **fixed**

`tools/review.js` stages each of these the way a player would meet it and measures the result
on the running game. It is in `npm run check` and in `run.js`. Here is its output on both
builds, verbatim:

| # | on 30223c9 | on this branch |
|---|---|---|
| 1 | `!! A BEAST IS DRAWN OFF ITS TILE (1151.8, 1151.5, 1150.6, 1151.1 tiles out)` | `4 quadrupeds beside the squad, each drawn within 0.00 of its own tile` |
| 2 | `!! RIGHT-CLICKING A WAYLINE DID NOT OPEN IT — the party walked onto the stone` | `right-clicking a built wayline opens "WAYLINE — GREENREST"` |
| 3 | `!! THE HOST CAME APART WITH REMAINS IN THE RELIQUARY` | `a bound body with 40 remains in the Reliquary and none in the wagon is held for another day` |
| 4 | `!! THE CIRCLE REFUSED WITH THE REMAINS IN STORAGE (Missing materials.)` | `the circle binds a Longdead from remains kept in the Reliquary` |
| 5 | `!! THE WAGON FED A RISEN (1 fruit gone)` | `a risen handed a greenfruit from the wagon refuses it, and the fruit stays in the wagon` |
| 6 | `!! TRIBUTE AT -250 LANDED AT -100` | `tribute to a town at -250 buys its ordinary few points (now -235)` |
| 7 | `!! 1 CORPSE(S) IN corpses BUT NOT chars — invisible, and gone on the next save` | `sixty days of an emptied Hollowmere yard, and every corpse that arrives is on the roster` |
| 8 | `!! A RESIZE PUT THE PIXEL RATIO BACK TO 2` | `CAP 1.0 on a 2x screen is still 1.0 after the window is resized` |
| 9 | `!! A MINDLESS RISEN WAS PUT ON CRAFT` | `ctrl+right-click a workbench with a mindless risen selected, pick ASSIGN: CRAFT, and it is refused` |
| 10 | `!! THE DEAL CAME BACK AS null (watched false)` | `the Dame's deal and the watch it sets both come back from a save` |

### 1.1 Quadrupeds were drawn at the map's edge

This is the quadruped branch of `syncChars`:

```js
e.g.position.z = (e.g.position.z || 0) * 0 + 0;
```

`e.g` is the body's group, and the group holds its **world** position, set a few lines above.
Every frame, this line moved every beast in sight (except constructs and bipeds) to z = 0, the
map's north edge. The comment right beside it says *"the group carries the world pos; lean on
the torso"*, so the line contradicted its own comment. The next line,
`e.torso.position.y = (e.torso.position.y || 0)`, did nothing.

It came in with 33dfb2e on 2026-09-13, the change that added the wyrm's fight animation, four
days before the last audit. Nothing noticed, because no harness checks where a mesh is drawn,
only where a body *is*. I deleted both lines. What remains is what the comment describes: the
torso tilts, and the group stays where it was put.

### 1.2 The Waylines building could not be opened

The right-click dispatch has a branch, `else if(ws.type==='way') openWayline(ws)`, but the list
that picks `ws` never contained `'way'`. So `openWayline`, the only caller of `waylineCross`,
could not be reached, and right-clicking a built wayline just walked the party onto it. The
list has lacked `'way'` since the commit that added the branch (ccf7acf). `tools/waylines.js`
calls `waylineCross()` directly, so it passed all along. The fix adds `'way'` to the list, with
a comment saying why it has to be there.

### 1.3 Storage was invisible to two undead costs (#3, #4)

- **`hostUpkeep`** charged each bound body's remains from the wagon's `stash.remains` only.
  `depositInv` puts remains in storage bins, so a player who kept them in a Reliquary watched a
  risen come apart with 40 remains on the shelf. The fix: if the stash is short, top it up from
  bins and packs with `campTake`, the function every other cost already uses. The top-up
  takes whole remains, so with a fractional bill it overpays. The first version of this fix
  left the difference in the wagon: 0.50 remains in the cart of a player who keeps every one
  of them in a Reliquary. PR 39's gate searches the cart and counts any `stash[k] > 0` as
  grave-goods (§9), so the overpayment now goes back to a bin. `review.js` #3 also asserts
  that the wagon is still empty.
- **`craftUndead`** checked it could afford the bill against the stash only
  (`Object.keys(bill).every(k => stash[k] >= bill[k])`), but paid with `campTake`, which draws
  from stash, bins and pockets. With the materials in a Reliquary, the Circle said *"Missing
  materials."*. It now uses `canAfford(bill)`, which reads from the same places the payment
  takes from.

### 1.4 The wagon fed the dead (#5)

Item use is written twice: once in the wagon panel (`refreshInv`) and once in the kit backpack
(`openInventory`). The two copies had drifted apart. The backpack's EAT refuses undead; the
wagon's EAT consumed the food and raised a hunger that nobody reads. I added the same refusal
to the wagon. §5.5 covers the duplication itself.

### 1.5 A hated town was pulled up to -100 (#6)

Town standing has a floor of -300. `dropRep` uses it, job rewards use it, and so do twelve
talk-tree sites. Thirteen other sites clamped to `[-100, 100]`. For a town already below -100,
any of those snapped standing *up* to -100. That applied to tribute (+15 from -250 landed at
-100), and to penalties as well. Declaring war (-25), exposing the Aldercotts (-35), a cunning
leader's -8 and four small in-town hits all *improved* a hated town's standing. All 13 now use
-300. The ±100 clamps that are left are different scales (`fame.repute`, `regard`, `rel`,
`guildRep`) and are correct.

### 1.6 A third pauper spawner left corpses off the roster (#7)

The daily tick still had the original Hollowmere pauper spawner (12% a day). It pushed each body
to `corpses` but not to `chars`. `hollowmereBurials` replaced it, and its comment says it was
written because the yard stayed empty. That function pushes to both lists, but the old spawner
was never removed. A corpse that is not in `chars` is not drawn and is not saved. I deleted the
old spawner. The harness empties the yard and runs sixty days, and every corpse that arrives is
on the roster.

### 1.7 A resize removed the pixel-ratio cap (#8)

`applyOpts` applied the player's PIXEL RATIO option, but `fit3d` called
`setPixelRatio(Math.min(devicePixelRatio, 2))` on every resize and orientation change.
Touch devices default to a cap of 1.0, so **rotating a phone quietly restored 2x**, four times
the fragments. The fix is one `dprCap()`, used by both.

### 1.8 Four job setters, and one skipped a check (#9)

"Set this unit's job" was written four times:

- the primary JOB button;
- `mkJobButton`, which is only ever called with `2`, so its `which === 1` branches were dead;
- the ctrl/shift+right-click chord;
- the ctrl+right-click building menu's ASSIGN.

The fourth checked only research-vs-risen and not `NEEDS_A_MIND`. So a mindless risen could be
put on CRAFT through a workbench, which the comment above `NEEDS_A_MIND` says cannot happen.

Now `canWork(u, jk)` and `setJob(u, jk)` sit beside `NEEDS_A_MIND` and all four use them. The
primary button is `mkJobButton(1)`, which keeps its upward-opening menu and its own log
wording. `patrolPost`, `patrolIx` and `patrolN` were written and never read (the file's own
comment near `assignPatrolPosts` already said so for the last two), so the four setters no
longer write them.

### 1.9 The Aldercott deal was not saved (#10)

The snapshot saved `estate.told`, a field nothing has set since the expose branch was
rewritten. It did not save `estate.deal` or `estate.watched`. After a load, the deal was
`null`, so the Dame's once-only gift of 24 fruit, 3 rum and +8 standing could be taken again.
The invitations also resumed while an exposer stood in the square. Both are saved now. Older
saves load with `null`/`false`, which is what they already produced.

### 1.10 Smaller, and verified by reading

- **Reward texts promised the wrong item.** Four quest rewards read "2 Codices", "3 Codices"
  or "a Codex", but each grants `tome`, a Weathered Tome worth 400g. A `codex` is the 6,000g
  Transmutation Codex, and it is a quest key. I fixed the text, not the grant: granting the
  codex would give away the Transmutation key.
- **The name-tag timer counted frames, not seconds.** `c.idT -= 0.016` ran once per render
  frame, so a tag lasted 3 s at 60 fps, 1.25 s at 144 Hz and 6 s at 30 fps.
  `renderOverlay(rdt)` now takes the real frame time.
- **Two CSS variables were never defined.** `--gold` is used 16 times, in the stylesheet and in
  inline styles, and `--muted` twice. Neither is in `:root`, so the character creator's
  selected state was never gold. They are defined now. `--gold` is `#c8a86a`, the colour
  `.ccopt.on`'s own background is a tint of.
- **A stray `}` in the stylesheet made Chromium drop the next rule.** The rule it dropped was
  `.overlay .help`, which matches nothing since the manual became a modal. I removed the brace,
  that rule and its phone variant, `.overlay .help b`, `.trow .tp` and `.dfig svg`. Nothing in
  the markup or the scripts uses any of them.
- **Carry checks had drifted.** Six places ask "is this body being carried?" and each writes
  its own full-roster scan, although `whoCarries()` exists. Two of them (the raise job and the
  NPC necromancer's scan) checked `o.carry` and missed `carryList`, so a corpse on a Bone Mule
  could be raised off its back. Both now use `whoCarries`, after the cheap distance test.
  `carrionFodder` gets the missing `carryList` check. §5.7 covers the other three.

---

## 2. Performance

### 2.1 The per-frame signatures — **fixed**

`render()` calls 17 `sync*` functions every frame. Each builds a signature string and rebuilds
its group only when the string changes. Neither `simcost.js` nor `bench.js` timed them. They
were the largest per-frame cost outside three.js that this review found:

| median ms/frame, 1,688 bodies | 30223c9 | this branch |
|---|---|---|
| `syncRedoubts` | 1.97 | 0.06 |
| all 17 signatures | 2.19 | 0.22 |

`syncRedoubts`' signature ran `chars.filter(...)` over the whole roster **once per cave**, then
sorted and joined the result. That made the cost O(caves × roster), every frame. Its build body
recomputed the same predicate. Now `yoursBelow()` gathers your bodies underground in one pass,
and both the signature and the build use it. The signature string is the same as before, so it
rebuilds at exactly the same moments.

For scale: 2 ms is an eighth of a 60 fps frame budget, spent deciding not to do anything.

`tools/sigcost.js` is new and runs this as an interleaved A/B with a per-signature breakdown.
The next biggest are `syncRoofs` (0.07 ms) and `syncUndercroft` (0.06 ms). Both walk the whole
roster every frame, and neither is worth changing on its own.

### 2.2 Exact trims — **fixed**

Each of these is a reorder or a hoist of pure code, so behaviour is unchanged. The full suite
checks that (§7).

| where | what | measured |
|---|---|---|
| `broodTick` | checked `broodAlive()` (a full-roster `find`) **before** `theDoor`, every step, for the whole game. The brood only exists while the Door does. | `broodAlive` 0.099 ms/step → no longer appears in the profile |
| `maxMana` | called `rawMaxMana(c)` twice (each call loops 6 gear slots), for every body, every step, in `physics` | 0.180 → 0.128 ms/step |
| `bodyTick` | called `nearShack(c)` (a `pBuilds` scan) for every body at 4 Hz before checking whether the body had orders | now checks the cheap conditions first |
| `decorAt`, `nodeDepleted`, `useNode` | each called `rawDecorAt` twice (it scans towns and ore fields) on a path the file itself calls hot | now `nodeUsedUp(x, y, raw)`, one lookup |
| worldgen | made a second full pass over the 1.44M-cell height field to recompute `_terrMaxY`, which `raiseMountains` had already computed, with no writes in between | one pass |
| `deconstruct` | looped over an expanded box, skipped the margin, and called `blocked.delete` twice with identical keys | loops over the footprint, one delete |
| rift billboards | for **each** rift, re-spun every mesh in the shared rift group | once per group per frame |
| `restore` | loaded `nodeUses` twice (set, hide and show; then clear, set and hide again) | once |
| render init | asked `nodeDepleted` (so `rawDecorAt`) of every tree, rock and vein on the map, although only a tile in `nodeUses` can be depleted, and `nodeUses` is empty that early | walks `nodeUses` only |

### 2.3 Still open, now measured

A pure `update()` loop on the default 1,688-body world, sampled with CDP. Baseline:
**7.07 ms/step**.

| inclusive ms/step | what | why it costs |
|---|---|---|
| 0.775 | `gauntTick` | the six rows under it, as well as its own work |
| 0.182 | `coilTick` | `chars.filter(c => c.coil && …)` every step |
| 0.158 | `inquestTick` | `chars.find(c => c.inquisitor && …)` every step |
| 0.099 | `broodTick` | its `broodAlive()` walk, which is §2.2's fix |
| 0.098 | `choirTick` | a `for…of chars` walk, every step |
| 0.067 | `cairnTick` → `cairnFood` | a hand-written carry scan per corpse, per cairn |
| 0.064 | `corpseSiteTick` | the `_pop` walk |
| 0.098 | `sixfoldTick` (called from `update`, not from `gauntTick`) | a `for…of chars` walk to find one or two bodies |

**Recommendation, the same one as last time:** gather these in `rebuildCharGrid`, which already
walks `chars` once a step and already gathers `warders`, `charmed`, `carriers`, `downFolk`,
`belowFolk` and `lamps`. One caution I did not see written down: `riftTick` and `doorTick`
spawn gaunts partway through a step, *before* `gauntTick` and `sixfoldTick` run. A list built at
the top of the step would see a newborn one step late. That is harmless, but it is a behaviour
change and the comment should say so. This is why I did not make the change as a cleanup.

Others, in rough order of how likely they are to matter in a real game:

- **`refreshSquadBar` + `refreshCharPanel` tear down and rebuild both panels at 4 Hz** whether
  or not anything changed. They cost 0.67 ms + 0.46 ms, plus a forced layout
  (`liftLogAboveSquad` reads `offsetHeight`). Each rebuild also destroys whatever the cursor is
  hovering or focusing. A cheap signature, like the ones in §2.1, would skip almost all of
  them. This is the next one I would do.
- **`colorKeyOf(c)`** builds a string of about 25 fields per in-sight body, per frame, to detect
  appearance changes. It takes 2.3–2.7 ms for all 1,688 bodies, but only bodies in sight pay
  it. A version counter on the body would replace it.
- **Twelve separate `if(wtick) for(const c of chars)` passes** in `update()` (boss heal,
  plague, sickness, town heal, squad barks, civ wander, the roaming necromancer, drifters,
  bonds, the NPC necromancer, boss barks…). Merging them changes the order `rnd()` is drawn
  in, so the result is not exact. Worth doing on purpose, not as a cleanup.
- **`fireRanged`** makes two full-roster `filter` calls per shot, for tangle and volley.
  **`sweetheart(c)`** does a `chars.find` by id on every swing for anyone with a partner, while
  `charById` exists. Both matter only in large battles.
- **`findPath`** allocates a `Map` for g, a `Map` for came-from and a 3-element array per push.
  A typed-array open set with a generation stamp would be much lighter, but that is a rewrite.
- **`researchTick`** runs every step. Through `benchCrew`, it filters the whole roster per bench
  while research is running. The default world has no research running, so the profile above
  does not show it. Measure it on a mid-game save before deciding.

---

## 3. Dead code — **removed**

Found with the same reachability pass as last time (appendix), plus ESLint over the extracted
script, plus a property-level scan for fields that are written and never read.

**Unreachable declarations.**

- The `LICH_HOOD` cluster (`LV_*` constants, `LICH_HOOD`, `_lichHoodGeo`, `lichHoodGeo`; 7,069
  bytes). It is a baked hood mesh that nothing constructs.
- The globals `demilich`, `gearFor`, `ccMode` and `bloodMoonWarned`, each written and never
  read. `tools/nights.js` reset `bloodMoonWarned` and no longer does.

**Unused locals (27).**

- `hallR`, the four audio node handles (`windSrc`, `gritSrc`, `lapSrc`, `lapFilt`), and a
  `starved` counter.
- `now` in `revive`, `hourAcc`, `farmsIdle`, and `deadArmy`, a daily full-roster filter whose
  result was never used.
- `CH`, `S = 1`, `mmRaw`, a Dame counter, two `from`s, `dx2`/`dy2`, `hi`, two `sx`s.
- `onDeck`, `routed`/`straight`, `_gridFiled`, `glow`, `cols`.

**Code that does nothing.**

- Three `const rib = …; void rib;` pairs.
- A leg rotation that sets zero to zero.
- `0.34*0`.
- An IIFE around `_boxSrc`.
- An unreachable drifter branch in `factionColor`: drifters return earlier, so `#a08858` was
  never shown.
- A no-op ternary in `occupiedFloors`.
- `if(c)` straight after `if(!c) return`.
- A dead `v < 19` check in `restore`, straight after a `return` for `v < 20`.
- `y1===y1`, a self-comparison that was always true, now `i !== p.x`, which is what it meant.

**Fields written and never read.**

- On towns: `pref:` ×7.
- On bodies: `morale` ×2, `maxMana = 200` (`maxMana` is a function, so the property was never
  read), `licensedAgainst`, `redoubtRef`, `noCorpse`, `dragT`, `routeTxt`, `noGait`,
  `freeToTake`, `patrolIx`, `patrolN`, `patrolPost`.
- Elsewhere: `mtnId`, `growth: 0`, `cot: true` ×2, `warrenRouted` and `warrenStraight`.

**Guards that could not fail.** I removed 37 `typeof X` checks on names declared with
`let`/`const`/`function` in this file. Those guards never protected anything: a `typeof` on a
`let` still in its temporal dead zone throws, and everywhere else the name exists. I also
removed seven `AU.x && AU.x(…)` guards on methods the audio module always defines. Of the 14
lines left, seven test for something that can really be absent (`THREE`, `performance`,
`CompressionStream`, `decorByTile`, which is a `window` property, and `nodeDepletedSafe`'s
guard). The other seven test a value's type (save fields, a dialogue node's `line`).

**Kept deliberately.** `pitInside`, `cairn` and `unstuckN` are read only by harnesses. They are
three of the four `no-unused-vars` hits that remain. The fourth is `for(const k in pacts)
drift += 0.2`, a count. The `NATIVE_*` toggles look dead from inside the game, but `lich.js`,
`roads.js` and `native.js` flip them for A/B shots.

---

## 4. Repetition — **merged**

| what | copies → 1 |
|---|---|
| `shade(hex, k)`: `'#' + new THREE.Color(hex).multiplyScalar(k).getHexString()` | **17** → 1. That was two top-level functions (`shadeHex` and `shade`, byte-identical), five local redefinitions inside `buildCharMesh` (two of them `const shade` shadowing the global with the same body), and ten inline copies. A local *string* named `shade` in the redoubt helm is now `seam`. |
| `rbox` / `rb`: an `obox` followed by `rotation.set` | 2 → 1, hoisted once in `buildCharMesh`; 32 `rb(` calls renamed |
| `B = (...) => { e.boxBody.push(obox(...)); return … }` | 2 → 1, hoisted |
| `oldGodPlate`'s `B2` wrapper around `obox` | removed; it takes `obox` |
| the job menu, and the job setters | 4 → `canWork` + `setJob` (§1.8) |
| pack-mule creation (bar purchase, default origin) | 2 → `makeMule(x, y)` |
| "fetches its best price in X" rumour (`makeRumor`) | 2 → `priceTip(t)` |
| bench-post offset in `tradePost` | 2 → `benchPost(c, b)` |
| DPR cap (`applyOpts`, `fit3d`) | 2 → `dprCap()` (§1.7) |

---

## 5. Raised, not changed

These are questions of behaviour or design, or changes big enough to need a decision.

### 5.1 The barks are authored and never spoken — **your call**

`c.barks` is set in eight places: the redoubt's vat-soldiers, three of the immortals in
`spawnImmortals`, the Archivist, the thing in the rock, and copies of the `bark:` fields in the
deep-folk and gaunt tables. That is 53 hand-written lines, some of the best writing in the file
(*"I have no lungs and I am still talking. Work out for yourself which part of that is the
trick."*). **Nothing reads
`c.barks`.** The only barks spoken are `BOSS_BARKS[c.bossKey]` and the townsfolk's table.
`c.barks` has been write-only since the original upload (5bd84bc).

`tools/watchers.js:210` asserts `m.barks.length >= 2` and prints *"and both of them talk"*.
The project notes say the same thing about the Eyes of Ainzopha'ar: *"Both talk, in `barks`"*.
So the record and the harness both believe it. That is the same shape as the `parley.js` claim
the last audit fixed: a green test about a feature that does not run. `talkTo` does not read
them either; its odd characters (the Coil, drifters, NPC necromancers) have their own inline
lines.

The two options:

- **Wire them up.** This is a few lines beside the `BOSS_BARKS` block: the same `barkCd`
  cooldown, and `say(c, pick(c.barks))` when a player body is near. I recommend this. The
  writing is already done and it is good.
- **Remove them**, along with the `watchers.js` assertion.

Either way, `watchers.js` should stop claiming they talk until they do.

### 5.2 Hollowmere breaks the light budget — **fixed by PR 39**

PR 39 (now merged) turned these lamps into ordinary town fires, so this finding is closed. The
original finding:

The torch-pool block, *"THREE FIRES, AND NEVER A FOURTH"*, budgets the scene at three point
lights. Every light adds a per-fragment loop to every Lambert shader. The Palefrond comment in
`syncUndercroft` chose emissive over `PointLight` for the same reason. Hollowmere adds **four
permanent `PointLight`s** (its violet grave lamps), which makes seven, everywhere on the map,
all the time. Fixing it changes how the game looks, so I left it to you. Either make the lamps
emissive only (they already have an unlit `MeshBasicMaterial` head), or let them join the torch
pool.

### 5.3 Half of the conviction design is not wired

`CONVICTIONS` weights `sack` (six convictions), `heal`, `retreat`, `rescued`, `mercy` and
`formula`. `deed()` is never called with any of them. `git log -S` finds no call in the
history, so they were written but never wired, not lost later. Loyal's `rescued: 3.0` and
Compassion's `heal` and `sack: -3.0` never move anyone. Related:

- **`CRIMES.formula`** (bounty 260, *"working a formula inside the walls"*) is never raised.
  Hollowmere's exemption for it is also unreachable.
- **Sanctified Ash (`s_ash`)** is produced, but no recipe consumes it, although its description
  promises that *"an alchemist has other uses"*.

### 5.4 The Dame's deal is a latch, not a state

`estate.deal` is only ever tested for truthiness, as a once-only guard, so the difference between
`'kept'`, `'told'` and `'taken'` is never read. `'taken'` calls `orchardOpen`, which is exactly
what walking the rows or "Show me" already do. The Dame's *"do not come back"* is not enforced,
and `'kept'` ("Greenrest follows the Aldercotts") does not stop the invitations. §1.9 fixed the
save. Whether the deal should *do* something is a design question.

### 5.5 Item use is written twice

The wagon panel (`refreshInv`) and the kit backpack (`openInventory`) each have their own
EQUIP/EAT/FEED/READ handlers. There are also two equip paths: `equipFromStash`, and an inline
`invTake`/`invAdd`. §1.4 was the first bug from the copies drifting apart. One
`useItem(c, id, from)` would stop the next one.

### 5.6 Playtest cheats ship in Options

*"GIVE 10,000 GOLD — playtesting only"* and *"REVEAL MAP — playtesting only"* are visible to
every player. If that is deliberate, fine. If not, gate them behind a flag.

### 5.7 Repetition I did not merge

These are real, but each one needs a design decision or touches behaviour:

- **`shedPhylactery` / `shedHusk`**: about 20 shared lines. **`reEtchHusk` / `rebuildLich`**:
  about 22.
- **The carry scan.** Three sites still write their own (`saltmere`, `carryTarget`,
  `cairnFood`). `cairnFood` is also O(corpses × roster) per cairn per second.
- **UI idioms**, which a small `ui.js`-style block would cover:
  - 14 inline copies of `$('modal').style.display='none'; modalOpen=false;`. There is an
    `openModal` but no `closeModal`.
  - 9 local `mk` button helpers.
  - 13 hand-built section headers.
  - `theStop` / `theReckoning`, which define identical `close` and `mk` helpers.
- **Three trade UIs**, each with its own buy/sell loop. The bar's and the caravan's are the
  same block.
- **`nearestEnemy` / `squadTarget`**: the same candidate filter.
- **The town guard's jail march**: written twice in `ai`.
- **`mendOnePart` / `treatOnePart`**: the same scan for the worst part.
- **`seedGraveyard` / `hollowmereBurials`**: the same pauper construction.
- **`btn-save`** runs JSON.stringify and gzip on the snapshot twice, once for localStorage and
  once for the file. SHARE FILE does it a third way.
- **`restore`** calls `computeVision()` twice, and `revive` assigns `npcNecro`, `eater` and
  `construct` twice each.
- **Selling at a counter ignores storage bins.** `ownPool` and `poolTake` duplicate
  `campHas`/`campTake`, but without the bins. This may be deliberate; if it is, it deserves a
  comment.

### 5.9 The night never sends anything — **found 2026-09-25, your call**

`gauntTick` spawns the night's Watchers near your people, up to a cap of
`3 + tier*2 + wrath/60` (six times that under a blood moon). The count it checks against is
**every living gaunt-faction body in the world**, and the depths alone hold hundreds of them,
none of them `nightborn`. Measured on day one of the default seed, before the crater: 443
against a cap of 3. So `living.length >= cap` is always true, and this spawner never runs.
Whatever the nights do now, they do it through the tears, the blood moon and the sites. The
crater's 27 Watchers change nothing about that, because the cap was already exceeded.

The likely intent is to count only the night's own arrivals on the surface
(`c.nightborn && (c.floor || 0) === 0`). That would switch the spawner on and make every night
noticeably more dangerous, so it is left for you to decide.

### 5.8 Write-only fields the harnesses read

`bogWarden`, `pitGuard`, `billeted` and `pitFighter` are written by the game and read only by
`mere.js`, `pit.js`, `albedo.js` and `salt.js`. They are harmless, but they are scaffolding.
Removing them means changing those harnesses to identify bodies another way.

---

## 6. Structure and tooling

### 6.1 There is still no linter

This is the third audit to say so, and the evidence has grown each time. ESLint's
`recommended` set over the extracted script found, on 30223c9:

| rule | 30223c9 | this branch | note |
|---|---|---|---|
| `no-unused-vars` | 31 | 4 | three harness hooks and a counting loop (§3) |
| `no-self-compare` | 1 | 0 | `y1===y1` |
| `no-useless-assignment` | 13 | 12 | mostly `let x = null` (or `false`, or `''`) that every path overwrites; left |
| `no-useless-return` | 7 | 7 | left |
| `no-unmodified-loop-condition` | 4 | 4 | `while(!bastion && spot)` runs once. The others are fine. |
| `no-fallthrough` | 1 | 1 | deliberate (`case 'wood': case 'stone': …`), with a comment between them |
| `no-undef` | 6 | 6 | `decorByTile`/`_decorHiddenMx`, which are `window` properties; known |
| `no-redeclare` | 1 | 1 | `ai` collides with a name in the `globals.browser` list; a false positive |

It would not have caught the stray `}` in the stylesheet. A CSS parse that counts rules against
selectors would, and so would comparing `var(--x)` uses with `:root` definitions. Both are a few
lines added to the same pass. `prep.js` already has the hook; the 2026-09-17 appendix has the
AST half.

### 6.2 Two new tools

- **`tools/review.js`** (in `check` and `run.js`) pins all ten bugs in §1. It reads 10/10 red on
  30223c9 and 10/10 green here.
- **`tools/sigcost.js`** is the interleaved A/B for the per-frame signatures (§2.1), with the
  sim step as a control. Nothing timed that part of the frame before.

`tools/rally.js` printed *"`patrolIx` is finally read"*, which was not true: the behaviour it
checks runs through `patrolAng`. It now says what it checks.

### 6.3 Comments are 39% of the script

The script has 5,013 comments totalling 1.225 MB. 129 of them run to 15 lines or more
(211 KB). That is not a defect: most explain *why*, and several of the bugs above were found
because a comment and the line beside it disagreed. But it is over a third of every download.
If download size ever matters, a release step that strips comments would recover it without
touching the source.

---

## 7. Checked and found sound

- **The full suite: 164 of 166**, on this branch's first commit (3d12b35), in 8,926 s. Two reds,
  both explained, both green now:
  - **`command.js`** was deterministic and green on 30223c9. It was not the forage order: the
    band's spot comes from `findOpenNear`, which draws `rnd()`, and deleting the old pauper
    spawner (§1.6) removed one draw a day. That put the far chest's fixed bearing in the sea.
    Putting back that one draw and nothing else turned it green, which proves the cause. The
    harness now tries the four ways out and is green on both builds.
  - **`review.js`** ran last. By then it carried the wagon assertion added for §9, and the
    build under test predated that fix. `run.js` printed a bare ✗, because it only echoes
    lines starting with `***` or `!!`. `review.js` now ends a red with a `***` line that names
    what came back (`theReliquaryFeedsTheHost`, on that build). It is green on the current
    source.

  The only game change since that run is §1.3's overpayment going back to a bin. `review.js`,
  `upkeep.js` and `reliquary.js` cover it, and all three are green. The baseline (30223c9)
  passed the 60 harnesses it reached before I stopped it to free the machine.
- **Determinism.** `Math.random` appears 11 times, all inside the audio module `AU`.
- **Hygiene.** No `var`, `console.log`, `TODO`/`FIXME`/`HACK`, `debugger`, `eval`,
  `new Function` or `window[…]` dispatch. The last one is why the reachability pass is sound.
- **The removed guards.** Each of the 37 removed `typeof` checks was matched by AST to a
  `let`/`const`/`function` declaration in the same script. Each of the 14 lines left was read
  and kept for a reason (§3).
- **Save compatibility.** `sChar` names every field it saves, and none of the write-only
  fields in §3 was among them (if one had been, the save would have read it). The format
  changed in one place: the estate's dead `told` became `deal` and `watched`, and an older save
  loads those as `null`/`false`, which is what it produced before. `tools/save.js` and
  `tools/roundtrip.js` pass.

---

## 8. What the 2026-09-17 audit got right, and what it missed

**It held up on:** the `downFolk`, corpse-site and boss-loop fixes. None of those scans has come
back. The husk re-etch is still reachable. Nothing it removed has come back.

**Still open:** the singleton lookups (its #3, now measured in §2.3), the linter (its #2, now
recommended three times), deferring worldgen off the load path, and the shared harness
preamble.

**What it missed, and why:**

- **Both of the worst bugs here were already in the file when it was written.** The beast
  z-bug (33dfb2e) and the unreachable wayline (ccf7acf) both landed on 2026-09-13. Its method
  was reachability over *declarations*. That finds functions nothing calls. It cannot find a
  branch whose condition is never true (the wayline) or a line that is plain wrong (the beast
  z). Only reading does.
- **Its roster-scan counter could not see `for…of` loops or the render side.** It wrapped
  `find`/`filter`/`some` on `chars`, so `choirTick`, `sixfoldTick`, `corpseSiteTick` and every
  `sync*` signature were invisible to it, and `syncRedoubts` was the biggest of them. §2.3's
  numbers come from a sampling profiler, which sees everything.
- **Its CSS check** reported one unused class and missed two undefined variables and a stray
  brace. It checked classes against markup, but not variables against definitions, and not
  whether the stylesheet parsed.

---

## 9. Cross-check with PR 39

PR 39 (`claude/undercroft-forage-court`: the undercroft, forage and march order, the Court
start, town lights, sieges, ruins, the plague bell, the cart search) branched from the same
`30223c9` and was still open while this review was done. I trial-merged it into this branch in
a scratch worktree before either landed. PR 39 was merged first (9e92e86). This branch then
merged `main` using exactly the resolution below, and the resolved game file is byte-identical
to the one the trial run tested.

**Textual conflicts: five, all in the game file, all resolvable.**

| where | resolution |
|---|---|
| `theStop` | PR 39's new line (`'Hold the cart. Sheet off.'`), without the dead `AU.open &&` guard |
| warren routing (three hunks) | PR 39's `carveRun` and doorstep carving. The `routed`/`straight` counters and `U.warrenRouted`/`U.warrenStraight` stay deleted: no game code or harness on either branch reads them, and after the merge `straight` would be declared and never incremented. |
| after `syncUndercroft` | both: this branch's `yoursBelow()` and PR 39's `DOORGLOW` materials |

**One semantic conflict, which git merges silently.** This branch deleted
`hi = Math.max(st.from, st.to)` from `syncStairs`, because nothing read it. PR 39's new
descent-mouth code in the same function reads `hi`. A plain merge is a `ReferenceError` in
`syncStairs` the first time it draws. The fix is to restore the declaration. ESLint's
`no-undef` over the merged file found it. I also checked the other locals this branch removed,
by AST, against the merged file: none is used by PR 39, and none of their names is shadowed by
a top-level variable that would hide a dangling reference. None of the removed fields
(`pref`, `morale`, `patrolPost`, …) is read by PR 39's code or harnesses. PR 39 adds no new
`-100` standing clamps.

**One interaction between the two branches' fixes.** §1.3's upkeep top-up could leave a
fraction of a remains in the wagon, and PR 39's cart search counts any remains in the wagon as
grave-goods. Together, they would have searched the cart of exactly the player who keeps
remains at home to keep the cart clean, which is the choice PR 39 says it preserves. Fixed on
this branch (§1.3): red on the previous commit, green now.

**What PR 39 settles here.** §5.2 (Hollowmere's four `PointLight`s): they become ordinary
town fires.

**What PR 39 adds that this review would flag.** None of this is blocking:

- `rounds` (written, never read) and `czp` (never used).
- Five guards on names that always exist: `typeof tileAt`, `typeof AU`,
  `typeof refreshBuildBar`, `typeof weather` and `AU.bell &&`.

All seven are removed in the commit after the merge; each one is exact.

**The merged build, run.** I ran 30 harnesses against the resolved merge: all 12 of PR 39's new
ones, plus every harness covering code both branches touched. The first run passed 28. The two
reds were both staging that met a world where the dice fall differently. Neither is a defect in
the game, and both were proved the same way: put back the one daily `rnd()` draw this branch
removed (§1.6), and nothing else, and the red goes green.

- **`review.js` (`aWaylineOpens`).** On the merged world a townsman stands on the stone.
  Right-clicking a body wins over the building under it, so the click opened "KAEL NORWOOD".
  The harness now moves bystanders off the stone first. Fixed on this branch; green on both
  builds.
- **`marchorder.js` (PR 39's own).** The round-trip block stages six tiles off the start,
  beside GREENREST. On the merged world the town has turned hostile by then, the band spends
  the errand fighting townsfolk, and six of eight go down. Two other guesses were tried and
  ruled out first: staunching the captain's bleeds, and feeding the band. The fix is the one
  PR 39 already used in `storeys.js`: stage past every town. It is green on PR 39 alone and on
  the merge. It belongs in the merge commit, because the file does not exist on this branch.

**And the full suite on the merged head found three more, all red on `main` before this branch
touched it.** PR 39 ran a subset of the suite, not all of it. On `main` alone the three came
back identically, so none of them was this branch's.

- **`rim.js` and `order.js` timed out loading seed 404.** It took 37 s to reach the menu
  against 16 s for every other seed and for `30223c9`, which is past the 30 s the tests allow a
  page. The CPU profile named `seedWarrens` → `route`: 17 s of self time. PR 39's corridor
  repairs call the warren BFS for every widened run and every stranded hall. On that seed some
  joins span nearly the whole map (a search box of 1.9 million tiles), and 269 calls visited
  29.9 million tiles, each costing a `Map` insert, two array allocations and two string-keyed
  `Set` lookups. `route` is now the same BFS on flat typed arrays: the same neighbour order,
  the same first-found parent, and the wall test cached once per tile per call. Seed 404 loads
  in 19.5 s. The worlds are byte-identical to `main` on five seeds (0, 7, 91, 404, 1234),
  fingerprinted over `blocked`, `decks`, every cave, the stairs, the towns, every body's
  position and the next `rnd()`. An attempt that only replaced `q.shift()` with an index was
  exact and bought nothing, so it was dropped. V8 already makes that shift cheap.
- **`sweep.js` measured the captain, and PR 39 moved him to the rear.** The claim was "the
  captain gets more than 34 tiles from the anchor", standing in for "the band walked out past
  its own sight". With the captain behind his blades, and a sweep that steers for the nearest
  unseen ground, the band maps the whole 48-tile circle from 30-odd tiles out: 441 of 441
  points learned. The captain topped out at 31.5 and the front at 35.5. The claim now counts
  what it was about: lattice points past 34 tiles that nobody had seen, learned while the order
  is live. The bar is a quarter of them. Measured: 96 of 216 on `30223c9`, 104 of 216 on
  `main`, and 0 of 216 for a negative control whose sweep has nowhere to go.

**Order, as done:** PR 39 merged first. `main` was then merged into this branch as a merge
commit, not a rebase, carrying the five hunks, `hi`, and the `marchorder.js` staging.

---

## Appendix: how the numbers were made

Everything runs from the repository with `tools/three.min.js` present. Set
`DUSTWARD_CHROME=/path/to/chromium` if Playwright's own browser is not where it expects.

**Bugs (§1).** Run `node tools/prep.js`, then `node tools/review.js`. For the baseline column:
`git worktree add ../base 30223c9`, run `prep.js` there, copy `tools/review.js` into it and run
it.

**Per-frame signatures (§2.1).**

```sh
node tools/prep.js HEAD prev          # or build 30223c9 into prev.html
node tools/sigcost.js prev.html game.html 6 500
```

It runs six interleaved rounds, and each round loads both builds in alternating order. It
reports medians with ranges. In each round, every `sync*` is called once to settle, then timed
over 200 calls.

**Sim profile (§2.2, §2.3).** CDP `Profiler` at 100 µs sampling around a pure `update(1/30)`
loop (render paused), 10–12 s, on the default world (1,688 bodies, day 2). Self and inclusive
time are summed per `(function, line)`; for inclusive time, a function counts only at its
top-most occurrence on each stack, so recursion is not counted twice. Noise run to run is about
±10%, so any before/after here is interleaved, never a single pair.

**Reachability (§3).** The same method as the 2026-09-17 appendix: `acorn` parse, a call graph
over top-level declarations, closed from `@root` and the markup. It is sound because there is
no `eval`, no `new Function` and no `window[…]` dispatch (§7).

**Write-only fields (§3, §5).** Walk the AST and collect every `MemberExpression` property name,
split into writes (the left side of `=`, object-literal keys passed to `makeChar`) and reads.
Anything with writes but no reads is a candidate. Each candidate is then checked by hand
against the harnesses, because some are read only there (§5.8).

**Lint (§6.1).** Pull the script block out with line padding, so reported lines match
`dustward3d_hd.html`, and run `eslint` with the `recommended` config plus `no-self-compare`
and browser globals.
