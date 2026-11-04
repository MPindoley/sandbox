// The interaction layer. Every piece is additive: without it (or with reduced motion) the page is complete.
import Lenis from '../vendor/lenis/lenis.mjs';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const head = $('.site-head');

/* ---------- smooth scroll (wheel only; touch keeps native scrolling) ---------- */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.09 });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.getAttribute('href').length < 2) return;
  const target = document.querySelector(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  const offset = target.id === 'top' ? 0 : -head.offsetHeight;
  if (lenis) lenis.scrollTo(target, { offset, duration: 1.4 });
  else scrollTo({ top: target.getBoundingClientRect().top + scrollY + offset });
  history.replaceState(null, '', a.getAttribute('href'));
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
});

/* ---------- header: solid once past the photograph, hides going down, returns going up ---------- */
const photo = $('.hero__photo');
let lastY = scrollY;
const onHeader = () => {
  const y = scrollY;
  head.classList.toggle('is-solid', y > photo.offsetHeight - head.offsetHeight);
  const menuOpen = $('.site-nav.is-open');
  if (!menuOpen && y > innerHeight * 0.8 && y > lastY + 2) head.classList.add('is-hidden');
  if (y < lastY - 2 || menuOpen) head.classList.remove('is-hidden');
  lastY = y;
};
addEventListener('scroll', onHeader, { passive: true });
onHeader();
head.addEventListener('focusin', () => head.classList.remove('is-hidden'));

if (!reduced) {
  /* ---------- scroll-linked: the name settles as the first screen leaves; the footer name arrives ---------- */
  const name = $('.hero__name');
  const mark = $('.foot__mark');
  const paintScroll = () => {
    const h = innerHeight;
    name.style.setProperty('--name-scale', (1 - 0.06 * clamp01(scrollY / h)).toFixed(4));
    const r = mark.getBoundingClientRect();
    mark.style.setProperty('--mark-scale', (0.94 + 0.06 * clamp01((h - r.top) / (h * 0.6))).toFixed(4));
  };
  addEventListener('scroll', paintScroll, { passive: true });
  paintScroll();

  /* ---------- the held sentence lights word by word while the rooms pass ---------- */
  const st = $('.intro__statement');
  const track = $('.intro__track');
  if (st) {
    const walk = document.createTreeWalker(st, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) if (walk.currentNode.textContent.trim()) nodes.push(walk.currentNode);
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of n.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.append(part); continue; }
        frag.append(Object.assign(document.createElement('span'), { className: 'w', textContent: part }));
      }
      n.replaceWith(frag);
    }
    const words = $$('.w', st);
    st.classList.add('is-scrubbed');
    const paint = () => {
      const r = track.getBoundingClientRect();
      const p = clamp01((innerHeight * 0.65 - r.top) / Math.max(1, r.height * 0.55));
      const lit = p * words.length;
      words.forEach((w, i) => w.style.setProperty('--lit', clamp01(lit - i).toFixed(3)));
    };
    addEventListener('scroll', paint, { passive: true });
    addEventListener('resize', paint);
    paint();
  }

  /* ---------- section headings rise line by line, then return to plain text ---------- */
  const lineIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      lineIO.unobserve(e.target);
      e.target.classList.add('is-in');
      setTimeout(() => { e.target.innerHTML = e.target.dataset.html; e.target.classList.remove('lines', 'is-in'); }, 1800);
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  // measured once the real fonts are in, so the lines break where they will rest
  document.fonts.ready.then(() => {
    for (const h of $$('main h2')) {
      h.dataset.html = h.innerHTML;
      h.innerHTML = h.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' ');
      const lines = [];
      for (const w of h.querySelectorAll('.w')) {
        const top = w.offsetTop;
        if (!lines.length || Math.abs(lines[lines.length - 1].top - top) > 4) lines.push({ top, words: [] });
        lines[lines.length - 1].words.push(w.textContent);
      }
      h.innerHTML = lines.map((l, i) => `<span class="line"><span data-line style="--i:${i}">${l.words.join(' ')}</span></span>`).join('');
      h.classList.add('lines');
      lineIO.observe(h);
    }
  });
}

if (fine && !reduced) {
  /* ---------- buttons lean toward the pointer ---------- */
  for (const b of $$('.button')) {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / r.width, dy = (e.clientY - r.top - r.height / 2) / r.height;
      b.style.translate = `${(dx * 8).toFixed(1)}px ${(dy * 6).toFixed(1)}px`;
    });
    b.addEventListener('pointerleave', () => { b.style.translate = ''; });
  }

  /* ---------- nav labels roll on hover ---------- */
  for (const a of $$('.site-nav .link')) {
    const label = a.childNodes[0].textContent;
    a.childNodes[0].replaceWith(Object.assign(document.createElement('span'), { className: 'roll', innerHTML: `<span>${label}</span><span aria-hidden="true">${label}</span>` }));
  }
}
