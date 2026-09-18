# Dustward code audit — 2026-09-17

A read of the game as it stands on `claude/game-audit-cleanup-e7pink`, branched from `main`
at 456e6cc. Numbers are taken from the file and from the running game, never recalled; every
claim says how it was measured and the appendix says how to re-run it.

This replaces the audit of 2026-09-04 (in git at `2597fb6:CODE-AUDIT.md`). That one described
a 36,036-line, 2.47 MB file and a 160-harness suite. Scope now: `dustward3d_hd.html` (43,716
lines, 2.90 MB) and `tools/` (238 files, 45,792 lines) — the game grew 7,800 lines and the
suite 78 files in thirteen days, across the revamps this audit was asked to look behind.

**What the last audit got right and what survived it** is in §7, because it is the most useful
single measure of whether an audit is worth writing.

Findings marked **fixed** are commits on this branch, each with a harness. Everything else is
a finding, deliberately not changed, with the reason.

---

## Where to start

Ranked by what it buys against what it costs.

1. **A sigil-bound immortal's death was permanent** (§1.1) — *fixed.* Not dead code: a live
   feature whose only door was deleted. The game tells you to carry the husk to a forge; the
   forge screen went with the crafting revamp. One of three immortality paths, gone, silently.
2. **Add the two-rule lint to `prep.js`** (§3.1). The same five duplicate save keys the last
   audit found were still there eighty commits later, unchanged, because nothing asks. Forty
   lines and one dev dependency. This is the second audit in a row to say so, which is itself
   the argument.
3. **Gather the three singleton lookups in `rebuildCharGrid`** (§2.3). ~5,000 element visits
   a step — a third of what is left after this branch — to find one inquisitor, one brood and
   the coil's members. The pass that would gather them already runs, already does this for
   five other lists, and has a note beside each saying why.
4. ~~**Decide whether the Maw can eat through a floor**~~ (§4.1) — *answered and fixed.* It was
   five things, not one, and none of them should reach through a storey.
5. ~~**Unify the two arena-containment rules**~~ (§4.2) — *withdrawn; the entry was wrong.* They
   ask different questions and the difference is load-bearing. What is true is narrower: nothing
   in the game asks whether a body is on the sand, so `pitInside` is test-only scaffolding.

Longer-horizon: split the source (§3.3). Still not urgent, still the right eventual answer,
and the argument has not changed since the last audit — only the line count has.

---

## 1. What the revamps left behind

The method: parse the script block with `acorn`, build the call graph over every top-level
declaration, and close it over from the page's own entry points (top-level statements, handler
assignments, anything named in the markup). Anything left is unreachable. This is sound here
because the file has **no `eval`, no `new Function`, no `window[name]` dispatch and exactly one
inline handler in the markup** (`onclick="location.reload()"`) — verified, because without that
check reachability analysis is guesswork.

36 declarations came back unreachable on 456e6cc: 191 lines, 77 KB. Two of them —
`reEtchHusk` and `HUSK_COST` — are a live feature that had lost its door, and are §1.1. The
other 34 are waste, and are §1.2 to §1.5.

### 1.1 The sigil-bound dead had nowhere to go — **fixed**

The one finding here that is not about waste.

There are three immortalities. Two survive their own death. A lich sheds a phylactery you
carry to a Binding Circle. A sigil-bound immortal sheds a **husk**, and `shedHusk` says so in
as many words:

```
"<name>'s vessel gives out — but the sigils still glow in the wreck. A husk lies where they fell."
"Carry it to a Forge and re-etch them. Leave it, and they wait in the metal."
```

`bearerNear`, which is what the Circle asks, refuses a husk on purpose (`!m.phyl.husk`) — so
the forge is the road and not a second option. And `reEtchHusk`, which performs the rite, was
whole, correct, and had exactly one caller: `openCrafting`, the per-bench crafting modal that
the work-order book replaced. Nothing had called `openCrafting` since.

So the rite was reachable from nowhere, the Circle refused them by design, and **a sigil-bound
death was permanent** while the log line kept promising otherwise.

The file already has a name for this shape. Beside the Soulbound rig:

> *"This is the armet again: an authored asset behind a condition that cannot be true is
> invisible in exactly the way a missing asset is, and nothing logs."*

This is that with the condition removed entirely — there was no door, not even a shut one.

**Fixed.** The re-etch is a row at the top of the work-order book, which is what replaced the
modal. It is the one row in that window that cares where a body is standing (a husk is carried,
not ordered), so the bearer must be at a forge — the gate `openCrafting` applied, kept rather
than loosened. `tools/husk.js` is red two ways before and green nine after: it asserts the
premise first, pins the Circle's refusal so a "fix" that lets the Circle swallow husks shows up
as a change, proves the rite itself was never the broken part, and carries two negative
controls.

The harness also caught a bug in the first version of the fix: it used `shopFor('forge')`,
which answers "is one built anywhere" and returns the *first* forge in `pBuilds` — so with two
forges up, a bearer at the second was offered nothing.

### 1.2 The baked helmets — 70 KB — **removed**

| what | lines | bytes |
|---|---|---|
| `HELMP` — two base64 meshes | 4 | **67,301** |
| `HELMFIT` — their tuning table | 15 | 1,220 |
| `helmPart` — builds one | 19 | 1,018 |
| `bakedGeo`'s `store === 'helm'` recolour branch | 6 | 291 |
| `helmBaked`, `helmOf` | 2 | 91 |

Both helms have been built out of boxes in `buildCharMesh` since the imported ones were
reported as not working out — the note above `helmKind` says so. **67 KB of a 3 MB download,
2.2% of what every player fetches, for geometry nothing constructs.**

The bake is not lost: it is in `tools/helms.gen.js` and `tools/alch2.gen.js` byte for byte,
and `tools/bakehead.js` regenerates it from the GLBs. Out of the download, still in the repo.

`helmOf` went with it — a one-line alias for `helmKind`, kept by a comment claiming *"the rest
of the file asks it who is wearing what"*. The file asks `helmKind` directly, in both places.
Only `tools/heads.js` still called the alias; it asks `helmKind` now.

### 1.3 The per-bench crafting modal — 3.8 KB — **removed**

`openCrafting` (60 lines), `craftingBench` and `bestCrafter`, replaced by the work-order book.
This is the cluster that stranded §1.1.

### 1.4 The SVG paperdoll — 2.1 KB — **removed**

`dollSvg` and `dollFill`, replaced by the 3D `dollPortrait` directly below them in the file.

### 1.5 Twenty-two singletons — **removed**

`TS` (the tile size, off a line where `W` and `H` are used 450 times between them),
`UNDER_DEEP`, `isDeck`, `TRADE_NAMES`, `canRebuild`, `CONVICTION_KEYS`, `regardOf`, `GUILD_R`,
`FOCUS_LABEL`, `MATS_RECIPE`, `MATS_SECS`, `commanders`, `floorOf`, `inScar`, `dreadOf`,
`riftSealer`, `altarNear`, `LANCE_COOL`, `nearestStairFor`, `_planeUp`, `TOUCH_TAP_MS`, `DIRS`.

### 1.6 And the packs that are *not* dead

Worth recording, because "delete the big base64 blobs" is the wrong lesson:

| pack | size | verdict |
|---|---|---|
| `HEADP` | 336 KB | **live** — all five keys reached: `lyonart`, `saga`, `lyre`, `czarina` assigned directly, `lyonlich` via `LICHFACE` |
| `WEPP` | 45 KB | **live** — both keys reached through `WEPFIT` |
| `LICHP` | 22 KB | **live** — the hood, the one authored lich part left |
| `HELMP` | 67 KB | dead, §1.2 |

---

## 2. Performance

The sim is **flat now**, which is the headline. The last audit found one feature at 45–51% of
the step (the Maw's quarry search); that fix held and nothing has replaced it. The profile is a
long tail with no single villain.

What is left is not a hot function but a hot **habit**: `chars.filter/find/some` over the whole
roster, re-run every tick, to answer a question about a handful of bodies.

Measured by wrapping the array methods on the live `chars` array and counting calls and
elements visited per `update()`, on a 1,667-body world:

| | scans per step | element visits per step |
|---|---|---|
| before | 21.6 | 36,063 |
| after this branch | 8.8 | **14,600** |

### 2.1 The three that mattered — **fixed**

**The downed-body searches — 10,800 visits a step.** Six places ask "is there a body on the
ground within a few tiles of me": the Maw's meal, the Larder-Kin's snatch, the slaver's grab, a
squadmate's rescue, the gaol's pickup, the examine cursor. The Maw's was the single worst scan
in the sim — 9,085 visits a step, asked 5.5 times a step, almost always to find nobody.

`charsNear` is the obvious answer and the wrong one: **the grid holds only `state === 'ok'`
bodies**, so a downed body is precisely what the spatial index does not contain. A list is the
answer, not an index — which is what `rebuildCharGrid` already does for `warders`, `charmed`,
`carriers`, `belowFolk` and `lamps`. `downFolk` joins them. Five of the six read it; the
examine cursor keeps its roster scan, because it runs on a click and churning a cold path buys
nothing.

**The corpse sites — 6,668 visits a step.** `corpseSiteTick` read each site's population with a
`chars.filter` *inside* the site loop: O(sites × chars) for something that is one pass no matter
how many sites there are, and which then does nothing on better than 99 wakes in 100.

**The two boss loops — 3,900 visits a step.** Both asked
`chars.some(o => o.faction === 'player' && o.state !== 'dead' && …)` once per boss per wake.
`_pl` is that exact filter, already gathered at the top of the same step for `_nearSquad`, and
in scope at both call sites.

Measured, three interleaved rounds per the README's rule:

```
prev  5.011  5.031  4.985 ms/step     mean 5.009
new   4.578  4.447  4.562 ms/step     mean 4.529      -9.6%, no overlap
```

No rule changed. The predicates are carried over verbatim; what changed is what they are asked
of. The one behavioural difference is stated in the code: a body that goes down partway through
a step is not in `downFolk` until the next one, so a predator notices a thirty-third of a second
later. `liveChars` beside it carries the same staleness the other way and says so.

**It did cost something, and the full suite is what found it.** `civics.js` was the one red in
156, and it was a true positive about the change even though the game was never exposed. Making
`downFolk` a list turns `rebuildCharGrid` into a precondition of `ai` — which it very nearly
already was, since `ai` reaches for `nearestEnemy` and everything else built on `charsNear`, and
five of the six harnesses that drive `ai` by hand already call `rebuildCharGrid` in their loop.
The gaol's pickup was the one path in `ai` that read the raw roster and so did not care, and
`civics.js` was the one harness relying on that: it drove `ai` with no grid pass at all, so
`downFolk` was never filled and the report read like a broken arrest.

The harness stages the grid now, and the fix was checked against **both** builds — the fixed
`civics.js` passes identically on the pre-audit base and on this branch (same sentence, same
distance to the cell), which is what makes it a staging fix rather than a way of hiding a
behaviour change. `update` rebuilds the grid first and always did, so nothing a player can reach
was affected; the risk this leaves is that the next hand-rolled tick loop that forgets the pass
will fail somewhere that looks nothing like the cause. The comment in `rebuildCharGrid` says so.

### 2.2 The whole pattern, counted

Not all of these are worth changing, but the size of the habit is worth knowing:

- **57** sites hand-roll `chars.filter/find/some(c => c.faction === 'player' && …)` while
  `player()` exists with a per-step cache built for exactly this. Many differ legitimately
  (undead-only, phantoms included, dead included) — the number is the surface area, not a
  to-do list.
- **23** sites do a radius query as a full-roster scan. Some of those genuinely cannot use
  `charsNear` for the §2.1 reason; the rest can.

### 2.3 What is left, and the next move

Post-fix line profile, hottest lines in the sim:

| share | what |
|---|---|
| 3.33% | `rebuildCharGrid` — `charById.set(c.id, c)`, a 1,667-entry Map rebuilt every step |
| 3.05% | `update` — the far-body physics accumulator |
| 2.04% | `paceKey` |
| 2.02% | `rebuildCharGrid()` itself |
| 1.97% | `separate()` |
| 1.92% | `gearHas` — loops `EQ_SLOTS` doing `ITEMS` lookups |
| 1.24% | `chars.find(c => c.inquisitor && c.state === 'ok')` |

**The recommendation is the three singleton lookups**, which are the same habit as §2.1 and the
same fix:

```
5786   const iq = chars.find(c => c.inquisitor && c.state === 'ok');
17981  const members = chars.filter(c => c.coil && c.state === 'ok');
16678  return chars.find(g => g.brood && g.state !== 'dead') || null;
```

Three full-roster walks a step — ~5,000 element visits, a third of what remains — to find one
inquisitor, one brood, and a handful of coil members. `rebuildCharGrid` already walks `chars`
once and already gathers five lists of exactly this shape. Adding three more costs three
predicates on a loop that runs anyway.

`charById.set` at 3.33% is worth a look after that: the Map is rebuilt from scratch every step
although `regridAll()` exists for the case where membership actually changed.

### 2.4 One that was tried and reverted

The per-frame material update carried two loops with the same seven lines, and recomputed the
hit-flash `k` per material although it depends only on `c.hitT`. Folding them into one closure
and hoisting `k` reads better. Measured over four interleaved rounds: 26.28 fps against 26.35
— inside a within-arm spread of 1.7 fps, i.e. **not measurable**. An earlier two-sample read
suggested the closure was *worse* (a closure allocated per body per frame); four rounds do not
support that either.

Reverted. Seven duplicated lines that have not changed are not worth a commit justified by a
measurement that does not survive its own error bars. Recorded here so the next person does not
re-derive it.

---

## 3. Structure and tooling

### 3.1 There is still no linter, and it still costs

Run off the AST (appendix):

**Five duplicate keys in the save object** — `roomId`, `eater`, `npcNecro`, `construct`,
`nodeUses`. **The same five the last audit listed on 2026-09-04**, unchanged eighty commits
later. That is the finding: not the keys, which lose no data today (each pair evaluates
identically, and for a Map `[...m]` and `[...m.entries()]` are the same array), but that
nothing in the repo asks the question, so the answer does not change. `construct` is the one
key `SAVE_KEEP` goes out of its way to protect. **Fixed on this branch**, and it will come back.

**Identifiers used but never declared: none that are real.** `decorByTile` and `_decorHiddenMx`
are assigned as `window.decorByTile` and read bare — legal, guarded by `typeof` checks at every
read, lint-visible but not a bug.

A first pass flagged four `hp` "duplicates" at 19320–19330. They are `get hp()` / `set hp(v)`
pairs — one key, two accessors, which ESLint allows. **Written down so the next reader does not
"fix" them.**

Forty lines and one dev dependency (`acorn`, dev-only — the game stays dependency-free) closes
the class. The implementation is in the appendix.

### 3.2 The harness suite is tidier than its size suggests

238 files, 45,792 lines. The honest result of looking:

- **45 public harnesses are in neither runner** — and on inspection that is correct. Every one
  is a generator (`*.gen.js`), a contact sheet (`*pix.js`, `grips.js`, `swing.js`, `faces.js`)
  or a measurement tool (`bench.js`, `simcost.js`, `cadence.js`, `frame.js`). None asserts and
  silently passes. The one near-miss is `moves.js`, which has a `!!` marker and no exit code.
- **Every harness still carries its own preamble** — 195 declare their own `gamePath`, 229 call
  `chromium.launch` directly, 228 click `#btn-start` themselves. The last audit called this out
  at 152 copies; it is 238 now. It is a real cost and a boring one.
- **28 files do not honour `DUSTWARD_CHROME`** — all of them `_`-prefixed private probes. That
  is a consistent split (public harnesses all honour it), but it means the private probes are
  unusable wherever Playwright's own browser is not where it expects. `_simprof.js` is the one
  you hit first.

### 3.3 The file

43,716 lines in one `<script>`. The last audit's argument for splitting stands unchanged and
is not repeated here. What this audit adds is evidence for the *cost* of not splitting: all
three dead clusters in §1 are cases where a replacement was written near the original, the
original was left, and nobody could see it — and in §1.1 that cost a shipped feature.

---

## 4. Findings deliberately not changed

Behaviour questions rather than cleanups, raised for an opinion rather than changed on the spot.
§4.1 has since been answered and fixed. §4.2 turned out to be a misreading and is corrected in
place rather than quietly dropped.

### 4.1 Five things could reach through a floor — **fixed**

Raised here as "the Maw can eat through a floor", answered by the owner as *"the Maw should
definitely NOT be able to eat between floors. Cross-floor interactions should rarely happen, and
most certainly not like this."* Looking properly, the Maw was one of five.

`dist` is planar. `charsNear` is floor-blind by design and its own note says so — *"every caller
filters by floor itself"* — which nine queries do with the same line:

```js
if((o.floor || 0) !== (c.floor || 0)) continue;   /* a floor is as good as a wall */
```

The five that did not are exactly the five that ask "is there a body on the ground near me", and
they are the five that read the ROSTER rather than the grid, so they were never near the note:

| what | radius |
|---|---|
| the Larder-Kin's snatch | 4.5 |
| the slaver's grab | 4 |
| the Maw's meal | 2.5 |
| a bandit robbing the fallen | 3 |
| the town guard's arrest | 5 |

A body going down on the surface was at distance **zero** from anything standing on the same
tile four storeys below, so it could be eaten, enslaved, robbed or arrested from underground.

**Fixed**, all five, with the same idiom the other nine use. `tools/storeys.js` is red five ways
before and green six after. Every claim is a PAIR — the same predator, the same body, the same
tile, once on the floor below and once beside it — because a "fix" that simply stopped all five
features working would pass the cross-floor half of every claim and be worse than the bug. The
sixth claim is a premise control: `nearestEnemy` already refuses a foe one storey down and takes
the same one beside, which is the convention this joins.

The harness's own trap is worth recording. The robbery is gated on `!c.target`, and a bandit
picks a target with `nearestEnemy(c, 9)` — so the first staging put the pair on ground that was
clear of bodies ON the tile but not within nine tiles. Underground there was nobody to target so
the robbery fired; on the surface the bandit found a fight and never reached the branch. That
read as "the same-floor control failed", i.e. as the fix having broken the feature, when what it
measured was ambient population. The staging is clear out past every targeting radius in play.

maws, larder, jail, civics, beasts and survive are green after.

### 4.2 `pitInside` is test-only scaffolding — and the "disagreement" was not one

**This entry was wrong when first written and is corrected here**, because the correction is the
useful part. It read: two containment rules, one strict and one inclusive, the same Chebyshev box
written twice, and "unifying them is a behaviour change at the boundary". Looked at properly they
are not two versions of one rule, and unifying them would be a bug.

The geometry. `ARENA_R` is 8. The wall ring is laid at **exactly** offset 8
(`Math.max(|i|,|j|) === ARENA_R`), so the sand inside is offsets -7..+7, 15×15, which is what the
constant's own comment says. The **gate** tiles also sit at exactly offset 8 — and they are
deliberately left out of `blocked` when the ring is built, and deleted from it again by
`pitOpen()`.

The two expressions ask different questions:

- **`pitInside(c)`** — `|dx| < 8 && |dy| < 8`. *Is this body standing on the sand?* Strict is
  correct: offset 8 is the wall, and a body cannot be inside a wall.
- **the pit-master siting** — `Math.max(|dx|, |dy|) <= 8 → skip`. *Walking out along the gate's
  own normal, is this candidate tile still the ring?* Inclusive is correct, and it is
  **load-bearing**: the walk passes straight through the gate tile at offset exactly 8, which is
  not blocked while the gate is open. With `<` the pit-master would stop there and stand in his
  own gateway — which is a near miss of the bug the comment above that loop already describes
  ("the darts started landing him on his own sand, where `hostile` puts him in the bout").

So there is nothing to unify. What survives, and is the real finding:

**Nothing in the game asks whether a body is on the sand at all.** The bout does not use geometry
— it holds explicit `ours`/`theirs` rosters and ends on `state === 'ok'` counts, and hostility is
`!!arena.bout`, not position. Containment is physical: the ring is sealed by construction and the
gate shuts. `pitInside` exists only because `tools/pit.js` needs *some* way to ask "did anybody
get out", and it is the one predicate in that harness that no game code is bound by. If the way
the game keeps bodies in the ring ever changes, `pit.js` will keep passing.

That is worth knowing and not worth changing: a test-only predicate is fine as long as it is
labelled as one. `pitInside` carries a comment saying so. **No code change.**

---

## 5. Two harnesses were propping up dead code — **fixed**

Worse than the dead code itself, because a green test is a claim.

**`cloth.js`** drove `openCrafting('loom', shed)` and reported *"right-clicking the shed offers
CRAFT on fabric"*. Right-clicking the shed had not opened that panel since the work-order book
landed — the harness opened a caller-less function by hand and then made a claim about the
player. It drives the book now, and covers the half the modal never had: an order has to find a
pair of hands, so `takeOrder` is driven too.

**`parley.js`** asserted `typeof makeBark === 'function' && barks.has(makeBark(v))` under the
name `andTheBarksStillFireOnTheirOwn`. Nothing called `makeBark`; the ambient chatter is picked
inline inside `update()`. Its own comment said it fired from `townTick` — **a function that has
never existed in this file**. The claim proved a wrapper existed and would have stayed green
with the barks switched off entirely. It now stands two townsfolk within gossip range and
drives the real `update()` until one says something out of the town's table.

The shared lesson: **a harness that opens a window by hand is not testing that the window
opens.** Both of these were assertions about reachability that had stopped being about anything.

`fractureName` was the mild version — a named function the top bar inlined rather than called.
The bar calls it now.

---

## 6. Checked and found sound

So the reader knows what was covered, not only what was found:

- **Determinism.** `Math.random` appears 11 times, all inside the audio module. Everything
  touching the world goes through the seeded `rnd()`/`ri()`.
- **Hygiene.** Zero `var`, zero `console.log`, zero `TODO`/`FIXME`/`HACK`, zero `debugger`,
  zero `eval`, zero `new Function`.
- **CSS.** 65 classes and 58 ids in the stylesheet; exactly one class (`.tp`, inside `.trow`)
  is never used outside it. Not worth a commit on its own.
- **The baked packs.** Three of four fully reached, key by key (§1.6).
- **The suite.** The full 156-harness run is **155/156** — `civics.js` was the single red, was a
  true positive about §2.1, and is green on both builds after its staging was fixed. `check:fast`
  6/6. Plus, run individually against this branch: `heads`,
  `kitdoll`, `craftwork`, `regard`, `pit`, `husk`, `cloth`, `parley`, `maws`, `larder`, `jail`,
  `beasts`, `survive`, `watchers`, `sixfold`, `wyrm`, `press`, `pain`, `sundered`, `save`,
  `roundtrip`, `walls`, `doorsave`. `sundered` covers corpse-site regrowth directly — stripped
  to 0, back to 7 of 7 in 32 game-hours after the §2.1 change.

---

## 7. What the 2026-09-04 audit got right, and what survived it

The most useful single measure of whether writing these is worth the time.

**Held up:** the Maw fix (§2.1 of that audit) is still the reason the profile is flat — nothing
has grown back into that slot. The `wardedFrom` correction held. The two Windows-hostile
filenames were fixed. The prosthetic scoping bug stayed fixed and `tools/grafts.js` still pins it.

**Did not happen, and the cost showed:** the linter (its recommendation #2). The five duplicate
save keys it listed are the *same five* today. Its argument was that `no-undef` alone would have
caught the prosthetic bug the day it was written; thirteen days later the evidence is simply
that a list of defects nobody automated is a list that does not shrink.

**Still open and still right:** the shared harness preamble (152 copies then, 238 now), and
splitting the file.

**What it could not have seen:** all of §1. Those clusters were created by revamps that landed
*after* it. That is the argument for re-running this after a revamp rather than on a schedule —
dead code is not a thing that accumulates evenly, it is a thing that appears the day a feature
is replaced.

---

## Appendix: how the numbers were made

Everything below runs from the repository with `tools/three.min.js` present and a Chromium
Playwright can reach (`DUSTWARD_CHROME=/path/to/chrome` if it is not where Playwright looks —
note §3.2: the `_`-prefixed probes ignore that variable).

**Reachability (§1).** `acorn` parse of the script block; collect every top-level
`FunctionDeclaration`, `ClassDeclaration` and `VariableDeclarator`; walk every `Identifier`,
dropping non-reference positions (member properties, property keys, method keys, labels);
attribute each reference to the top-level declaration whose source extent contains it, or to
`@root` if it sits in top-level code. Close over the graph from `@root` plus anything named in
the markup above the script block. Unreached = dead.

*This is only sound because the file has no dynamic dispatch* — check that first:

```sh
grep -n "\beval(\|new Function(\|window\[\|globalThis\[" dustward3d_hd.html
sed -n '1,593p' dustward3d_hd.html | grep -o 'on[a-z]*="[^"]*"'
```

**Roster-scan counting (§2).** Boot headless, start a world, then redefine `find`, `filter`,
`some`, `every`, `forEach`, `reduce`, `findIndex`, `map` and `sort` **on the `chars` array
itself** (not on `Array.prototype`) with a wrapper that records `this.length` and the call site
off `new Error().stack`, run `update(1/30)` N times, and delete the own-properties afterwards.
Attribution is per `game.html` line, and `prep.js` swaps one line for one line so those are
source line numbers.

**Line-level profile (§2.3).** CDP `Profiler` at a 60 µs sampling interval around a pure
`update()` loop with no render in the path, then sum `profile.nodes[].positionTicks` per
`(function, line)` rather than per function.

**A/B timing (§2.1, §2.4).** `node tools/prep.js HEAD prev`, then alternate
`node tools/simcost.js prev.html` and `node tools/simcost.js game.html`, three or four rounds
each, per the README's rule about interleaving. Report the spread, not a single pair — §2.4 is
what happens when you do not.

**The lint (§3.1).** Off the same AST. Duplicate keys: for each `ObjectExpression`, key on
`name + '|' + property.kind` so a `get`/`set` pair is not flagged. Undeclared identifiers:
collect every binding (declarations, params, catch params, function expression ids, labels),
then walk every `Identifier` that is not a member property or property key and is not in a
browser-globals list.

Wiring it into `prep.js` is one call beside the existing NUL-byte and syntax checks, with
`acorn` as a dev dependency — dev-only, alongside `playwright`; the game itself stays
dependency-free and is still one self-contained file.
