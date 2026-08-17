# Dustward — Authored-Mesh (GLB) Pipeline

Handoff reference for continuing the lich-style authored-mesh work. Covers the full path:
offline bake (GLB → inlined base64) and runtime decode → geometry → attach to the box-rig.

**Design goal:** embed a real authored mesh in the single-file HTML build with no external
assets and no glTF loader library. The GLB is quantized + base64-inlined at build time, then
rebuilt into `THREE.BufferGeometry` at runtime and skinned onto the existing procedural
box-rig bones. **You are not animating a GLB — you are skinning box-rig bones with baked
geometry.** That is the whole trick, and why the lich animates with the same machine as every
other character.

Stack: Three.js r128 (global `THREE`), single-file `dustward3d_hd.html`.

> **The encoder exists now.** This note used to say `glb/convert.js` was lost and would have
> to be rebuilt. It was — as `tools/bakehead.js`, which does the whole job (GLB in, a
> `{v,w,p,c,i}` table out) and simplifies with quadric error metrics rather than the vertex
> clustering that melted the first set of faces. It is table-agnostic:
>
> ```
> BAKE_TABLE=HELMP BAKE_OUT=helms.gen.js node tools/bakehead.js alch=path/to.glb:2400
> ```
>
> `BAKE_TABLE` names the const the generated file declares, `BAKE_OUT` where it lands, and
> `key=file.glb:tris` sets a per-asset triangle budget. The `.gen.js` it writes is **not
> loaded by the game** — the file has to stay one download, so its contents are spliced into
> the matching `const XP = {...}` block in the HTML. Splice with an anchored edit, never a
> global replace: the packs are megabytes of base64 sitting in the same text and a loose
> substitution corrupts a mesh silently.

---

## File anchors (shipped build, approximate — grep to confirm)

| Symbol | ~Line | Role |
|---|---|---|
| `const LICHP = {` | 15046 | the lich's hood — all that is left of the authored lich body |
| `const HEADP = {` | 15058 | sculpted faces, including `lyonlich` |
| `const HELMP = {` | 15083 | helmets, which replace a whole head |
| `const WEPP = {` | 15087 | authored weapons |
| `function bakedGeo(pack, store, k)` | 15093 | ONE decoder for every pack |
| `const LICHFACE = {` | ~15190 | named faces that have their own ascended head |
| `const D2R = Math.PI/180` | 8252 | degrees→radians for FIT rotations |
| `function lichGeo(k)` | 8224 | runtime decode → cached BufferGeometry |
| `const LICHFIT = {` | 8244 | per-part transform tuning table |
| `function lichPart(...)` | 8253 | geometry → positioned mesh on a bone |
| `if(c.lich){` | 9393 | assembly: hide box parts, attach authored |

The **runtime is fully self-contained in the game file** (`LICHP`, `lichGeo`, `LICHFIT`,
`lichPart`, assembly block). Repositioning needs no re-bake — edit `LICHFIT` only.

---

## 1. Baked data: `LICHP`

One entry per body part (`hood`, `chest`, `robe`, `sleeve`, `bracer`, `hand`). Parts are
pre-split by body region **at bake time** because they attach to different rig bones. Each
entry:

- `v` — vertex count
- `w` — index-width flag. `1` = index buffer is `Uint32` (>65535 indices), `0` = `Uint16`.
- `p` — base64 of **positions**, quantized `Int16`: `round(value * 32767)`.
  Positions MUST be normalized into a unit box centered on the part's own origin before baking,
  or `LICHFIT.s` scale becomes meaningless.
- `n` — base64 of **normals**, quantized `Int8`: `round(value * 127)`.
- `c` — base64 of **vertex colors**, quantized `Uint8`: `round(value * 255)`.
- `i` — base64 of the **index buffer**.

---

## 2. Offline encoder: `glb/convert.js`  ⚠ NOT in the runtime file

This produces the `LICHP` table you paste in. It lived in the `glb/` working dir (also
`payload.js`, `parts.json`). **It is the piece most needed to add new models and is NOT in the
game file** — recover from `/mnt/project/` or the repo, or rebuild to this spec:

1. Load the GLB (author in Meshy etc., export GLB).
2. Read each primitive's `POSITION`, `NORMAL`, `COLOR_0`, indices from the binary buffer.
   **GOTCHA:** export **non-interleaved** if possible. An interleaved buffer (streams packed
   per-vertex with a `byteStride`) is what previously exploded the chestplate. The converter
   MUST honor each accessor's `byteStride` + `byteOffset` — never assume tight packing.
3. Normalize positions into a unit box centered on part origin.
4. Quantize each stream (Int16 / Int8 / Uint8) — **same scales as the decoder**.
5. Base64-encode; emit `{v,w,p,n,c,i}`.

Adding/swapping a model happens here. Keep quantization scales identical to the decoder
(32767 / 127 / 255) or geometry warps.

---

## 3. Runtime decode: `lichGeo(k)`

Lazily decodes one part, caches in `_lichGeo`:

```
atob() each base64 string  → Uint8Array
positions  → Int16Array over .buffer;  normals → Int8Array over .buffer
dequantize:  P[i]=qp[i]/32767   N[i]=qn[i]/127   C[i]=cb[i]/255
build BufferGeometry; setAttribute position/normal/color (itemSize 3)
setIndex: Uint32Array if w===1 else Uint16Array
cache + return
```

**Subtlety:** the `.buffer` reinterpret (`new Int16Array(pb.buffer)`) assumes the `atob`
output is byte-aligned — true here because each stream is its own base64 string. If a future
part packs multiple streams into one blob, that alignment assumption breaks.

---

## 4. Tuning table: `LICHFIT`

Per part: `{s, x, y, z, rx, ry, rz}`.
- `s` — scale along longest axis in rig units (head ≈ 0.3, torso ≈ 0.5)
- `x/y/z` — offset from the bone it hangs on
- `rx/ry/rz` — rotation in **degrees** (converted via `D2R`). `ry:180` is the usual fix for a
  part that faces backward.

All visual fiddling happens here; no re-bake needed to reposition.

---

## 5. Geometry → mesh: `lichPart(k, parent, mats, mirror)`

Fetches cached geometry, wraps in `MeshLambertMaterial({vertexColors:true})` (so baked colors
show), applies the `LICHFIT` transform, `parent.add(m)`. `mirror` negates X scale + X position
— that's how one baked `sleeve`/`bracer`/`hand` serves both arms.

---

## 6. Attachment to the rig (`if(c.lich){ ... }`)

The lich reuses the **same procedural box-rig every character has**. `e.headG`, `e.spine`,
`e.armL/armR`, `e.elbL/elbR` are bone groups the animation system already drives. When
`c.lich`, the assembly block:

1. **Hides** the box parts the authored mesh replaces:
   `e.boxArm`, `e.boxLeg`, `e.head`, `e.torso`, and `e.boxBody`.
   > `e.boxBody` (shoulder yoke + neck + waist) is the **purple-chest bug**: those boxes are
   > the lich's faction color (`#6a4a9a`) and sat ON TOP of the authored chest until collected
   > into `e.boxBody` and hidden. Any new authored part must hide the box parts it overlaps or
   > you get z-fighting and stray colored boxes.
2. **Attaches** authored parts to those bones:
   hood→`headG`, chest+robe→`spine`, sleeves→`armL/armR`, bracers+hands→`elbL/elbR`
   (sleeve/bracer/hand called twice, `mirror` true for left).
3. Sets `e.authored = true` (downstream animation checks this).

Because authored parts hang on the existing bones, the animation rig never learns the
difference.

---

## Invariants that bite

- Quantization scales must match on both ends: **32767 / 127 / 255**.
- Export **non-interleaved**, or honor `byteStride` + `byteOffset` per accessor.
- The `w` flag must match the real index count (Uint32 vs Uint16).
- Any new authored part must **hide the box parts it overlaps** (purple-chest class of bug).
- Positions normalized into a unit box centered on part origin before baking.
- `.buffer` reinterpret assumes one base64 string per stream (byte alignment).

---

## Adding a NEW authored creature (the pattern)

1. Bake parts → add a `LICHP`-style table.
2. Add a `FIT` table (`{s,x,y,z,rx,ry,rz}` per part).
3. Write an assembly block that **hides the relevant box parts** and attaches authored ones to
   the existing bone groups.

The lich is the ONLY GLB creature in the codebase — it is the reference. The Larder-Kin and
the automaton are box-only (no GLB) and are NOT models for this path.

---

## Fitting: the part that is not plumbing

`s`, `x/y/z` and `rx/ry/rz` cannot be reasoned out, because none of them is a property of this
game — they are properties of whoever exported the file. Three traps, each of which cost a
round of guessing:

- **The baker normalises on the LONGEST axis, whichever that is.** A helmet's longest axis is
  front-to-back, so scaling one uniformly to head width leaves it half again as deep as the
  head it covers. `HELMFIT` takes optional `sx/sy/sz` multipliers on top of `s` for exactly
  this; the alchemy helm needs `sz: 0.78` to stop reading as a snout.
- **The same rotation means two different things in two stances.** The Aether Lance's `rx:80.2`
  levels it while the body is braced to fire and points it into the dirt while the arm hangs.
  A weapon with two carries declares an `aim` pose in `WEPFIT` and the animator crossfades
  between them off `e.aimK`; both ends have to be measured *in the stance they are used in*.
- **A named body may keep its own rig.** `LICHFACE` maps a face to its ascended head, and
  `robedLich(c)` is what every strip-the-body branch asks — the robe assembly, the box-hiding
  and the float-instead-of-walk. A new one of these must be added to `LICHFACE` and nothing
  else; it must NOT be special-cased at the call sites.

Measure with `tools/kit.js`, which renders the three sheets and then asserts the numbers under
them. Fit numbers can be overridden on the command line so a value is found in one browser
session rather than one rebuild of a 1.8 MB file per guess:

```
node tools/kit.js /tmp/out game.html '{"w_lance":{"s":2.4},"alch":{"sz":0.7}}'
```

## Honest caveat

**The decoder (`bakedGeo`) in the game file is the authoritative spec for what the encoder must
output** — if the two ever disagree, the decoder wins, because that's what actually runs.
