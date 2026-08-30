#!/usr/bin/env node
/* BAKE A .glb INTO THE ONE HTML FILE.
 *
 * Dustward ships as a single self-contained document, so an authored asset cannot be a file
 * next to it — it has to become bytes inside it, the way `LICHP` already is: quantised
 * positions, colours and indices, base64'd, decoded once at load into a shared geometry.
 *
 *   node tools/bakehead.js lyonart=Lyonarthead.glb saga=... lyre=...
 *
 * ---------- WHY THE FIRST VERSION MELTED THE FACES ----------
 * It simplified by VERTEX CLUSTERING: quantise every vertex to a grid, replace each cell
 * with the average of what fell in it, rebuild the triangles. That is a fine way to reduce a
 * rock. It is the wrong way to reduce a face, and the reason is not the budget — 3,000
 * triangles is more than a whole Quake character had. It is that clustering is blind to what
 * it is averaging. A nostril, a lip edge and an eyelid are all sub-cell features, so each one
 * gets replaced by the mean of itself and the flat skin beside it, and every crease in the
 * model is rounded off at once. The silhouette survives and the face does not.
 *
 * This uses QUADRIC ERROR METRICS instead (Garland & Heckbert). Every vertex accumulates the
 * squared-distance-to-planes of the faces around it; collapsing an edge costs whatever that
 * quadric says the move costs. Flat cheeks are cheap and disappear first; the ridge of a nose
 * is expensive and survives to the end. Same triangle budget, and the features are still there
 * because the metric knows they are features.
 *
 * Three things beyond stock QEM, each because of what these particular models are:
 *
 *   WELD FIRST. A textured export splits vertices along every UV seam — Saga arrives as
 *   14,834 vertices describing 5,004 actual points. Those splits are invisible to the eye and
 *   fatal to the algorithm: an edge that exists twice is never a shared edge, so half the mesh
 *   reads as boundary and refuses to simplify. Welding by position is free and it is 66% of
 *   the vertex count on two of these three heads.
 *
 *   HOLD THE BOUNDARY. Lyonart's mesh is not closed — 6,042 edges belong to one triangle
 *   each. Without a constraint the open rim erodes inward and the head grows holes, so every
 *   boundary edge contributes a plane perpendicular to its face, weighted heavily.
 *
 *   COLOUR IS A FEATURE. Geometry alone does not know that an eyebrow is different from the
 *   forehead it sits on — it is nearly flat, so QEM would happily collapse straight through
 *   it. The cost carries a term for how far apart the two vertex colours are, so the edges of
 *   the eyes, the lips and the hairline survive on their own merits.
 *
 * And two conversions that are decisions rather than plumbing:
 *
 *   TEXTURES BECOME VERTEX COLOURS, bilinearly, at full resolution. There is no texture path
 *   in this renderer — every surface in the world is flat-shaded vertex colour.
 *
 *   sRGB BECOMES LINEAR. `renderer.outputEncoding` is sRGB and this three build treats a
 *   material's colour as linear, so an albedo byte handed through unconverted displays about
 *   two stops brighter than it was painted. The bake that skipped this produced three heads
 *   the colour of paper: every feature in the mesh, none of it visible.
 *
 * Normals are NOT stored. They are recomputed at load from the geometry, which is where they
 * came from anyway, and it is a quarter of the vertex payload.
 *
 * ---------- THE INVARIANTS THE LICH PIPELINE ALREADY ESTABLISHED ----------
 * The original converter that produced `LICHP` is not in this repo, and its handoff note is
 * explicit that THE DECODER IS THE SPEC: if encoder and decoder ever disagree, the decoder
 * wins, because that is what runs. So, checked against it:
 *
 *   - Quantisation scales are 32767 / 127 / 255 on both ends. Change one, geometry warps.
 *   - `w` is the index-width flag: 1 means the index buffer is Uint32. It must match the real
 *     vertex count, not a guess.
 *   - Positions are normalised into a unit box centred on the part's own origin, or `s` in
 *     the fit table means nothing.
 *   - Each stream is its OWN base64 string. The decoder reinterprets `atob` output as an
 *     Int16Array over `.buffer`, which is only aligned because of that. Packing two streams
 *     into one blob would break it silently.
 *   - Accessors are read through `byteStride` and `byteOffset` rather than assumed tight —
 *     an interleaved export is what exploded the lich's chestplate the first time.
 *   - An authored part must hide the box parts it overlaps. That is the purple-chest bug, and
 *     it caught this work too: the lich hid its boxes BEFORE `bakeBoxes()` replaced them.
 *
 * What is genuinely new here is the simplification. The lich's parts were authored low-poly
 * (the hood is 696 vertices), so the original converter had nothing to reduce. These heads
 * arrive at 10,000 and 40,000 triangles and cannot go in whole.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGET_TRIS = Number(process.env.HEAD_TRIS || 4000);
const EXPOSURE = Number(process.env.HEAD_EXPOSURE || 0.82);
const COLOUR_W = Number(process.env.HEAD_COLOUR_W || 0.06);   /* how much an albedo edge is worth */
/* WHAT IT IS BAKING INTO. Heads were the first thing through here and the table name and
   output path were written into the file as constants; weapons are the second, and none of
   the machinery above cares which it is. `BAKE_TABLE` names the const the generated file
   declares (HEADP, WEPP) and `BAKE_OUT` is where it lands, so a second kind of asset does not
   mean a second copy of four hundred lines of quadric simplification. */
const BAKE_TABLE = process.env.BAKE_TABLE || 'HEADP';
const OUT = path.join(__dirname, process.env.BAKE_OUT || 'heads.gen.js');

/* ================================ SOFTENING PAINTED DETAIL ================================
 * Reported of the second Lyre head: "her face looks awful, like an old grandma with those
 * heavy lines. Could you smooth it out to be more like Lyonart's face while keeping the red
 * eyes intact?"
 *
 * MEASURED FIRST, because "heavy lines" has two completely different causes and they want
 * opposite fixes. If the creases were GEOMETRY — QEM leaving faceted ridges at 4,000 triangles
 * under a flat-shaded renderer — the answer is a bigger budget. If they are PAINTED into the
 * albedo, a bigger budget reproduces them more faithfully and makes it worse. Luminance spread
 * across the baked vertex colours, which is what a flat-shaded model actually shows you:
 *
 *     lyonart  sdev 27.8   p5-p95  86      <- the face the note asks for
 *     lyre v2  sdev 45.4   p5-p95 138      <- 1.6x the contrast of it
 *     lyre v1  sdev 38.9   p5-p95 124      <- and v2 is worse than what it replaced
 *
 * Painted. So this softens the ALBEDO and leaves the mesh alone.
 *
 * AND IT SOFTENS THE FINE DETAIL ONLY. Flattening every vertex toward the head's mean would
 * take the shadow under the chin and the hair-to-skin step with it and leave a pasty oval —
 * the large-scale shading is most of what makes the thing read as a face at all. So: a few
 * Laplacian passes over the colour give the LOW-frequency field, and the high-frequency
 * remainder — which is exactly what a painted wrinkle is — is scaled down and added back.
 * Unsharp masking, run backwards.
 *
 * THE EYES ARE LOCKED, AND SO IS THE RING AROUND THEM. "Keeping the red eyes intact" is not a
 * side condition, it is the one thing that must survive: 37 vertices of the 2,004 carry a
 * chroma over 40/255 and every one of them is an iris. Smoothing across that boundary would
 * bleed skin into the red and red into the skin — so saturated vertices are frozen, and their
 * immediate neighbours are frozen too, or the iris ends up with a pink halo.
 */
const SOFTEN_ITERS = Number(process.env.HEAD_SOFTEN || 0);      /* Laplacian passes; 0 is off */
const SOFTEN_KEEP  = Number(process.env.HEAD_DETAIL || 1);      /* how much fine detail survives */
const KEEP_CHROMA  = Number(process.env.HEAD_KEEP_CHROMA || 0.157);   /* 40/255 — an iris, not skin */
function soften(P, C, I, log){
  if(SOFTEN_ITERS <= 0 || SOFTEN_KEEP >= 1) return;
  const nv = P.length / 3;
  const adj = Array.from({ length: nv }, () => []);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
  }
  const locked = new Uint8Array(nv);
  let eyes = 0;
  for (let v = 0; v < nv; v++) {
    const r = C[v * 3], g = C[v * 3 + 1], b = C[v * 3 + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > KEEP_CHROMA) { locked[v] = 1; eyes++; }
  }
  /* and one ring out, or the iris gets a pink halo where skin averaged into it */
  const halo = Uint8Array.from(locked);
  for (let v = 0; v < nv; v++) if (locked[v]) for (const u of adj[v]) halo[u] = 1;
  let S = Float64Array.from(C);
  for (let it = 0; it < SOFTEN_ITERS; it++) {
    const N = Float64Array.from(S);
    for (let v = 0; v < nv; v++) {
      if (halo[v]) continue;
      const a = adj[v]; if (!a.length) continue;
      let r = 0, g = 0, b = 0;
      for (const u of a) { r += S[u * 3]; g += S[u * 3 + 1]; b += S[u * 3 + 2]; }
      const n = a.length;
      N[v * 3] = (S[v * 3] + r / n) * 0.5;
      N[v * 3 + 1] = (S[v * 3 + 1] + g / n) * 0.5;
      N[v * 3 + 2] = (S[v * 3 + 2] + b / n) * 0.5;
    }
    S = N;
  }
  for (let v = 0; v < nv; v++) {
    if (halo[v]) continue;
    for (let k = 0; k < 3; k++) {
      const i = v * 3 + k;
      C[i] = Math.max(0, Math.min(1, S[i] + (C[i] - S[i]) * SOFTEN_KEEP));
    }
  }
  /* Report the FINE-DETAIL figure, not the global spread. Global luminance sdev is the wrong
     score here and the first sweep proved it: six passes only moved it 45.4 -> 36.7 against
     Lyonart's 27.8 and then plateaued, because most of Lyre's spread is her near-white hair
     against her skin — legitimate large-scale contrast that should stay. What the note is
     about is the high-frequency part, so measure exactly that: how far each vertex sits from
     the average of the ones touching it.
         lyonart  detail mean 6.05  p95 22.13      <- the face the note asks for
         czarina  detail mean 7.25  p95 31.88
         lyre v2  detail mean 16.08 p95 48.96      <- 2.7x Lyonart's                        */
  const lum = (v) => 0.2126 * C[v * 3] + 0.7152 * C[v * 3 + 1] + 0.0722 * C[v * 3 + 2];
  const d = [];
  for (let v = 0; v < nv; v++) {
    const a = adj[v]; if (!a.length) continue;
    let n = 0; for (const u of a) n += lum(u);
    d.push(Math.abs(lum(v) - n / a.length) * 255);
  }
  d.sort((x, y) => x - y);
  const mean = d.reduce((x, y) => x + y, 0) / d.length;
  log(`      softened ${SOFTEN_ITERS}x keeping ${SOFTEN_KEEP} of the fine detail — ${eyes} saturated verts locked, ${halo.reduce((a, b) => a + b, 0) - eyes} more in their ring; fine detail now mean ${mean.toFixed(2)} p95 ${d[Math.floor(d.length * 0.95)].toFixed(2)}`);
}
/* ================================ glTF ================================ */
function readGLB(p) {
  const b = fs.readFileSync(p);
  if (b.readUInt32LE(0) !== 0x46546C67) throw new Error(p + ': not a .glb');
  let off = 12, json = null, bin = null;
  while (off + 8 <= b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    const data = b.slice(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004E4942) bin = data;
    off += 8 + len;
  }
  return { json, bin };
}
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(json, bin, i) {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
  const [Ctor, sz] = COMP[a.componentType], n = NUM[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || 0;
  const out = new (a.componentType === 5126 ? Float32Array : Ctor)(a.count * n);
  if (!stride || stride === sz * n) out.set(new Ctor(bin.buffer, bin.byteOffset + start, a.count * n));
  else for (let e = 0; e < a.count; e++) {
    const src = new Ctor(bin.buffer, bin.byteOffset + start + e * stride, n);
    for (let k = 0; k < n; k++) out[e * n + k] = src[k];
  }
  return out;
}

function s2l(byte) {
  const s = byte / 255;
  const lin = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  return Math.min(1, lin * EXPOSURE);
}

/* ================================ weld ================================ */
function weld(P, C, I) {
  const map = new Map(), remap = new Int32Array(P.length / 3);
  const oP = [], oC = [], cnt = [];
  for (let v = 0; v < P.length / 3; v++) {
    const k = Math.round(P[v * 3] * 1e5) + ',' + Math.round(P[v * 3 + 1] * 1e5) + ',' + Math.round(P[v * 3 + 2] * 1e5);
    let id = map.get(k);
    if (id === undefined) {
      id = oP.length / 3; map.set(k, id);
      oP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      oC.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
      cnt.push(1);
    } else {
      /* a seam splits one point into several with the SAME position and different UVs, so the
         colours differ — average them rather than taking whichever came last */
      oC[id * 3] += C[v * 3]; oC[id * 3 + 1] += C[v * 3 + 1]; oC[id * 3 + 2] += C[v * 3 + 2];
      cnt[id]++;
    }
    remap[v] = id;
  }
  for (let i = 0; i < cnt.length; i++) { oC[i * 3] /= cnt[i]; oC[i * 3 + 1] /= cnt[i]; oC[i * 3 + 2] /= cnt[i]; }
  const oI = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]];
    if (a !== b && b !== c && a !== c) oI.push(a, b, c);
  }
  return { P: Float64Array.from(oP), C: Float64Array.from(oC), I: Int32Array.from(oI) };
}

/* ============================ quadric simplify ============================ */
/* A quadric is the symmetric 4x4 as ten numbers:
   [0]=xx [1]=xy [2]=xz [3]=xw [4]=yy [5]=yz [6]=yw [7]=zz [8]=zw [9]=ww  */
function planeQuadric(a, b, c, d, w) {
  return [a*a*w, a*b*w, a*c*w, a*d*w, b*b*w, b*c*w, b*d*w, c*c*w, c*d*w, d*d*w];
}
function qAdd(A, B) { for (let i = 0; i < 10; i++) A[i] += B[i]; }
function qErr(q, x, y, z) {
  return q[0]*x*x + 2*q[1]*x*y + 2*q[2]*x*z + 2*q[3]*x
       + q[4]*y*y + 2*q[5]*y*z + 2*q[6]*y
       + q[7]*z*z + 2*q[8]*z + q[9];
}

function simplify(P, C, I, target, log) {
  const nv = P.length / 3;
  const Q = []; for (let i = 0; i < nv; i++) Q.push(new Float64Array(10));
  const tri = Int32Array.from(I);
  const nt0 = tri.length / 3;
  const alive = new Uint8Array(nt0).fill(1);
  const dead = new Uint8Array(nv);
  const inc = []; for (let i = 0; i < nv; i++) inc.push(new Set());

  const faceNormal = (t, px) => {
    const a = tri[t*3]*3, b = tri[t*3+1]*3, c = tri[t*3+2]*3;
    const p = px || P;
    const ux = p[b]-p[a], uy = p[b+1]-p[a+1], uz = p[b+2]-p[a+2];
    const vx = p[c]-p[a], vy = p[c+1]-p[a+1], vz = p[c+2]-p[a+2];
    return [uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx];
  };
  /* face quadrics, area-weighted by construction (the un-normalised normal carries the area) */
  for (let t = 0; t < nt0; t++) {
    const [nx, ny, nz] = faceNormal(t);
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-14) { alive[t] = 0; continue; }
    const a = nx/l, b = ny/l, c = nz/l;
    const v0 = tri[t*3]*3;
    const d = -(a*P[v0] + b*P[v0+1] + c*P[v0+2]);
    const q = planeQuadric(a, b, c, d, l * 0.5);
    for (let k = 0; k < 3; k++) { qAdd(Q[tri[t*3+k]], q); inc[tri[t*3+k]].add(t); }
  }
  /* edges, and which faces each belongs to */
  const ekey = (a, b) => (a < b ? a * nv + b : b * nv + a);
  const efaces = new Map();
  for (let t = 0; t < nt0; t++) {
    if (!alive[t]) continue;
    const a = tri[t*3], b = tri[t*3+1], c = tri[t*3+2];
    for (const [x, y] of [[a,b],[b,c],[c,a]]) {
      const k = ekey(x, y);
      let s = efaces.get(k); if (!s) { s = []; efaces.set(k, s); }
      s.push(t);
    }
  }
  /* HOLD THE BOUNDARY: an edge with one face gets a plane perpendicular to that face, heavily
     weighted, so an open rim stays where it is instead of eroding inwards */
  let bnd = 0;
  for (const [k, fs2] of efaces) {
    if (fs2.length !== 1) continue;
    bnd++;
    const a = Math.floor(k / nv), b = k % nv;
    const [fnx, fny, fnz] = faceNormal(fs2[0]);
    const fl = Math.hypot(fnx, fny, fnz) || 1;
    const ex = P[b*3]-P[a*3], ey = P[b*3+1]-P[a*3+1], ez = P[b*3+2]-P[a*3+2];
    const el = Math.hypot(ex, ey, ez) || 1;
    /* n = edge x faceNormal — the plane that contains the edge and stands up from the surface */
    let nx = ey*(fnz/fl) - ez*(fny/fl), ny = ez*(fnx/fl) - ex*(fnz/fl), nz = ex*(fny/fl) - ey*(fnx/fl);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const d = -(nx*P[a*3] + ny*P[a*3+1] + nz*P[a*3+2]);
    const q = planeQuadric(nx, ny, nz, d, el * 40);
    qAdd(Q[a], q); qAdd(Q[b], q);
  }

  /* the optimal contraction point, or the best of three fallbacks when the system is singular */
  const bestPoint = (a, b, q) => {
    const m = [q[0],q[1],q[2], q[1],q[4],q[5], q[2],q[5],q[7]];
    const det = m[0]*(m[4]*m[8]-m[5]*m[7]) - m[1]*(m[3]*m[8]-m[5]*m[6]) + m[2]*(m[3]*m[7]-m[4]*m[6]);
    if (Math.abs(det) > 1e-12) {
      const rx = -q[3], ry = -q[6], rz = -q[8];
      const x = (rx*(m[4]*m[8]-m[5]*m[7]) - m[1]*(ry*m[8]-m[5]*rz) + m[2]*(ry*m[7]-m[4]*rz)) / det;
      const y = (m[0]*(ry*m[8]-m[5]*rz) - rx*(m[3]*m[8]-m[5]*m[6]) + m[2]*(m[3]*rz-ry*m[6])) / det;
      const z = (m[0]*(m[4]*rz-ry*m[7]) - m[1]*(m[3]*rz-ry*m[6]) + rx*(m[3]*m[7]-m[4]*m[6])) / det;
      if (isFinite(x) && isFinite(y) && isFinite(z)) return [x, y, z, qErr(q, x, y, z)];
    }
    let best = null;
    for (const [x, y, z] of [
      [P[a*3], P[a*3+1], P[a*3+2]],
      [P[b*3], P[b*3+1], P[b*3+2]],
      [(P[a*3]+P[b*3])/2, (P[a*3+1]+P[b*3+1])/2, (P[a*3+2]+P[b*3+2])/2]]) {
      const e = qErr(q, x, y, z);
      if (!best || e < best[3]) best = [x, y, z, e];
    }
    return best;
  };
  const colourCost = (a, b) => {
    const dr = C[a*3]-C[b*3], dg = C[a*3+1]-C[b*3+1], db = C[a*3+2]-C[b*3+2];
    return (dr*dr + dg*dg + db*db) * COLOUR_W;
  };

  /* a binary heap with lazy invalidation: a popped entry is re-checked against the current
     version of its endpoints and dropped if either has moved since it was pushed */
  const heap = [];
  const ver = new Int32Array(nv);
  const push = (o) => {
    heap.push(o); let i = heap.length - 1;
    while (i > 0) { const p2 = (i - 1) >> 1; if (heap[p2].cost <= heap[i].cost) break; [heap[p2], heap[i]] = [heap[i], heap[p2]]; i = p2; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0;
      for (;;) { const l = i*2+1, r = l+1; let s = i;
        if (l < heap.length && heap[l].cost < heap[s].cost) s = l;
        if (r < heap.length && heap[r].cost < heap[s].cost) s = r;
        if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } }
    return top;
  };
  const makeEdge = (a, b) => {
    const q = new Float64Array(10); qAdd(q, Q[a]); qAdd(q, Q[b]);
    const [x, y, z, e] = bestPoint(a, b, q);
    return { a, b, x, y, z, cost: Math.max(0, e) + colourCost(a, b), va: ver[a], vb: ver[b] };
  };
  for (const k of efaces.keys()) push(makeEdge(Math.floor(k / nv), k % nv));

  let live = nt0;
  for (let t = 0; t < nt0; t++) if (!alive[t]) live--;

  while (live > target && heap.length) {
    const e = pop();
    const { a, b } = e;
    if (dead[a] || dead[b] || ver[a] !== e.va || ver[b] !== e.vb) continue;
    /* the faces that die with this edge, and the ones that merely move */
    const shared = [], moved = new Set();
    for (const t of inc[a]) { if (!alive[t]) continue; if (inc[b].has(t)) shared.push(t); else moved.add(t); }
    for (const t of inc[b]) { if (!alive[t]) continue; if (!inc[a].has(t)) moved.add(t); }
    if (shared.length > 2) continue;                      /* non-manifold; leave it alone */
    /* REJECT A FLIP, AND REJECT A SLIVER. Moving a vertex can turn a triangle inside out,
       which reads as a spike through the face; it can also leave one so thin that its normal
       is numerically meaningless, which is what put the shards across Saga's cheek on the
       first quadric pass. A neighbour must keep facing roughly the way it did AND stay a
       triangle worth shading. */
    let flips = false;
    const oax = P[a*3], oay = P[a*3+1], oaz = P[a*3+2];
    const obx = P[b*3], oby = P[b*3+1], obz = P[b*3+2];
    for (const t of moved) {
      const before = faceNormal(t);
      P[a*3] = e.x; P[a*3+1] = e.y; P[a*3+2] = e.z;
      P[b*3] = e.x; P[b*3+1] = e.y; P[b*3+2] = e.z;
      const after = faceNormal(t);
      const i0 = tri[t*3]*3, i1 = tri[t*3+1]*3, i2 = tri[t*3+2]*3;
      const eL = Math.max(
        (P[i1]-P[i0])**2 + (P[i1+1]-P[i0+1])**2 + (P[i1+2]-P[i0+2])**2,
        (P[i2]-P[i1])**2 + (P[i2+1]-P[i1+1])**2 + (P[i2+2]-P[i1+2])**2,
        (P[i0]-P[i2])**2 + (P[i0+1]-P[i2+1])**2 + (P[i0+2]-P[i2+2])**2);
      P[a*3] = oax; P[a*3+1] = oay; P[a*3+2] = oaz;
      P[b*3] = obx; P[b*3+1] = oby; P[b*3+2] = obz;
      const la = Math.hypot(...after);
      if (la < 1e-15) { flips = true; break; }
      const dot = (before[0]*after[0] + before[1]*after[1] + before[2]*after[2]) / (Math.hypot(...before) * la || 1);
      if (dot < 0.30) { flips = true; break; }
      if (la * 0.5 < eL * 0.012) { flips = true; break; }   /* area against the longest edge */
    }
    if (flips) continue;
    /* do it: a takes the new position and the blended colour, b is retired */
    P[a*3] = e.x; P[a*3+1] = e.y; P[a*3+2] = e.z;
    C[a*3] = (C[a*3] + C[b*3]) / 2; C[a*3+1] = (C[a*3+1] + C[b*3+1]) / 2; C[a*3+2] = (C[a*3+2] + C[b*3+2]) / 2;
    qAdd(Q[a], Q[b]);
    for (const t of shared) { alive[t] = 0; live--; }
    for (const t of inc[b]) {
      if (!alive[t]) continue;
      for (let k = 0; k < 3; k++) if (tri[t*3+k] === b) tri[t*3+k] = a;
      inc[a].add(t);
    }
    inc[b].clear(); dead[b] = 1;
    ver[a]++; ver[b]++;
    /* re-price every edge still touching a */
    const nbr = new Set();
    for (const t of inc[a]) { if (!alive[t]) continue; for (let k = 0; k < 3; k++) { const u = tri[t*3+k]; if (u !== a && !dead[u]) nbr.add(u); } }
    for (const u of nbr) push(makeEdge(a, u));
  }

  /* compact */
  const remap = new Int32Array(nv).fill(-1);
  const oP = [], oC = [];
  const oI = [];
  for (let t = 0; t < nt0; t++) {
    if (!alive[t]) continue;
    const v = [tri[t*3], tri[t*3+1], tri[t*3+2]];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (const u of v) if (remap[u] < 0) {
      remap[u] = oP.length / 3;
      oP.push(P[u*3], P[u*3+1], P[u*3+2]);
      oC.push(C[u*3], C[u*3+1], C[u*3+2]);
    }
    oI.push(remap[v[0]], remap[v[1]], remap[v[2]]);
  }
  if (log) log(`      welded ${nv} verts / ${nt0} tris, ${bnd} boundary edges held`);
  return { P: Float64Array.from(oP), C: Float64Array.from(oC), I: Int32Array.from(oI) };
}

const b64 = (buf) => Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('base64');

(async () => {
  /* key=file.glb[:tris] — the budget is per head on purpose. QEM spends triangles where the
     curvature is, and hair is nothing but curvature: on a model whose hair is half the mesh
     the face is left starving at a budget that suits a smoother head perfectly well. */
  const jobs = process.argv.slice(2).map(a => {
    const i = a.indexOf('=');
    if (i < 0) throw new Error('expected key=path, got ' + a);
    const rest = a.slice(i + 1), c = rest.lastIndexOf(':');
    /* the suffix is stripped whenever one PARSED, not whenever it differs from the default —
       asking for `:4000` when the default is also 4000 used to leave ':4000' on the path and
       fail with ENOENT on a file that was plainly there */
    const hasTris = c > 1 && /^\d+$/.test(rest.slice(c + 1));
    const tris = hasTris ? Number(rest.slice(c + 1)) : TARGET_TRIS;
    return { key: a.slice(0, i), file: hasTris ? rest.slice(0, c) : rest, tris };
  });
  if (!jobs.length) { console.log('usage: node tools/bakehead.js key=file.glb [key=file.glb ...]'); return; }

  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const page = await b.newPage();
  await page.goto('about:blank');

  const out = [];
  for (const job of jobs) {
    const { json, bin } = readGLB(job.file);
    const prim = json.meshes[0].primitives[0];
    const P0 = accessor(json, bin, prim.attributes.POSITION);
    const UV = prim.attributes.TEXCOORD_0 !== undefined ? accessor(json, bin, prim.attributes.TEXCOORD_0) : null;
    const IDX = prim.indices !== undefined ? accessor(json, bin, prim.indices) : Uint32Array.from({ length: P0.length / 3 }, (_, i) => i);

    let tex = null;
    const mat = json.materials[prim.material || 0];
    const bct = mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
    if (bct && UV) {
      const img = json.images[json.textures[bct.index].source];
      const bv = json.bufferViews[img.bufferView];
      const bytes = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
      tex = await page.evaluate(async ({ b64, mime }) => {
        const bin2 = atob(b64), u8 = new Uint8Array(bin2.length);
        for (let i = 0; i < bin2.length; i++) u8[i] = bin2.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([u8], { type: mime }));
        const cv = new OffscreenCanvas(bmp.width, bmp.height), cx = cv.getContext('2d');
        cx.drawImage(bmp, 0, 0);
        const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
        return { w: bmp.width, h: bmp.height, px: Array.from(d) };
      }, { b64: bytes.toString('base64'), mime: img.mimeType || 'image/png' });
    }
    const C0 = new Float64Array(P0.length);
    if (tex) {
      const { w, h, px } = tex;
      /* BILINEAR, at full resolution. The nearest-neighbour half-res version of this was
         sampling one pixel of a 2k map per vertex and throwing away every soft edge in it —
         lips and brows arrived as noise rather than as a gradient with a shape. */
      for (let v = 0; v < P0.length / 3; v++) {
        let u = UV[v * 2], t = UV[v * 2 + 1];
        u -= Math.floor(u); t -= Math.floor(t);
        const fx = u * (w - 1), fy = t * (h - 1);
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
        const ax = fx - x0, ay = fy - y0;
        for (let k = 0; k < 3; k++) {
          const p00 = px[(y0*w + x0)*4 + k], p10 = px[(y0*w + x1)*4 + k];
          const p01 = px[(y1*w + x0)*4 + k], p11 = px[(y1*w + x1)*4 + k];
          const top = p00 + (p10 - p00) * ax, bot = p01 + (p11 - p01) * ax;
          C0[v * 3 + k] = s2l(top + (bot - top) * ay);
        }
      }
    } else {
      const f = (mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor) || [0.8, 0.75, 0.7];
      for (let v = 0; v < P0.length / 3; v++) for (let k = 0; k < 3; k++) C0[v * 3 + k] = f[k];
    }

    const W = weld(Float64Array.from(P0), C0, Int32Array.from(IDX));
    const R = simplify(W.P, W.C, W.I, job.tris, s => console.log(s));
    soften(R.P, R.C, R.I, s => console.log(s));

    /* centre it, and make the longest axis exactly 1 */
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < R.P.length; i += 3) for (let k = 0; k < 3; k++) {
      if (R.P[i + k] < mn[k]) mn[k] = R.P[i + k];
      if (R.P[i + k] > mx[k]) mx[k] = R.P[i + k];
    }
    const span = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
    for (let i = 0; i < R.P.length; i += 3) for (let k = 0; k < 3; k++)
      R.P[i + k] = (R.P[i + k] - (mn[k] + mx[k]) / 2) / span;

    const nv = R.P.length / 3, nt = R.I.length / 3;
    const qp = new Int16Array(nv * 3), qc = new Uint8Array(nv * 3);
    for (let i = 0; i < nv * 3; i++) {
      qp[i] = Math.max(-32767, Math.min(32767, Math.round(R.P[i] * 32767)));
      qc[i] = Math.max(0, Math.min(255, Math.round(R.C[i] * 255)));
    }
    const wide = nv > 65535;
    const qi = wide ? new Uint32Array(R.I) : new Uint16Array(R.I);
    const rec = `  ${job.key}: {v:${nv}, w:${wide ? 1 : 0}, p:'${b64(qp)}', c:'${b64(qc)}', i:'${b64(qi)}'},`;
    out.push(rec);
    let sum = 0; for (let i = 0; i < qc.length; i++) sum += qc[i];
    console.log(`  ${job.key.padEnd(9)} ${String(IDX.length / 3).padStart(6)} tris in  ->  ${String(nt).padStart(5)} tris, ${String(nv).padStart(5)} verts,  ` +
      `${Math.round(rec.length / 1024)} KB   mean colour ${Math.round(sum / qc.length)}/255`);
  }
  await b.close();

  fs.writeFileSync(OUT, '/* generated by tools/bakehead.js — do not hand-edit */\nconst ' + BAKE_TABLE + ' = {\n' + out.join('\n') + '\n};\n');
  console.log('\nwrote ' + path.relative(process.cwd(), OUT) + ' — ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB');
})();
