// The interaction layer. Every piece is additive: without it (or with reduced motion) the page is complete.
import Lenis from '../vendor/lenis/lenis.mjs';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const head = document.querySelector('.site-head');
const headH = () => head.offsetHeight;

/* ---------- smooth scroll (desktop wheel only; touch keeps native scrolling) ---------- */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.getAttribute('href').length < 2) return;
  const target = document.querySelector(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  const offset = target.id === 'top' ? 0 : -headH();
  if (lenis) lenis.scrollTo(target, { offset, duration: 1.2 });
  else scrollTo({ top: target.getBoundingClientRect().top + scrollY + offset });
  history.replaceState(null, '', a.getAttribute('href'));
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
});

/* ---------- header: solid once the page moves, hides going down, returns going up ---------- */
let lastY = scrollY;
addEventListener('scroll', () => {
  const y = scrollY;
  head.classList.toggle('is-solid', y > 24);
  const menuOpen = document.querySelector('.site-nav.is-open');
  head.classList.toggle('is-hidden', !menuOpen && y > innerHeight * 0.6 && y > lastY + 2);
  if (y < lastY - 2) head.classList.remove('is-hidden');
  lastY = y;
}, { passive: true });
head.addEventListener('focusin', () => head.classList.remove('is-hidden'));

if (!reduced) {
  /* ---------- section headings rise line by line, then return to plain text ---------- */
  const lineIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      lineIO.unobserve(e.target);
      e.target.classList.add('is-in');
      setTimeout(() => { e.target.innerHTML = e.target.dataset.html; e.target.classList.remove('lines', 'is-in'); }, 1600);
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  // measured once the real fonts are in, so the lines break where they will rest
  document.fonts.ready.then(() => { for (const h of $$('main h2.head, .coupon__title')) {
    const text = h.textContent.trim();
    h.dataset.html = h.innerHTML;
    h.innerHTML = text.split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' ');
    const lines = [];
    for (const w of h.querySelectorAll('.w')) {
      const top = w.offsetTop;
      if (!lines.length || Math.abs(lines[lines.length - 1].top - top) > 4) lines.push({ top, words: [] });
      lines[lines.length - 1].words.push(w.textContent);
    }
    h.innerHTML = lines.map((l, i) => `<span class="line"><span data-line style="--i:${i}">${l.words.join(' ')}</span></span>`).join('');
    h.classList.add('lines');
    h.removeAttribute('data-reveal');
    lineIO.observe(h);
  } });

  /* ---------- the statement lights up word by word as it crosses the screen ---------- */
  const st = document.querySelector('.intro__statement');
  if (st) {
    st.removeAttribute('data-reveal');
    const walk = document.createTreeWalker(st, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) if (walk.currentNode.textContent.trim()) nodes.push(walk.currentNode);
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of n.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.append(part); continue; }
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = part;
        frag.append(s);
      }
      n.replaceWith(frag);
    }
    const units = $$('.w, .thumb', st);
    st.classList.add('is-scrubbed');
    const paint = () => {
      const r = st.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.88 - r.top) / (innerHeight * 0.88 - innerHeight * 0.5 + r.height * 0.5)));
      const lit = p * units.length;
      units.forEach((u, i) => u.style.setProperty('--lit', Math.min(1, Math.max(0, lit - i)).toFixed(3)));
    };
    addEventListener('scroll', paint, { passive: true });
    addEventListener('resize', paint);
    paint();
  }

  /* ---------- footer wordmark builds up block by block ---------- */
  const mark = document.querySelector('.mark');
  if (mark) {
    mark.classList.add('is-waiting');
    new IntersectionObserver(([e], io) => { if (e.isIntersecting) { mark.classList.remove('is-waiting'); io.disconnect(); } }, { threshold: 0.3 }).observe(mark);
  }
}

if (fine && !reduced) {
  /* ---------- buttons lean toward the pointer ---------- */
  for (const b of $$('.button, .coupon__submit')) {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / r.width, dy = (e.clientY - r.top - r.height / 2) / r.height;
      b.style.translate = `${(dx * 10).toFixed(1)}px ${(dy * 8).toFixed(1)}px`;
    });
    b.addEventListener('pointerleave', () => { b.style.translate = ''; });
  }

  /* ---------- nav labels roll on hover ---------- */
  for (const a of $$('.site-nav .link')) {
    const label = a.childNodes[0].textContent;
    a.childNodes[0].replaceWith(Object.assign(document.createElement('span'), { className: 'roll', innerHTML: `<span>${label}</span><span aria-hidden="true">${label}</span>` }));
  }

  /* ---------- a square glass loupe over the 1904 glassware ---------- */
  const loupe = document.createElement('div');
  loupe.className = 'loupe';
  loupe.setAttribute('aria-hidden', 'true');
  document.body.append(loupe);
  const Z = 2.4, SIZE = 168;
  for (const tile of $$('.specimen__tile:not(.tile--photo)')) {
    const img = tile.querySelector('img');
    tile.addEventListener('pointerenter', () => {
      loupe.innerHTML = '';
      const clone = img.cloneNode();
      clone.removeAttribute('loading');
      loupe.append(clone);
      loupe.style.background = getComputedStyle(tile).backgroundColor;
      loupe.dataset.tone = tile.classList.contains('tile--ink') ? 'ink' : 'light';
      loupe.classList.add('is-on');
    });
    tile.addEventListener('pointerleave', () => loupe.classList.remove('is-on'));
    tile.addEventListener('pointermove', (e) => {
      const r = img.getBoundingClientRect(), c = loupe.firstChild;
      loupe.style.transform = `translate(${e.clientX - SIZE / 2}px, ${e.clientY - SIZE / 2}px)`;
      c.style.width = `${r.width * Z}px`;
      c.style.height = `${r.height * Z}px`;
      c.style.transform = `translate(${SIZE / 2 - (e.clientX - r.left) * Z}px, ${SIZE / 2 - (e.clientY - r.top) * Z}px)`;
    });
  }
}
