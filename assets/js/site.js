import { calcFee, parseAmount } from './fee.js';

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

/* ---------- reveal once, never leave content hidden ---------- */
const targets = $$('[data-reveal], .process__diagram');
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

/* ---------- videos play only while on screen, never under reduced motion ---------- */
const videos = $$('video');
if (!reduced && 'IntersectionObserver' in window) {
  const vio = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause();
  }, { threshold: 0.2 });
  videos.forEach((v) => vio.observe(v));
}

/* ---------- fee calculator ---------- */
const text = $('#aum-text');
const range = $('#aum-range');
const out = $('#fee-out');
const detail = $('#fee-detail');
const partsEl = $('#fee-parts');
const rows = $$('.schedule tbody tr');
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const pct = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
// slider runs on a log scale, $10K to $50M, so every tier gets room
const MIN = 4, SPAN = Math.log10(50e6) - 4;
const toAum = (t) => { const v = 10 ** (MIN + (t / 1000) * SPAN); const p = 10 ** (Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };
const toT = (aum) => Math.round(Math.min(1, Math.max(0, (Math.log10(Math.max(aum, 1e4)) - MIN) / SPAN)) * 1000);

function render(aum) {
  const r = calcFee(aum);
  out.textContent = money(r.fee);
  detail.textContent = aum > 0
    ? `${pct.format((r.fee / aum) * 100)}% effective · ${money(r.fee / 12)} a month · ${money(r.fee / 4)} a quarter`
    : 'Enter a portfolio value to see the fee.';
  partsEl.replaceChildren(...r.parts.map((p) => {
    const li = document.createElement('li');
    for (const t of [p.label, p.rate, money(p.fee)]) { const s = document.createElement('span'); s.textContent = t; li.append(s); }
    return li;
  }));
  const active = r.structure === 'flat' ? [6]
    : r.structure === 'marginal' ? r.parts.map((_, i) => 3 + i)
    : r.structure === 'breakpoint' ? [aum >= 500e3 ? 2 : aum >= 250e3 ? 1 : 0] : [];
  rows.forEach((row, i) => row.classList.toggle('is-active', active.includes(i)));
}

text.addEventListener('input', () => {
  const v = parseAmount(text.value);
  const ok = !Number.isNaN(v) && v >= 0;
  text.setAttribute('aria-invalid', String(!ok && text.value.trim() !== ''));
  if (ok) { render(v); range.value = toT(v); }
});
text.addEventListener('blur', () => {
  const v = parseAmount(text.value);
  if (!Number.isNaN(v)) text.value = money(v);
});
range.addEventListener('input', () => {
  const v = toAum(Number(range.value));
  text.value = money(v);
  text.removeAttribute('aria-invalid');
  render(v);
});
const start = parseAmount(text.value);
range.value = toT(start);
render(start);

/* ---------- question cards: one open at a time ---------- */
const heads = $$('.card__head');
function openCard(btn) {
  for (const h of heads) {
    const on = h === btn;
    h.setAttribute('aria-expanded', String(on));
    document.getElementById(h.getAttribute('aria-controls')).hidden = !on;
  }
}
heads.forEach((h) => h.addEventListener('click', () => {
  if (h.getAttribute('aria-expanded') === 'true') return;
  openCard(h);
}));
openCard(heads[0]);

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
