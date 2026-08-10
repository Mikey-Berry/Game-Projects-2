#!/usr/bin/env node
/* The save format: does it shrink, does it still round-trip, and does it still read the
 * saves people already have.
 *
 * Compression is the easiest thing in this whole codebase to get wrong in a way nobody
 * notices until it matters. A save that writes fine and cannot be read back is discovered
 * by somebody whose world is gone, and there is no recovering it after the fact — so every
 * path in and out gets driven here: the compressed one, the plain one a browser without
 * CompressionStream would write, and the old uncompressed saves that already exist.
 *
 *   node tools/save.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(async () => {
    const R = {};
    /* a world with something in it, so the numbers are not from an empty save */
    for (let i = 0; i < 200; i++) update(0.25);

    const snap = snapshot();
    const raw = JSON.stringify(snap);
    R.hasZip = HAS_ZIP ? 'the browser can compress' : '!! NO CompressionStream — falling back';

    /* --- 1. IT SHRINKS --- */
    const packed = await packSaveText(snap);
    const rawKB = Math.round(raw.length / 1024), packKB = Math.round(packed.length / 1024);
    R.size = packKB < rawKB / 8
      ? `${rawKB} KB of JSON packs to ${packKB} KB (${(raw.length / packed.length).toFixed(1)}x)`
      : `!! BARELY SHRANK: ${rawKB} KB to ${packKB} KB`;
    R.underBudget = packKB < 512 ? `${packKB} KB against a ~5 MB browser budget`
      : `!! STILL ${packKB} KB`;
    R.tagged = packed.startsWith('DWZ1:') ? 'packed saves are tagged' : '!! UNTAGGED PAYLOAD';

    /* --- 2. IT COMES BACK --- */
    const back = await unpackSaveText(packed);
    R.roundTrip = JSON.stringify(back) === raw ? 'byte-for-byte the same object'
      : '!! THE UNPACKED SAVE DIFFERS FROM THE ORIGINAL';

    /* and the game actually restores from it, which is a different question from the JSON
       matching — `restore` has to accept what `unpackSaveText` hands it */
    const wasDay = day, wasChars = chars.length;
    restore(back);
    R.restores = (day === wasDay && Math.abs(chars.length - wasChars) < 3)
      ? `restored day ${day} with ${chars.length} bodies` : '!! RESTORE FROM A PACKED SAVE FAILED';

    /* --- 3. THE SAVES PEOPLE ALREADY HAVE --- */
    const old = await unpackSaveText(raw);            /* plain JSON, exactly as it used to be */
    R.oldSaves = old && old.v === snap.v ? 'an uncompressed save still loads'
      : '!! OLD PLAIN-JSON SAVES NO LONGER LOAD';

    /* --- 4. A BROWSER THAT CANNOT COMPRESS --- */
    const realCS = window.CompressionStream;
    let plain;
    try {
      /* HAS_ZIP is read at load, so the fallback path is exercised by forcing the failure the
         same way an old Safari would: the constructor throws. */
      window.CompressionStream = function () { throw new Error('nope'); };
      plain = await packSaveText(snap);
    } finally { window.CompressionStream = realCS; }
    /* Compare against a FRESH stringify of the same object, not against `raw` captured at the
       top: `restore()` ran between them, and a snapshot shares some nested arrays with the
       live world, so the object this is holding is no longer what it was when `raw` was
       taken. The first version compared to the stale string and reported the fallback
       broken when the fallback was fine. */
    const nowRaw = JSON.stringify(snap);
    R.fallback = (plain === nowRaw) ? 'without CompressionStream it writes plain JSON'
      : '!! THE FALLBACK DOES NOT PRODUCE PLAIN JSON (' + plain.slice(0, 12) + ')';
    R.fallbackReads = JSON.stringify(await unpackSaveText(plain)) === nowRaw
      ? 'and that plain save reads back' : '!! THE FALLBACK SAVE CANNOT BE READ';
    R.snapshotAliases = (nowRaw === raw) ? 'a snapshot is inert once taken'
      : 'note: a snapshot shares nested arrays with the live world';

    /* --- 5. THE FILE PATH, which is bytes rather than a string --- */
    const gz = await gzipBytes(new TextEncoder().encode(nowRaw));
    R.fileMagic = (gz[0] === 0x1f && gz[1] === 0x8b) ? 'the file is real gzip' : '!! NOT GZIP';
    const fromGz = await unpackSaveFile(gz.buffer);
    R.fileRoundTrip = JSON.stringify(fromGz) === nowRaw ? 'a gzip file reads back'
      : '!! A GZIP SAVE FILE DOES NOT READ BACK';
    /* an old .json file, or one somebody renamed — recognised by its bytes, not its name */
    const fromPlain = await unpackSaveFile(new TextEncoder().encode(nowRaw).buffer);
    R.oldFiles = JSON.stringify(fromPlain) === nowRaw ? 'an old .json file still reads'
      : '!! OLD SAVE FILES NO LONGER LOAD';

    /* --- 6. THE AUTOSAVE MUST NOT TEAR ---
       A snapshot shares nested arrays with the live world (see above), and the autosave now
       packs asynchronously. If `packSaveText` ever serialises after an await, a save would be
       half one moment and half another. Prove it captures the world as it was: take a
       snapshot, start packing, move the world, and check what came out matches the state at
       the moment of the call rather than the state after it. */
    {
      const s2 = snapshot();
      const atCall = JSON.stringify(s2);
      const pending = packSaveText(s2);           /* not awaited yet — on purpose */
      for (let i = 0; i < 40; i++) update(0.25);  /* the world moves underneath it */
      const got = JSON.stringify(await unpackSaveText(await pending));
      R.noTearing = got === atCall ? 'the autosave captures one moment, not two'
        : '!! THE AUTOSAVE TORE — it serialised after the world moved';
    }

    /* --- 7. AND IT SURVIVES A REAL localStorage ROUND TRIP --- */
    try {
      localStorage.setItem('dustward_savetest', packed);
      const got = localStorage.getItem('dustward_savetest');
      localStorage.removeItem('dustward_savetest');
      R.throughStorage = JSON.stringify(await unpackSaveText(got)) === raw
        ? 'and through localStorage unchanged' : '!! MANGLED BY localStorage';
    } catch (e) { R.throughStorage = '!! localStorage REFUSED IT: ' + e.message; }
    return R;
  });

  console.log('=== THE SAVE ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(16) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'IT SHRINKS, IT COMES BACK, AND OLD SAVES STILL LOAD'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
