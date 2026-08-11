#!/usr/bin/env node
/* BAKE A .glb HEAD INTO THE ONE HTML FILE.
 *
 * Dustward ships as a single self-contained document, so an authored asset cannot be a file
 * next to it — it has to become bytes inside it. That is what the `LICHP` block already is:
 * quantised positions, normals, colours and indices, base64'd, decoded once at load into a
 * shared BufferGeometry. This produces more of them.
 *
 *   node tools/bakehead.js lyonart=path/to/Lyonarthead.glb saga=... ilsabet=...
 *
 * Three things have to happen on the way in, and each is a decision rather than a conversion:
 *
 *  1. TEXTURES BECOME VERTEX COLOURS. The game has no texture pipeline — every surface in it
 *     is flat-shaded vertex colour — so the base-colour map is sampled per vertex and thrown
 *     away. It is sampled and passed through UNCONVERTED: `renderer.outputEncoding` is sRGB
 *     and r128 treats material colours as linear, so every hex in this codebase is already
 *     being used as though it were linear. Converting these would make the heads the only
 *     things in the world lit on a different curve.
 *
 *  2. THEY GET SMALLER. A 40,000-triangle sculpt is 500 KB of base64 and this file is 1.1 MB.
 *     Vertex clustering rather than edge collapse: it is fifty lines instead of five hundred,
 *     it is deterministic, and the chunky faceted result it gives is the house style anyway.
 *     The grid resolution is binary-searched to land on the triangle budget.
 *
 *  3. THEY ARE NORMALISED. Positions come out centred on the bounding box with the longest
 *     axis spanning exactly 1.0, which is what makes `s` in the fit table mean "how big, in
 *     rig units" instead of "whatever the sculptor's scene units happened to be".
 *
 * The PNG decode is the one thing Node cannot do alone, so it borrows the browser that is
 * already here for the harnesses.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGET_TRIS = Number(process.env.HEAD_TRIS || 3000);
const OUT = path.join(__dirname, 'heads.gen.js');

/* ---------- glTF ---------- */
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
  if (!stride || stride === sz * n) {
    const src = new Ctor(bin.buffer, bin.byteOffset + start, a.count * n);
    out.set(src);
  } else {
    for (let e = 0; e < a.count; e++) {
      const src = new Ctor(bin.buffer, bin.byteOffset + start + e * stride, n);
      for (let k = 0; k < n; k++) out[e * n + k] = src[k];
    }
  }
  return out;
}

/* ---------- vertex clustering ---------- */
function cluster(P, C, IDX, res) {
  let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
  for (let i = 0; i < P.length; i += 3) {
    if (P[i] < mnx) mnx = P[i]; if (P[i] > mxx) mxx = P[i];
    if (P[i + 1] < mny) mny = P[i + 1]; if (P[i + 1] > mxy) mxy = P[i + 1];
    if (P[i + 2] < mnz) mnz = P[i + 2]; if (P[i + 2] > mxz) mxz = P[i + 2];
  }
  const span = Math.max(mxx - mnx, mxy - mny, mxz - mnz) || 1;
  const cell = span / res;
  const key = new Int32Array(P.length / 3);
  const map = new Map();
  const acc = [];
  for (let v = 0; v < P.length / 3; v++) {
    const ix = Math.floor((P[v * 3] - mnx) / cell), iy = Math.floor((P[v * 3 + 1] - mny) / cell), iz = Math.floor((P[v * 3 + 2] - mnz) / cell);
    const k = (ix * 4093 + iy) * 4093 + iz;
    let id = map.get(k);
    if (id === undefined) { id = acc.length; map.set(k, id); acc.push([0, 0, 0, 0, 0, 0, 0]); }
    key[v] = id;
    const a = acc[id];
    a[0] += P[v * 3]; a[1] += P[v * 3 + 1]; a[2] += P[v * 3 + 2];
    a[3] += C[v * 3]; a[4] += C[v * 3 + 1]; a[5] += C[v * 3 + 2]; a[6]++;
  }
  const OP = new Float32Array(acc.length * 3), OC = new Float32Array(acc.length * 3);
  for (let i = 0; i < acc.length; i++) {
    const a = acc[i], n = a[6];
    OP[i * 3] = a[0] / n; OP[i * 3 + 1] = a[1] / n; OP[i * 3 + 2] = a[2] / n;
    OC[i * 3] = a[3] / n; OC[i * 3 + 1] = a[4] / n; OC[i * 3 + 2] = a[5] / n;
  }
  const seen = new Set(), tris = [];
  for (let t = 0; t < IDX.length; t += 3) {
    const a = key[IDX[t]], b = key[IDX[t + 1]], c = key[IDX[t + 2]];
    if (a === b || b === c || a === c) continue;              /* collapsed to a line */
    const s = [a, b, c].slice().sort((x, y) => x - y).join(',');
    if (seen.has(s)) continue;                                 /* the same face twice */
    seen.add(s);
    tris.push(a, b, c);
  }
  return { P: OP, C: OC, I: tris };
}

/* smooth normals, area-weighted — the standard, and it is what keeps a decimated organic
   surface from reading as a bag of shards */
function normals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
  }
  return N;
}

const b64 = (buf) => Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('base64');

/* sRGB -> LINEAR, and the reason it is not optional.
 * `renderer.outputEncoding` is sRGB and this three build treats a material's colour as
 * linear, so an albedo byte handed straight through is displayed about two stops brighter
 * than it was painted. The first bake did exactly that and produced three heads the colour
 * of paper: every feature was still in the mesh and none of it was visible, because skin,
 * lips, brows and hair had all been lifted past white together.
 * `EXPOSURE` is the one dial left after that — the tone mapper is running at 0.80 and the
 * sky is bright, so a little more headroom on top of the transfer keeps the midtones off
 * the ceiling. */
const EXPOSURE = Number(process.env.HEAD_EXPOSURE || 0.82);
function s2l(byte) {
  const s = byte / 255;
  const lin = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  return Math.min(1, lin * EXPOSURE);
}

(async () => {
  const jobs = process.argv.slice(2).map(a => {
    const i = a.indexOf('=');
    if (i < 0) throw new Error('expected key=path, got ' + a);
    return { key: a.slice(0, i), file: a.slice(i + 1) };
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

    /* the base-colour image, decoded by the browser because Node cannot */
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
        /* half size is plenty: it is being averaged down to a few thousand vertices */
        const w = Math.min(1024, bmp.width), h = Math.min(1024, bmp.height);
        const cv = new OffscreenCanvas(w, h), cx = cv.getContext('2d');
        cx.drawImage(bmp, 0, 0, w, h);
        const d = cx.getImageData(0, 0, w, h).data;
        return { w, h, px: Array.from(d) };
      }, { b64: bytes.toString('base64'), mime: img.mimeType || 'image/png' });
    }
    const C0 = new Float32Array(P0.length);
    if (tex) {
      const { w, h, px } = tex;
      for (let v = 0; v < P0.length / 3; v++) {
        let u = UV[v * 2], t = UV[v * 2 + 1];
        u = u - Math.floor(u); t = t - Math.floor(t);
        const x = Math.min(w - 1, Math.max(0, Math.round(u * (w - 1))));
        const y = Math.min(h - 1, Math.max(0, Math.round(t * (h - 1))));
        const o = (y * w + x) * 4;
        C0[v * 3] = s2l(px[o]); C0[v * 3 + 1] = s2l(px[o + 1]); C0[v * 3 + 2] = s2l(px[o + 2]);
      }
    } else {
      const f = (mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor) || [0.8, 0.75, 0.7];
      for (let v = 0; v < P0.length / 3; v++) { C0[v * 3] = f[0]; C0[v * 3 + 1] = f[1]; C0[v * 3 + 2] = f[2]; }
    }

    /* binary-search the grid until the triangle count lands on the budget */
    let lo = 8, hi = 220, best = null;
    for (let it = 0; it < 12; it++) {
      const mid = Math.round((lo + hi) / 2);
      const r = cluster(P0, C0, IDX, mid);
      const n = r.I.length / 3;
      if (!best || Math.abs(n - TARGET_TRIS) < Math.abs(best.I.length / 3 - TARGET_TRIS)) best = r;
      if (n > TARGET_TRIS) hi = mid - 1; else lo = mid + 1;
      if (lo > hi) break;
    }
    const R = best;

    /* centre it, and make the longest axis exactly 1 */
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < R.P.length; i += 3) for (let k = 0; k < 3; k++) {
      if (R.P[i + k] < mn[k]) mn[k] = R.P[i + k];
      if (R.P[i + k] > mx[k]) mx[k] = R.P[i + k];
    }
    const span = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
    for (let i = 0; i < R.P.length; i += 3) for (let k = 0; k < 3; k++)
      R.P[i + k] = (R.P[i + k] - (mn[k] + mx[k]) / 2) / span;

    const N = normals(R.P, R.I);
    const nv = R.P.length / 3, nt = R.I.length / 3;
    const qp = new Int16Array(nv * 3), qn = new Int8Array(nv * 3), qc = new Uint8Array(nv * 3);
    for (let i = 0; i < nv * 3; i++) {
      qp[i] = Math.max(-32767, Math.min(32767, Math.round(R.P[i] * 32767)));
      qn[i] = Math.max(-127, Math.min(127, Math.round(N[i] * 127)));
      qc[i] = Math.max(0, Math.min(255, Math.round(R.C[i] * 255)));
    }
    const wide = nv > 65535;
    const qi = wide ? new Uint32Array(R.I) : new Uint16Array(R.I);
    const rec = `  ${job.key}: {v:${nv}, w:${wide ? 1 : 0}, p:'${b64(qp)}', n:'${b64(qn)}', c:'${b64(qc)}', i:'${b64(qi)}'},`;
    out.push(rec);
    const kb = Math.round(rec.length / 1024);
    let sum = 0, hot = 0;
    for (let i = 0; i < qc.length; i++) { sum += qc[i]; if (qc[i] > 245) hot++; }
    console.log(`  ${job.key.padEnd(9)} ${String(IDX.length / 3).padStart(6)} tris in  ->  ${String(nt).padStart(5)} tris, ${String(nv).padStart(5)} verts,  ${kb} KB` +
      `   mean colour ${Math.round(sum / qc.length)}/255, ${(100 * hot / qc.length).toFixed(1)}% at the ceiling`);
  }
  await b.close();

  fs.writeFileSync(OUT, '/* generated by tools/bakehead.js — do not hand-edit */\nconst HEADP = {\n' + out.join('\n') + '\n};\n');
  console.log('\nwrote ' + path.relative(process.cwd(), OUT) + ' — ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB');
})();
