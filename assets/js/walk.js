// The walk: scrolling plays a film from the street, up into the tower and out to the view.
// The frames come in a few packs: a small coarse one with every 16th frame, so the whole walk works at once,
// then chunks of 32 frames in a row, fetched nearest the visitor first. Only the frames around the current
// position are decoded, off the main thread, so drawing never waits on a decode. Each frame is blended with
// its neighbour and the film position glides toward the scroll, so the motion is continuous.
// Without the script the first frame stands as a still.
const sec = document.querySelector('.walk');

if (sec) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData === true;
  const portrait = matchMedia('(max-aspect-ratio: 4/5)');
  const canvas = sec.querySelector('.walk__film');
  const ctx = canvas.getContext('2d', { alpha: false });
  const beats = [...sec.querySelectorAll('.beat')];
  const sweep = sec.querySelector('.sweep');
  const COUNT = Number(sec.dataset.frames);
  const COARSE = 16, CHUNK = 32; // as written by scripts/walk-frames.sh
  const SCENES = [0, 125, 242, 292, 364]; // where each scene starts
  const STILLS = [48, 176, 272, 304, 432]; // the frame each scene settles on under reduced motion (all coarse)
  const BEAT_FRAMES = [0, 181, 268, 311, COUNT - 1]; // where each line sits in the film
  const NEAR = 30; // decoded frames kept around the visitor; the coarse frames stay decoded as the fallback
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const range = (a, b, step = 1) => Array.from({ length: Math.max(0, Math.ceil((b - a) / step)) }, (_, i) => a + i * step);

  let blobs = [], bitmaps = new Map(), decoding = new Set(), chunks = [], inflight = 0, gen = 0;
  let anchors = [], top = 0, span = 1, raf = 0, last = 0, cur = 0, target = 0, dir = 1, vel = 0, drawn = -1, shown = false;
  const kept = (i) => i % COARSE === 0;

  // ---------- fetching: the coarse pack, then the chunk nearest the visitor (a little ahead), two at a time ----------
  const split = (buf, frames) => { // a pack is WebP files laid end to end, each stating its own length
    const v = new DataView(buf);
    for (let o = 0, j = 0; o + 8 <= buf.byteLength && j < frames.length; j++) {
      const len = v.getUint32(o + 4, true) + 8;
      blobs[frames[j]] = new Blob([buf.slice(o, o + len)], { type: 'image/webp' });
      o += len;
    }
  };
  const get = (pack) => {
    const g = gen;
    inflight++;
    fetch(pack.url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((buf) => {
      if (g !== gen || !buf) return;
      split(buf, pack.frames);
      decodeNear();
    }).catch(() => {}).finally(() => { if (g === gen) { inflight--; fetchMore(); } });
  };
  const fetchMore = () => {
    while (inflight < 2 && chunks.length) {
      const c = cur + dir * CHUNK / 2;
      let best = 0;
      chunks.forEach((p, k) => { if (Math.abs(p.mid - c) < Math.abs(chunks[best].mid - c)) best = k; });
      get(chunks.splice(best, 1)[0]);
    }
  };

  // ---------- decoding: off the main thread, around the visitor, the rest released ----------
  const decode = (i) => {
    const g = gen;
    decoding.add(i);
    createImageBitmap(blobs[i]).then((bmp) => {
      decoding.delete(i);
      if (g !== gen) { bmp.close(); return; }
      bitmaps.set(i, bmp);
      release();
      drawn = -1; paint(); decodeNear();
    }, () => decoding.delete(i));
  };
  // ahead in the scroll direction, spaced by the current speed: at speed the film lands on every few frames,
  // so those are the ones to have ready
  const decodeNear = () => {
    const c = Math.round(cur), stride = Math.max(1, Math.round(Math.abs(vel)));
    const want = (i) => i >= 0 && i < COUNT && blobs[i] && !bitmaps.has(i) && !decoding.has(i) && decoding.size < 4;
    if (reduced) { for (const i of STILLS) if (want(i)) decode(i); return; }
    for (let d = 0; d <= 14 && decoding.size < 4; d++) {
      const ahead = c + dir * d * stride, behind = c - dir * d;
      if (want(ahead)) decode(ahead);
      if (d <= 4 && want(behind)) decode(behind);
    }
    for (let i = 0; i < COUNT && decoding.size < 4; i += COARSE) if (want(i)) decode(i);
  };
  const release = () => {
    const near = [...bitmaps.keys()].filter((i) => !kept(i)).sort((a, b) => Math.abs(b - cur) - Math.abs(a - cur));
    for (const i of near.slice(0, Math.max(0, near.length - NEAR))) { bitmaps.get(i).close(); bitmaps.delete(i); }
  };

  const load = () => {
    gen++; inflight = 0;
    for (const b of bitmaps.values()) b.close();
    bitmaps = new Map(); decoding = new Set(); blobs = new Array(COUNT).fill(null);
    const set = portrait.matches ? 'p' : 'd', base = `${sec.dataset.base}/${set}`;
    // the single-file build carries its own packs, thinned to every second frame
    const packs = window.__walk?.[set] ?? [
      { url: `${base}/coarse.bin`, frames: range(0, COUNT, COARSE) },
      ...range(0, Math.ceil(COUNT / CHUNK)).map((c) => ({
        url: `${base}/chunk-${String(c).padStart(2, '0')}.bin`, frames: range(c * CHUNK, Math.min(COUNT, (c + 1) * CHUNK)).filter((i) => !kept(i)),
      })),
    ];
    chunks = reduced || saveData ? [] : packs.slice(1).map((p) => ({ ...p, mid: (p.frames[0] + p.frames[p.frames.length - 1]) / 2 }));
    drawn = -1;
    get(packs[0]); // the coarse pack first: the whole walk, at once
    fetchMore();
  };

  // ---------- layout: where the stage scrolls and where each line meets its frame ----------
  const measure = () => {
    top = sec.getBoundingClientRect().top + scrollY;
    span = Math.max(1, sec.offsetHeight - innerHeight);
    // the film passes each line's frame as that line is centred on screen
    anchors = beats.map((b, i) => [clamp01((b.offsetTop + b.offsetHeight / 2 - innerHeight / 2) / span), BEAT_FRAMES[i]]);
    anchors[0] = [0, 0];
    anchors[anchors.length - 1] = [1, COUNT - 1];
  };
  const frameAt = (p) => {
    for (let i = 1; i < anchors.length; i++) {
      const [p0, f0] = anchors[i - 1], [p1, f1] = anchors[i];
      if (p <= p1) return f0 + (f1 - f0) * clamp01((p - p0) / Math.max(1e-6, p1 - p0));
    }
    return COUNT - 1;
  };

  // ---------- drawing: the nearest decoded frame on each side, mixed by distance ----------
  const draw = (f) => {
    const at = reduced ? STILLS[SCENES.findLastIndex((s) => f >= s)] : f; // reduced motion: one still per scene
    let a = -1, b = -1;
    for (const i of bitmaps.keys()) {
      if (i <= at && i > a) a = i;
      if (i >= at && (b < 0 || i < b)) b = i;
    }
    if (a < 0) a = b;
    if (b < 0) b = a;
    if (a < 0) return; // nothing decoded yet: the poster stays
    const A = bitmaps.get(a), B = bitmaps.get(b);
    // the canvas keeps the frames' own size; the page scales it to cover the screen
    if (canvas.width !== A.width || canvas.height !== A.height) { canvas.width = A.width; canvas.height = A.height; }
    const t = b > a ? clamp01((at - a) / (b - a)) : 0;
    ctx.globalAlpha = 1;
    ctx.drawImage(A, 0, 0, canvas.width, canvas.height);
    if (t > 0.002) { ctx.globalAlpha = t; ctx.drawImage(B, 0, 0, canvas.width, canvas.height); }
    if (!shown) { shown = true; sec.classList.add('is-film'); }
  };

  // ---------- each frame: the film glides toward the scroll; the lines follow the scroll itself ----------
  const paint = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const frame = (now = performance.now()) => {
    raf = 0;
    const dt = Math.min(64, now - (last || now)); last = now;
    if (scrollY > top + span + innerHeight) { last = 0; return; } // the walk is behind us
    const p = clamp01((scrollY - top) / span);
    target = frameAt(p);
    const step = target - cur, was = cur;
    if (Math.abs(step) > 0.05) dir = Math.sign(step);
    cur = reduced || Math.abs(step) < 0.02 ? target : cur + step * (1 - Math.pow(0.7, dt / 16.7));
    vel = vel * 0.75 + (cur - was) * 0.25; // frames per paint
    if (Math.abs(cur - drawn) > 0.005) { draw(cur); drawn = cur; decodeNear(); }
    if (cur !== target) paint(); else last = 0;

    sec.style.setProperty('--p', p.toFixed(4));
    sec.classList.toggle('is-moving', p > 0.01);
    // a line fades in as it rises into place and out as it leaves; the first is already there
    const vh = innerHeight;
    beats.forEach((b, i) => {
      const r = b.getBoundingClientRect();
      const q = -r.top / Math.max(1, r.height - vh); // 0 when it settles, 1 when it starts to leave
      const fadeIn = i === 0 ? 1 : clamp01((q + 0.42) / 0.36);
      const fadeOut = i === beats.length - 1 ? 1 : clamp01((1.32 - q) / 0.3);
      b.firstElementChild.style.opacity = Math.min(fadeIn, fadeOut).toFixed(3);
      if (b.contains(sweep)) sweep.style.setProperty('--s', clamp01((q + 0.25) / 0.5).toFixed(3));
    });
  };

  measure();
  cur = target = frameAt(clamp01((scrollY - top) / span));
  load();
  frame();
  addEventListener('scroll', paint, { passive: true });
  addEventListener('resize', () => { measure(); drawn = -1; paint(); });
  portrait.addEventListener('change', () => { load(); measure(); paint(); });
  document.fonts?.ready.then(() => { measure(); paint(); });
}
