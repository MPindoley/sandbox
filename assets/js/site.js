const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- phone menu ---------- */
const toggle = $('.menu-toggle');
const nav = $('#site-nav');
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Close' : 'Menu';
  nav.classList.toggle('is-open', open);
});
nav.addEventListener('click', (e) => {
  if (e.target.closest('a') && nav.classList.contains('is-open')) toggle.click();
});

/* ---------- the name fills the measure exactly, on one line wherever it sits on one line ---------- */
const name = $('.hero__name');
const fitName = () => {
  name.style.fontSize = '';
  if (getComputedStyle(name).whiteSpace !== 'nowrap') return;
  name.style.setProperty('--name-scale', 1); // measure unscaled; the scroll effect repaints it
  const range = document.createRange();
  range.selectNodeContents(name.querySelector('[data-line]'));
  const text = range.getBoundingClientRect().width;
  if (text) name.style.fontSize = `${(parseFloat(getComputedStyle(name).fontSize) * name.clientWidth / text) * 0.998}px`;
};
document.fonts.ready.then(fitName);
addEventListener('resize', fitName);

/* ---------- reveal once, never leave content hidden ---------- */
const targets = $$('[data-reveal]');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  targets.forEach((el) => io.observe(el));
  addEventListener('load', () => setTimeout(() => targets.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in');
  }), 2500));
} else targets.forEach((el) => el.classList.add('is-in'));

/* ---------- the film loads and plays only while on screen, never under reduced motion ---------- */
if (!reduced && 'IntersectionObserver' in window) {
  const vio = new IntersectionObserver((entries) => {
    for (const { target: v, isIntersecting } of entries) {
      if (isIntersecting && !v.src && v.dataset.src) v.src = v.dataset.src;
      isIntersecting ? v.play().catch(() => {}) : v.pause();
    }
  }, { threshold: 0.2 });
  $$('video').forEach((v) => vio.observe(v));
}

/* ---------- services index: the description of whatever is pointed at or focused ---------- */
const desc = $('.index__desc');
if (desc) {
  const rest = desc.textContent;
  let timer;
  const show = (text, cap) => {
    $$('.cap.is-on').forEach((c) => c.classList.remove('is-on'));
    cap?.classList.add('is-on');
    if (desc.textContent === text) return;
    clearTimeout(timer);
    desc.classList.add('is-swapping');
    timer = setTimeout(() => { desc.textContent = text; desc.classList.remove('is-swapping'); }, reduced ? 0 : 160);
  };
  for (const cap of $$('.cap')) {
    // the description is also the button's accessible description, so it is heard as well as seen
    const id = `d-${Math.random().toString(36).slice(2, 8)}`;
    cap.insertAdjacentHTML('afterend', `<span class="sr-only" id="${id}">${cap.dataset.desc}</span>`);
    cap.setAttribute('aria-describedby', id);
    cap.addEventListener('pointerenter', () => show(cap.dataset.desc, cap));
    cap.addEventListener('focus', () => show(cap.dataset.desc, cap));
    cap.addEventListener('click', () => show(cap.dataset.desc, cap));
  }
  $('.index').addEventListener('pointerleave', () => show(rest));
}

/* ---------- approach: buttons, progress and drag for the row of moments ---------- */
const row = $('.moments');
if (row) {
  const fill = $('.approach__fill');
  const [prev, next] = $$('.approach__btn');
  const step = () => row.querySelector('.moment').getBoundingClientRect().width + parseFloat(getComputedStyle(row).columnGap || 0);
  const update = () => {
    const max = row.scrollWidth - row.clientWidth;
    const p = max > 0 ? row.scrollLeft / max : 1;
    const seen = row.clientWidth / row.scrollWidth; // the bar starts at the share already in view
    fill.style.setProperty('--p', (seen + p * (1 - seen)).toFixed(3));
    prev.disabled = row.scrollLeft < 4;
    next.disabled = row.scrollLeft > max - 4;
  };
  for (const b of [prev, next]) b.addEventListener('click', () => row.scrollBy({ left: Number(b.dataset.dir) * step(), behavior: reduced ? 'auto' : 'smooth' }));
  row.addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();

  // drag with a mouse; touch and trackpads scroll natively
  let down = null;
  row.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = { x: e.clientX, left: row.scrollLeft, moved: false }; });
  addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 4) { down.moved = true; row.classList.add('is-dragging'); }
    row.scrollLeft = down.left - dx;
  });
  addEventListener('pointerup', () => { down = null; row.classList.remove('is-dragging'); });
}

/* ---------- consultation request opens an email with the visitor's answers ---------- */
const form = $('#contact-form');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const d = new FormData(form);
  const subject = `Consultation request: ${d.get('topic')}`;
  const body = [
    `Name: ${d.get('name')}`,
    `Email: ${d.get('email')}`,
    d.get('phone') ? `Phone: ${d.get('phone')}` : '',
    `I'd like to talk about: ${d.get('topic')}`,
  ].filter(Boolean).join('\n');
  location.href = `mailto:Matthew.Pindoley@osaicwealth.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
