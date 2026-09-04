# Dustward code audit

A read of the game as it stands on `main` at 2597fb6 (2026-09-04), with numbers taken from
the file and from the running game rather than recalled. Every claim below says how it was
measured; the method is in the appendix so the next session can re-run it instead of
trusting it.

Scope: `dustward3d_hd.html` (36,036 lines, 2.47 MB), the `tools/` harness suite (160 files,
32,084 lines), and the repository around them. Nothing here is built. The one bug found is
described in §1.1 and fixed in a later commit on this branch, with a harness beside it;
the Maw search in §2.1 likewise. Everything else is a finding, not a change.

---

## Where to start

Ranked by what it buys against what it costs.

1. **Fix the prosthetic scoping bug** (§1.1). Two declarations are inside the wrong function.
   Fitting a graft consumes the item and then throws; a fighter with a grafted arm throws on
   every swing, and the throw aborts the rest of that sim step. Since 7c56501, twelve days.
2. **Add ESLint to `prep.js`** (§3.2). `no-undef` alone would have caught §1.1 the day it
   was written. `no-dupe-keys` catches the five duplicated save keys. One dev dependency,
   two seconds per run, and it closes the class of bug this file is most exposed to.
3. **Fix the Maw's quarry search** (§2.1). One feature is 45–51% of every sim step. It is
   an `O((down + corpses) × chars)` scan, re-run every tick by 151 bodies that found
   nothing last tick. Two small changes halve the step in the measured world and stop it
   scaling with the body count on a battlefield.
4. **Precompute the warding casters** (§2.2). `wardedFrom` walks every body for every body.
   Second-largest sim cost after the Maw, and a five-line fix.
5. **Rename the two files with colons in their names** (§6.1). The repository cannot be
   cloned on Windows.
6. **A shared harness helper and a CI run of `check:fast`** (§4). 152 harnesses carry the
   same 25-line preamble; nothing runs any of them automatically.
7. **Inline three.js, or at least pin it with an integrity hash** (§5.1). The "one
   self-contained file" is not: it fetches its engine from a CDN on every load.

Longer-horizon: split the source (§3.1). Not a rewrite, and not urgent, but the file has
crossed the point where its size is generating its own bugs, and the project has already
built half of the tooling a split needs.

---

## 1. Bugs

### 1.1 `PROS_TIER` and `prosVal` are local to `moveSpeedRaw`

`dustward3d_hd.html:2658-2659` declares the graft table and its reader between two
statements of `moveSpeedRaw` (2609–2666), so they are function-scoped. Two other functions
use them as globals:

| caller | line | what happens |
|---|---|---|
| `atkPower` | 3238 | `prosVal(a)` on a body whose arm is `severed && pros` → `ReferenceError` |
| the WEAR handler in `refreshInv` | 30334 | `PROS_TIER[tier]` → `ReferenceError`, after `takeItem` and after the part was marked fitted |

Verified live (appendix, probe 3):

```
prosValType: "undefined"        prosTierType: "undefined"
atkPower(grafted arm):          THROWS: prosVal is not defined
moveSpeedRaw(grafted leg):      ok 3.12          ← works, because the table lives there
fit button:                     THROWS: PROS_TIER is not defined
  after the throw:              pros: true, tier: 1, item 1 → 0
```

So the fit half-works: the graft is consumed and the limb is fitted, but the log line and
the two `refresh` calls never run, the panel does not update, and the player sees nothing
happen. The attack half does not work at all. `atkPower` is called from `attack` (7801),
from `physics` (11449, 11459), from `gauntTick` (15074) and from the structure-damage path
(15466) — all inside `update()`, and nothing between them and `frame()`'s `try` catches. So
every swing by a body with a grafted arm unwinds the whole sim step from that body onward:
the rest of the roster does not tick, and everything `update()` does after the body loop is
skipped for that step. `frame()` logs the first three of these and then goes silent
(36026), so after three swings it is invisible.

Introduced by 7c56501 "Every kind names its own" (2026-08-23), which is the commit that
created the table. No harness covers prosthetics (`grep -l pros tools/*.js` finds only two
incidental matches).

**Fixed on this branch.** The table and its reader are at the top level above `moveSpeedRaw`;
`legFactor` stays where it was. `tools/grafts.js` pins all three readers and drives the swing
through the real `update()`, and is red five ways on the build before the fix.

### 1.2 Duplicate keys in the save object

ESLint `no-dupe-keys` on the script block:

| line | key | first value | second value |
|---|---|---|---|
| 34076 / 34091 | `roomId` | `(c.roomId??null)` | same |
| 34109 | `eater` | `!!c.eater` | same |
| 34112 | `npcNecro` | `!!c.npcNecro` | same |
| 34114 | `construct` | `!!c.construct` | same |
| 34118 / 34145 | `nodeUses` | `[...nodeUses]` | `[...nodeUses.entries()]` |

No data is lost today because each pair evaluates to the same thing (`[...map]` and
`[...map.entries()]` are identical). But the later key silently wins, `construct` is the one
key `SAVE_KEEP` goes out of its way to protect, and a future edit to the first copy of any
of these does nothing. This is what "appending to a 150-line object literal" looks like
after enough rounds; the lint rule is the cure.

### 1.3 Small things the linter found

- `dustward3d_hd.html:5181` — `if(!(i===p.x && y1===y1))`. `y1===y1` is always true, so
  this is `i !== p.x`. Harmless (it leaves the south-wall door open, which is what the
  comment wants) but not what it says.
- `dustward3d_hd.html:34189` — the `< 19` version gate sits below the `< 20` gate and can
  never fire.
- `function ai` (9823) shadows the browser's `window.ai`. Function declarations win, so
  nothing breaks, but a 930-global script will keep colliding with new browser globals and
  the failure mode for a `let`/`const` collision is a `SyntaxError` at load.
- 47 unused declarations. Of the functions, 14 are read by nothing in the game or in
  `tools/`: `isDeck`, `canRebuild`, `regardOf`, `commanders`, `floorOf`, `inScar`,
  `dreadOf`, `riftSealer`, `helmPart`, `gearFor` and the constants `TS`, `TRADE_NAMES`,
  `CONVICTION_KEYS`, `GUILD_R`, `LANCE_COOL`, `TOUCH_TAP_MS`, `DIRS`. Others (`cairn`,
  `fractureName`, `helmOf`, `openCrafting`, `makeBark`, `nearestStairFor`, `unstuckN`) are
  reached by harnesses through the global scope and are not dead. Check `tools/` before
  removing any of them; the probes reach into the page by name.

---

## 2. Performance

Measured on the built `tools/game.html` in headless Chromium with SwiftShader, on the
world worldgen produces from the fixed seed: 1,067 bodies (1,049 alive), day 1, 08:30.
`update(SIM_DT)` was run 600 times with the frame loop paused. Two profiles: one that wraps
every function `update()` calls (counts are exact, times carry wrapper overhead), and one
from Chrome's sampling profiler (times are honest, no counts).

| | ms per step |
|---|---|
| sampling profiler | 19.4 |
| instrumented | 28.7 |
| budget at 1× (`SIM_DT` = 1/30) | 33.3 |

The absolute number is a sandbox CPU and means little. The shares are what matter, and at
3× or 5× speed the frame needs three to five of these steps, which is where the
`simSteps < 4` cap (35999) starts dropping sim time.

### 2.1 The Carrion Maw is half the sim

Sampling profile, self time, top of the list:

| function | line | self | inclusive |
|---|---|---|---|
| anonymous — `chars.some(m => m.mawTarget === o …)` in the down-body loop | 15329 | 23.4% | |
| anonymous — the same `some` in the corpse loop | 15335 | 13.5% | |
| (program) | | 11.7% | |
| `mawQuarry` | 15324 | 8.0% | 44.9% |
| `mawFeed` | 15356 | 6.2% | 51.2% |
| `update` | 19251 | 5.3% | 86.0% |
| `physics` | 11321 | 4.8% | 71.2% |
| `isConcentrating` (via `wardedFrom`) | 16560 | 3.3% | |
| `wardedFrom` | 17963 | 1.9% | |
| `rebuildCharGrid` | 9584 | 1.8% | |
| `separate` | 20564 | 1.7% | 2.5% |
| `hostile` | 9755 | 1.5% | |
| `travel` | 11065 | 1.3% | 4.0% |
| `charsNear` | 9600 | 1.2% | |
| `findPath` | 10928 | 0.8% | 1.8% |

`mawFeed` is called from `physics` for every body (11526). It returns immediately unless
`c.eatsDead`, but 151 bodies in this world have it (gaunts and their kin), and a searcher
with no quarry calls `mawQuarry` **every physics tick**. `mawQuarry` (15324) loops over
`chars` and, for each down body, runs `chars.some(...)` to check whether another Maw has
claimed it; then does the same over `corpses`. That is `(down + corpses) × chars`
comparisons per searcher per tick, with 150 searchers finding nothing and asking again next
tick:

```
searchers: 151   with a target: 1   down: 5   corpses: 6   chars: 1067
one mawQuarry call: ~60 µs   →   150 × 60 µs ≈ 9 ms of a 19 ms step
```

And it scales the wrong way: the cost is proportional to corpses, so it is cheapest on a
quiet day and worst on a battlefield, which is exactly when the sim is already loaded. At
~5.5 µs per candidate, a hundred corpses puts one search at ~0.6 ms and the Maws together at
~90 ms per step on this machine.

Two changes, both local to those two functions:

- Build the claimed set once per call — `const claimed = new Set(); for(const m of chars)
  if(m.mawTarget && m !== c) claimed.add(m.mawTarget)` — and test `claimed.has(o)`. That is
  `O(chars + down + corpses)` instead of the product.
- Do not re-run a search that just failed. A retry timer on the body (`c.mawSearchT`, a
  second or two, the same shape as `pathFail`) cuts 150 searches per tick to a handful. A
  Maw that noticed a corpse two seconds late is not a design change.

Better still, do the search once per tick for all Maws (a world-level pass that hands out
quarry), since every searcher is scanning the same two lists. But the two changes above
are the ones that can be made without touching the design.

### 2.2 `wardedFrom` walks the roster for every body

`wardedFrom(c)` (17963) loops over all of `chars` looking for a concentrating warder. It is
asked per body per tick, so it is `chars²` calls to `isConcentrating` — 3.3% + 1.9% of the
step for a feature that has, in this world, zero active casters. Collect the active warders
once per tick (there are never more than a few) and have `wardedFrom` check against that
list. Same shape as the `_pl` / `_nearSquad` precompute already done at 20203.

### 2.3 What is already good

The things one would normally flag in a 1,000-body sim are already handled: a spatial hash
(`charGrid`) with a zero-allocation query, numeric collision keys with a `Uint8Array` fast
path for the ground floor, an A* with a binary heap and a search budget scaled to the trip,
a per-body LOD that ticks far idle bodies at 4 Hz, a 4 Hz throttle on the expensive world
scans, and a fixed-step loop that degrades instead of spiralling. Per step in the measured
world: 8.3k `isBlocked`, 4.2k `hostile`, 1.6k `charsNear`, 93 `nearestEnemy`, 2.8
`findPath`. None of those is a problem.

The one design footgun is `charsNear`'s shared `_nearOut` buffer (9599). It is fast and it
has already caused one real bug (the Wisp burst, per the README). A cheap guard: in the
test build only, have `charsNear` bump a generation counter and have the returned array
carry it, so a probe can assert that no caller is iterating a stale result. Or accept the
footgun and keep the README note; it is documented well.

`refreshSquadBar` rebuilds the whole bar's DOM (`bar.innerHTML = ''`, 28762) four times a
second whether anything changed or not. Not measured as a problem; it would show up on a
phone with a thirty-body host. A cheap hash of the inputs would skip the rebuild.

---

## 3. Structure

### 3.1 The file

| | |
|---|---|
| lines | 36,036 (script block 35,462) |
| bytes | 2,589,299 — of which 470,698 (18%) is ten lines of base64 mesh packs |
| top-level function declarations | 933 |
| top-level `let`/`const` bindings | 626 |
| top-level statements | 1,659 |
| lines inside functions / at top level | 24,141 / ~11,300 |

The largest functions, with cyclomatic complexity from a real parse:

| function | lines | branches | starts at |
|---|---|---|---|
| `buildCharMesh` | 2,395 | 491 | 24502 |
| `physics` | 1,445 | 756 | 11321 |
| `update` | 1,301 | 829 | 19251 |
| `syncChars` | 658 | 225 | 26897 |
| `restore` | 519 | 449 | 34187 |
| `renderOverlay` | 432 | 188 | 27954 |
| `refreshCharPanel` | 325 | 161 | 28901 |

Seven functions over 300 lines; 851 of 933 are under 50. So the shape is fine almost
everywhere and extreme in seven places, and the seven are the ones every feature touches.
`physics` and `update` are each a sequence of `if(c.something){...}` blocks that could be
the `*Tick` functions the rest of the file already uses (there are 44 of them); the pattern
exists, it just was not applied to the two biggest. `buildCharMesh` is a rig per body kind
in one function and would split along `c.kin` the same way.

**The ordering hazard.** ESLint's `no-use-before-define` reports 327 uses of 72 globals
before their declaration line. All are inside function bodies, so none throws today — but
the distance is the point: `modalOpen` is first used at 4965 and declared at 30343;
`selected` at 2856 vs 19178; `opts` at 6590 vs 19189; `sisterArc` at 12857 vs 35157.
`boot.js` exists because this has bitten twice at worldgen (a `const` in its temporal dead
zone), the README records a silent duplicate-function collision, and three
`window.decorByTile`-style escape hatches plus 21 `typeof X === 'undefined'` guards are
the same problem wearing other clothes. None of it is wrong; all of it is the cost of one
scope.

**A split, not a rewrite.** The constraint is that the *shipped* thing is one file, and
`prep.js` already rewrites the file on every test run. A `src/` directory of numbered
files in the order the sections already sit in (`00-core.js`, `01-terrain.js`, … the
banners at `/* ==== CORE */`, `TERRAIN`, `ITEMS`, `TOWNS`, `CHARACTERS` are the seams) and
a `build.js` that concatenates them into the HTML changes nothing at runtime — same scope,
same order, same behaviour — and buys: the mesh packs out of every editor's way, a lint
that runs per file, diffs that name the system they touch, and an end to anchored edits
inside a 1.8 MB text (the README records three syntax breaks in one sitting from exactly
that). The base64 packs alone are worth moving: `bakehead.js` already emits `.gen.js`
files that are spliced in by hand, and the doc calls that splice the dangerous step.

This is the largest change on the list and the least urgent. It is here because every
other structural item gets cheaper after it.

### 3.2 There is no linter

`prep.js` syntax-checks the script block and stops. That catches "does not parse" and
nothing else. Running ESLint 9 over the extracted script with a browser+`THREE` globals
list and eleven rules took two seconds and found §1.1, §1.2 and §1.3. The rules worth
turning on, all of which are quiet on the current file except where they found something:

```
no-undef, no-dupe-keys, no-redeclare, no-self-compare, no-unreachable,
no-dupe-else-if, no-dupe-args, no-duplicate-case, use-isnan, valid-typeof,
no-unused-vars (warn)
```

`no-use-before-define` is too noisy here (327) and should stay off; the load-time TDZ case
it would catch is already `boot.js`'s job. The cheapest wiring is a `lint` step inside
`prep.js` (it already extracts the script block) so that a build that fails lint never
reaches a harness — the same policy as the NUL-byte and syntax checks.

---

## 4. Test tooling

The suite is the best thing in the repository and the README's notes section is a genuine
document. The findings here are about the plumbing around it, not the probes.

### 4.1 152 copies of the same preamble

| | |
|---|---|
| files in `tools/` | 160 |
| with their own `chromium.launch(...)` and the four SwiftShader flags | 152 |
| that click `#btn-start` themselves | 151 |
| that `require` a shared helper | 0 |

Every harness re-implements launch, the `DUSTWARD_CHROME` override, the error collectors,
`gamePath`, the boot-and-wait and usually a `guard()`/`pin()` reporter. A `tools/lib.js`
of eight functions removes ~25 lines from each of 150 files and, more importantly, makes
the fixes the README keeps learning one edit instead of 150: "set `paused = true` for any
probe that drives the sim itself" becomes the default of `boot()`, and the parallel-mode
failures (`run.js --jobs`) — which the README attributes to exactly that wall-clock class —
get one place to be fixed.

### 4.2 Two lists, and eight orphans

`package.json`'s `check` script and `run.js`'s `ALL` array both enumerate the suite. They
have 113 entries each and agree today; nothing keeps them agreeing. `check` should be
`node tools/prep.js && node tools/run.js`.

The README's **Correctness — run these before committing** table has 78 rows. Eight of
them are in neither list: `doorsave.js`, `immortal.js`, `regard.js`, `rite.js`,
`shaping.js`, `decay.js`, `moves.js` (visual), `corpses.js` (a report). Six of those are
assertion harnesses that nobody has run as part of a push for some time.

All six were run for this audit. All six exit 0 with `errs: 0` — and none of them *can*
fail: none contains a `process.exit(1)`, an `exitCode`, or the `***`/`!!` markers `run.js`
greps for. They print a JSON report and stop. `doorsave.js`, `immortal.js`, `regard.js`,
`rite.js`, `shaping.js` and `decay.js` are reports wearing the correctness table's label,
which is a different thing from a harness that fails on the build before it. Either
promote their `identical: true` lines to assertions and add them to `ALL`, or move them to
the table where the reports live.

Going the other way, 30 harnesses that *are* in `ALL` have no row in any README table
(`world.js`, `host.js`, `raise.js`, `guns.js`, `roads.js`, `civics.js`, …). The `For
Claude: To Do` header covers most of them, but the README is where the tables are.

### 4.3 Nothing runs automatically

There is no `.github/`. `check:fast` is six harnesses in 132 s here (2.5 minutes on a
free runner is plausible), and it would have to be told to `curl` three.js and to install
Playwright's Chromium, both of which are one line. Even that subset on every push turns
"did I break the build" from a thing the author remembers to run into a thing that happens.
The full `check` is ~15 minutes serially and would be fine as a nightly.

### 4.4 The serial chain

`run.js` records that four-way parallel goes red on four harnesses for wall-clock reasons.
That is the shared-helper problem again (§4.1): if `boot()` pauses the sim and the probes
drive it explicitly, load stops mattering. Until then the honest number is the serial one,
and `run.js` already prints the three slowest so the next person knows where the time is
(`roads.js` 233 s, `world.js` 77 s).

---

## 5. Robustness

### 5.1 The one file is two files

`dustward3d_hd.html:471` loads three.js r128 from cdnjs at runtime, with no `integrity`
attribute. Offline, or on a network that blocks the CDN, the game shows an error (20855)
and stops. The harnesses swap the tag for a local copy precisely because of this. Inlining
`three.min.js` (~600 KB, ~150 KB gzipped) makes the self-contained claim true, removes a
network dependency from every load, and removes the one supply-chain surface the game has.
If it must stay external, add `integrity="sha384-…" crossorigin="anonymous"` so a changed
file cannot run.

Separately: r128 is from May 2021. `outputEncoding` and `sRGBEncoding` (20867) were removed
in r152, and the renderer setup here would not survive an upgrade as-is. Not urgent — pin
it forever if the inlined copy is chosen — but worth deciding deliberately rather than
discovering when a browser change lands.

### 5.2 Names are not escaped

123 `innerHTML` assignments; 43 of them interpolate a `.name`. Names come from `prompt()`
(group names at 28823/28857, rename at 29929) and from saves, and `restore` writes `s.name`
straight through (34395). The game has a share-a-save-code feature (`DWZ1:` codes,
34904–34928) whose whole point is that codes cross between players, so a name of
`<img src=x onerror=…>` in a shared code runs script in the recipient's page. The blast
radius is small — a single-player page whose only state is its own `localStorage` — but the
fix is one `esc()` helper at the 43 sites, or one sanitiser on the way in (strip `<>&"`,
cap length) at `prompt()` and in `restore`, which is fewer places.

### 5.3 Errors outside the frame are silent

`frame()` catches and logs, and stops logging after three (36026). Errors in event handlers
(the fit button in §1.1 is one) never reach the in-game log at all; the player's experience
of every one of them is "the button did nothing". A `window.addEventListener('error', …)`
that routes to `log()` — and a `frameErrs` cap that resets on a quiet minute rather than
forever — would make the class visible.

### 5.4 Saves

- Autosave runs at the day rollover (19516) and nowhere else: up to 192 s of play at 1×,
  and there is no `pagehide` handler, so closing the tab loses it. Packing is async, but
  the plain-JSON path already exists for browsers without `CompressionStream` and is
  synchronous; a `pagehide` write through it closes the gap.
- The save version is a literal `v:20` (34118) and the reader's gate is a separate literal
  (34188). One `SAVE_V` used by both stops them drifting. There is no upper-bound check, so
  a save from a future format loads with whatever the reader makes of it.
- `chronicle` is capped at 500 entries; `lean` writes only non-defaults. Both good, and
  `save.js`/`lean.js` guard them.

---

## 6. Repository

### 6.1 Two filenames cannot exist on Windows

`For Claude: To Do` and `Design Notes: Readability and the Binding Circle.md` contain
colons. NTFS forbids them; `git clone` on Windows fails at checkout with "invalid path".
Anyone on that platform cannot get the repository at all. Rename (`TODO.md`,
`design-notes-readability-and-the-binding-circle.md` or similar).

### 6.2 Missing at the root

- **No README.** `tools/README.md` is thorough, but a visitor to the repository root sees a
  2.5 MB HTML file, a 436 KB file called `For Claude: To Do`, and no sentence saying what
  Dustward is or how to play it. Twenty lines would do.
- **No LICENSE.** Only matters if the repository is or becomes public; without one, nobody
  else may legally do anything with it.

### 6.3 Things that are fine

251 commits; `.git` is 6.9 MB despite a 2.5 MB file changing in most of them, so the delta
compression is coping and there is no history problem. `.gitignore` is correct and
commented. `package.json` declares the one dev dependency honestly.

---

## 7. Checked and found sound

So the reader knows what was covered, not only what was found:

- **Determinism.** `Math.random` appears 11 times, all inside the audio module; everything
  that touches the world goes through the seeded `rnd()`/`ri()`. The README's rule about
  new draws moving worldgen is real and respected.
- **Hygiene.** Zero `var`, zero `console.log`, zero `TODO`/`FIXME`/`HACK`, zero `debugger`,
  zero `eval`. Ten empty `catch` blocks, all around `localStorage`, clipboard and audio-node
  teardown, where swallowing is correct.
- **Loops and memory.** `requestAnimationFrame` with a `dt` cap, fixed-step sim with a
  step cap, EMAs for the HUD. Five `dispose()` sites and `wepsoak.js` soaks for leaks.
  Twenty-two listeners added and none removed, which is right for a page that lives as
  long as its listeners.
- **Pathfinding and proximity.** Already discussed in §2.3; nothing to change.
- **The suite itself.** `check:fast` is 6/6 green on this branch. `boot.js` comes up with
  1,067 bodies and 7 towns.

- **`simcost.js`**, the project's own number, on this machine: `updateMs` 16.4 ms direct at
  1,067 bodies, which agrees with the 19.4 ms sampling figure once the profiler's overhead
  is allowed for. The 20 s soak under SwiftShader reports sim 35.8 ms and draw 19.9 ms per
  frame at 25.7 fps, but the draw half is software rendering and says nothing about a GPU.

---

## Appendix: how the numbers were made

All of it runs from the repository with `tools/three.min.js` present and Playwright's
Chromium reachable (`DUSTWARD_CHROME=/path/to/chrome` if it is not where Playwright looks).

**Script extraction and lint.**

```sh
sed -n '572,36033p' dustward3d_hd.html > /tmp/game.js     # the script block
node --check /tmp/game.js
npx eslint --no-config-lookup -c eslint.config.js /tmp/game.js -f json
```

with an `eslint.config.js` of `sourceType: 'script'`, `globals.browser` plus
`THREE: 'readonly'`, and the rules in §3.2 plus `no-use-before-define` for the ordering
count. The unused-name check against `tools/` was `grep -lw NAME tools/*.js`.

**Function sizes and complexity.** `acorn` parse of the script block; top-level
`FunctionDeclaration` line spans; branch count per function via `acorn-walk` over
`If/Conditional/For/While/SwitchCase/Catch` and `&&`/`||`/`??`.

**Profiles.** Both start the game in headless Chromium the way `boot.js` does, set
`paused = true`, and run `for(i<600) update(SIM_DT)`. The instrumented one replaces every
global function named in `update.toString()` (plus `physics`, `ai`, `isBlocked`, `hostile`,
`dist`, `charsNear`, `nearestEnemy`, `findPath`, `travel`) with a timing wrapper and reports
self and inclusive ms and call counts. The sampling one opens a CDP session, runs
`Profiler.start` at a 200 µs interval around the same loop, and aggregates `Profiler.stop`'s
nodes by function name and line. The script is inline, so the profiler's line numbers are
HTML lines already.

**The prosthetic probe.** After boot: read `typeof prosVal`; set `parts['l.arm'] =
{severed, pros, prosTier:2}` on a player body and call `atkPower(c)` inside a try; do the
same for a leg and call `moveSpeedRaw(c)`; then `addItem('g_arm')`, sever a second body's
arm, `refreshInv()`, invoke the `[data-pros]` button's `onclick` inside a try, and read the
part, the stash count and the last chronicle line.

**The Maw measurement.** `chars.filter(o => o.eatsDead && o.state === 'ok').length`,
`corpses.length`, down count, and `mawQuarry(maws[0])` fifty times under
`performance.now()`.
