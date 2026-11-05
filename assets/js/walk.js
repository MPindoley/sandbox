// The walk: scrolling plays a film from the street, up into the tower and out to the view.
// Frames are drawn to a canvas and blended with their neighbour, so motion stays smooth between frames
// and while later frames are still arriving. Without the script the first frame stands as a still.
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
  const SCENES = [0, 63, 117, 155, 203]; // first frame of each scene, in COUNT frames
  const STILLS = [20, 92, 140, 182, 240]; // the frame each scene settles on under reduced motion
  const BEAT_FRAMES = [0, 92, 140, 182, COUNT - 1]; // where each line sits in the film
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  let urls = [], frames = [], scale = 1, anchors = [], top = 0, span = 1, raf = 0, pos = -1, shown = false;

  // ---------- loading: a coarse pass first so the whole walk works at once, then the gaps ----------
  let queue = [], inflight = 0, generation = 0;
  const pump = () => {
    const gen = generation;
    while (inflight < 6 && queue.length) {
      const i = queue.shift();
      if (frames[i]) continue;
      inflight++;
      const img = new Image();
      img.decoding = 'async';
      img.src = urls[i];
      img.decode().then(() => { if (gen === generation) { frames[i] = img; pos = -1; paint(); } }, () => {})
        .finally(() => { inflight--; if (gen === generation) pump(); });
    }
  };
  const load = () => {
    generation++; inflight = 0;
    const set = portrait.matches ? 'p' : 'd';
    // the single-file build carries its own (thinned) frames
    urls = window.__walk?.[set] ?? Array.from({ length: COUNT }, (_, i) => `${sec.dataset.base}/${set}/${String(i).padStart(3, '0')}.webp`);
    scale = (urls.length - 1) / (COUNT - 1);
    frames = new Array(urls.length).fill(null);
    const want = new Set();
    if (reduced) STILLS.forEach((f) => want.add(Math.round(f * scale)));
    else for (const step of saveData ? [16, 8] : [16, 8, 4, 2, 1]) for (let i = 0; i < urls.length; i += step) want.add(i);
    want.add(urls.length - 1);
    queue = [...want];
    pos = -1;
    pump();
  };

  // ---------- layout: where the stage scrolls and where each line meets its frame ----------
  const measure = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; pos = -1; }
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

  // ---------- drawing: the nearest loaded frame on each side, mixed by distance ----------
  const cover = (img, alpha) => {
    const cw = canvas.width, ch = canvas.height, k = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  };
  const draw = (f) => {
    let at = f * scale;
    if (reduced) { // one still per scene, no motion between them
      const s = SCENES.findLastIndex((start) => f >= start);
      at = Math.round(STILLS[s] * scale);
    }
    let a = Math.floor(at), b = Math.ceil(at);
    while (a > 0 && !frames[a]) a--;
    while (b < frames.length - 1 && !frames[b]) b++;
    if (!frames[a]) a = b;
    if (!frames[b]) b = a;
    if (!frames[a]) return; // nothing yet: the poster stays
    const t = b > a ? clamp01((at - a) / (b - a)) : 0;
    cover(frames[a], 1);
    if (t > 0.002) cover(frames[b], t);
    if (!shown) { shown = true; sec.classList.add('is-film'); }
  };

  // ---------- each scroll: the film and the lines ----------
  const paint = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const frame = () => {
    raf = 0;
    const p = clamp01((scrollY - top) / span);
    if (scrollY > top + span + innerHeight) return; // the walk is behind us
    const f = frameAt(p);
    if (Math.abs(f - pos) > 0.01 || !shown) { draw(f); pos = f; }
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
  load();
  frame();
  addEventListener('scroll', paint, { passive: true });
  addEventListener('resize', () => { measure(); pos = -1; paint(); });
  portrait.addEventListener('change', () => { load(); measure(); paint(); });
  document.fonts?.ready.then(() => { measure(); paint(); });
}
