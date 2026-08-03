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

## What each one measures

### Correctness — run these before committing

| harness | what it checks |
|---|---|
| `towncheck.js` | Town geometry: overlapping footprints, buildings touching walls or standing in water, every door reachable by flood fill from the plaza, wells/flags/vendors/beds/guard posts in the open, town spacing. Takes a path, so it can be run across seeds. |
| `roundtrip.js` | Save/load fidelity for the Fracture clock, every hall's dread and wake state, shown-proofs, cooldowns, and the whole Compact including the muster roster. |
| `doorsave.js` | Save/load fidelity for the door, the doorborn, fallen seats and the ruin flag. |
| `fight.js` | 900 combat resolutions across every weapon × armour pair. Watches for throws and for NaN reaching a blood pool or a body part. |
| `wepsoak.js` | 160 weapon and armour swap cycles, then a save/load round trip. Catches geometry leaks and orphaned meshes. |
| `immortal.js` | Walks both immortal roads stage by stage through the real UI, checks every gated stage refuses until its condition is met, and confirms favor outlives the giver's corpse. |
| `rite.js` | The Last Rite as a scene: that it opens rather than resolving, draws three waves, completes undisturbed, and collapses — still spending the offering — if the ritualist is driven off the circle or the offering is killed. |
| `shaping.js` | Binds the same recipe at three shapes and reports what actually came out — a Bone Golem should be seven times slower than a Skittering one, not five percent. Also checks promotion is gated on kills and frees a binding slot. |
| `names.js` | Name collision rate across a fresh world, and samples of what the generator produced. |

### Balance

| harness | what it measures |
|---|---|
| `pierce.js` | Damage actually taken from an identical nominal hit through each armour. This is the probe that showed ranged delivering a flat 30 through naked skin, masterwork plate and carapace alike. |
| `matrix.js` | The full damage-type × armour-class matrix, plus binding strain and Darkbolt scaling. |
| `dps2.js` | Effective DPS per weapon against five target archetypes, through the game's real mitigation. |
| `ttk.js` | Swings to put a target down, by weapon and armour. The readable form of the matchup table — it is where "the club beats plate" stops being a claim. |
| `behave.js` | Lance cells and overheat, massed-fire stray scaling, the Darkbolt mark (must be +10% for undead and +0% for the living), binding strain. |

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
| `simcost.js` | Isolated `update()` cost plus a 20-second soak. The primary perf number. |
| `bench.js` | Fuller picture: draw calls, scene objects, shadow casters, micro-costs for the hot paths, autosave size, and a dyn-group leak check. Writes a JSON file per label. |

### Visual

| harness | what it renders |
|---|---|
| `wep3.js` | One character holding one weapon, close. `node tools/wep3.js w_nod out.png` |
| `town.js` | A town from above. `node tools/town.js out.png <townIndex>` |

## Notes

- `update()` takes a `dt`. Calling it bare sends NaN through every position in the world and
  the first symptom is an unrelated-looking throw out of the audio envelope.
- `syncChars` builds a bounded number of character meshes per frame, so a probe that spawns
  test characters has to wait several seconds, or clear `chars` first, before the meshes exist.
- Worldgen is seeded from a constant, so repeat runs are identical. That proves determinism,
  not robustness — vary the seed to test that.
- `camX`/`camY` are the look-at point, not the camera position.
