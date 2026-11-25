// ടീച്ചർ.Chumi — loader, page transitions, scroll story, landing motion, router
import { TEMPLATES } from './templates.js';
import { DEFAULTS } from './book-engine.js';
import { drawThumb } from './thumbs.js';
import { initInstall } from './install.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* ---------- loader ---------- */
function splitLetters() {
  $$('[data-split]').forEach(el => {
    const t = el.textContent;
    el.textContent = '';
    [...t].forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.animationDelay = `${0.4 + i * 0.07}s`;
      el.appendChild(s);
    });
  });
}

async function runLoader() {
  const beads = $$('#loaderBeads i'), count = $('#loaderCount'), loader = $('#loader');
  splitLetters();
  let shown = 0;
  const start = performance.now();
  let done = false;
  Promise.all([
    new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true }))),
    Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(2500)]),
  ]).then(() => { done = true; });
  setTimeout(() => { done = true; }, 8000); // never keep people waiting on a slow network
  await new Promise(resolve => {
    const tick = () => {
      const t = performance.now() - start;
      const target = done ? 100 : Math.min(90, 15 + t / 28);
      shown = Math.min(target, shown + (target - shown) * 0.1 + (done ? 1.5 : 0.2));
      count.textContent = Math.round(shown);
      beads.forEach((b, i) => b.classList.toggle('on', shown >= (i + 1) * 10 - 0.5));
      if (done && shown >= 99.5 && t > (reduce ? 150 : 1400)) { count.textContent = '100'; resolve(); }
      else requestAnimationFrame(tick);
    };
    tick();
  });
  loader.classList.add('is-done');
  document.body.classList.remove('is-loading');
  await wait(reduce ? 0 : 300);
  document.body.classList.add('is-ready');
  setTimeout(() => loader.isConnected && loader.remove(), 1200);
}

/* ---------- transitions + router ---------- */
let current = 'home';
let studio = null;
async function getStudio() {
  if (!studio) studio = await import('./studio.js');
  return studio;
}

function parseHash() {
  const h = location.hash || '';
  if (!h.startsWith('#/')) return { view: 'home', params: new URLSearchParams() };
  const [path, q] = h.slice(2).split('?');
  return { view: path === 'studio' ? 'studio' : 'home', params: new URLSearchParams(q || '') };
}

let lastClick = null;
async function wipe(swap) {
  const w = $('#wipe');
  if (reduce) { await swap(); return; }
  w.style.setProperty('--x', lastClick ? lastClick[0] + 'px' : '50%');
  w.style.setProperty('--y', lastClick ? lastClick[1] + 'px' : '50%');
  lastClick = null;
  w.classList.remove('is-out'); void w.offsetWidth;
  w.classList.add('is-in');
  await wait(620);
  await swap();
  await wait(120);
  w.classList.remove('is-in'); void w.offsetWidth;
  w.classList.add('is-out');
  await wait(600);
  w.classList.remove('is-out');
}

async function route(first = false) {
  const { view, params } = parseHash();
  if (view === current && !first) {
    if (view === 'studio') (await getStudio()).enterStudio(params);
    return;
  }
  const show = async () => {
    $$('.view').forEach(v => {
      const on = v.dataset.view === view;
      v.hidden = !on; v.classList.toggle('is-active', on);
      v.classList.remove('is-entering');
      if (on && !first) { void v.offsetWidth; v.classList.add('is-entering'); }
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.title = view === 'studio' ? 'Studio · ടീച്ചർ.Chumi' : 'ടീച്ചർ.Chumi — Excel to kids\' PDF books';
    if (view === 'studio') (await getStudio()).enterStudio(params);
    else requestAnimationFrame(onScroll);
  };
  current = view;
  if (first) await show(); else await wipe(show);
}

function goLinks() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    lastClick = [e.clientX, e.clientY];
    const href = a.getAttribute('href') || (a.dataset.go === 'studio' ? '#/studio' : '#/');
    if (a.hasAttribute('data-confetti')) confetti(a);
    if (location.hash === href) route(); else location.hash = href;
  });
  window.addEventListener('hashchange', () => route());
}

/* ---------- fun bits ---------- */
const COLORS = ['#EC6A73', '#F0A04B', '#5DB8A5', '#5B8FE0', '#9273CF', '#F6C24C'];
export function confetti(el) {
  if (reduce || !el) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 32; i++) {
    const d = document.createElement('i');
    d.className = 'confetti';
    d.style.background = COLORS[i % COLORS.length];
    d.style.left = r.left + r.width / 2 + 'px';
    d.style.top = r.top + r.height / 2 + 'px';
    document.body.appendChild(d);
    const a = Math.random() * Math.PI * 2, v = 110 + Math.random() * 200;
    d.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v - 110}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${Math.cos(a) * v * 1.2}px, ${Math.sin(a) * v + 150}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => d.remove();
  }
}

function buttons() {
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn');
    if (!b || b.disabled || reduce) return;
    const r = b.getBoundingClientRect();
    const s = document.createElement('span');
    const size = Math.max(r.width, r.height);
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  });
  if (reduce || !matchMedia('(hover: hover)').matches) return;
  $$('.magnetic').forEach(b => {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.15}px ${(e.clientY - r.top - r.height / 2) * 0.22}px`;
    });
    b.addEventListener('pointerleave', () => { b.style.translate = ''; });
  });
  const art = $('.hero__art');
  $('.hero').addEventListener('pointermove', (e) => {
    const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    $$('[data-depth]', art).forEach(el => { el.style.translate = `${x * 18 * el.dataset.depth}px ${y * 14 * el.dataset.depth}px`; });
  });
}

/* ---------- reveal on scroll ---------- */
function reveals() {
  $$('[data-stagger]').forEach(group => {
    $$('[data-reveal]', group).forEach((el, i) => el.style.setProperty('--d', `${(i % 3) * 0.1 + Math.floor(i / 3) * 0.08}s`));
  });
  if (!('IntersectionObserver' in window)) { $$('[data-reveal]').forEach(el => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
  $$('[data-reveal]').forEach(el => io.observe(el));
}

/* ---------- scroll story + marquee (one rAF-throttled handler) ---------- */
const story = $('.story');
const steps = $$('.story__steps li');
const marquee = $('#marquee'), row = $('#marqueeRow');
let ticking = false;
function onScroll() {
  ticking = false;
  if (current !== 'home') return;
  if (story && !reduce) {
    const r = story.getBoundingClientRect();
    const p = clamp01(-r.top / Math.max(1, r.height - innerHeight));
    // four stages: sheet drops in, cells tidy up, design appears, book done
    const seg = (a, b) => clamp01((p - a) / (b - a));
    const s0 = seg(0, 0.12), s1 = seg(0.18, 0.42), s2 = seg(0.48, 0.68), s3 = seg(0.76, 0.92);
    story.style.setProperty('--s0', s0.toFixed(3));
    story.style.setProperty('--s1', s1.toFixed(3));
    story.style.setProperty('--s2', s2.toFixed(3));
    story.style.setProperty('--s3', s3.toFixed(3));
    const active = p < 0.18 ? 0 : p < 0.48 ? 1 : p < 0.76 ? 2 : 3;
    steps.forEach((li, i) => li.classList.toggle('is-on', i === active));
  }
  if (marquee && row && !reduce) {
    const offset = (innerHeight - marquee.getBoundingClientRect().top) * 0.35;
    row.style.transform = `translate3d(calc(-33.333% + ${offset}px), 0, 0)`;
  }
}
function scrollMotion() {
  if (reduce) { steps.forEach(li => li.classList.add('is-on')); return; }
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } };
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', req);
  onScroll();
}

function nav() {
  const n = $('#nav');
  const on = () => n.classList.toggle('is-stuck', scrollY > 10);
  addEventListener('scroll', on, { passive: true }); on();
}

/* ---------- designs marquee: real template previews ---------- */
function designs() {
  const card = (t, hidden) => `
    <button class="tpl-card" type="button" data-tpl="${t.id}" ${hidden ? 'tabindex="-1" aria-hidden="true"' : `aria-label="Start a book with the ${t.name} design"`}>
      <span class="tpl-card__page"><img alt="" data-img="${t.id}"></span>
      <span class="tpl-card__name">${t.name}</span>
    </button>`;
  row.innerHTML = [0, 1, 2].map(k => TEMPLATES.map(t => card(t, k !== 1)).join('')).join('');
  row.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tpl]');
    if (!b) return;
    lastClick = [e.clientX, e.clientY];
    location.hash = `#/studio?template=${b.dataset.tpl}`;
  });
  const io = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    io.disconnect();
    const ready = () => window.PDFLib ? Promise.resolve() : new Promise(r => addEventListener('load', r, { once: true }));
    ready().then(async () => {
      for (const t of TEMPLATES) {
        const cv = document.createElement('canvas');
        await drawThumb(cv, t.id, { ...DEFAULTS }, 'cover', 190);
        if (!cv.dataset.ok) continue;
        const url = cv.toDataURL('image/jpeg', 0.86);
        $$(`img[data-img="${t.id}"]`, row).forEach(img => { img.src = url; img.classList.add('is-ok'); });
      }
    });
  }, { rootMargin: '400px' });
  io.observe(marquee);
}

/* ---------- start ---------- */
initInstall((msg) => getStudio().then(m => m.toast(msg)));
nav();
designs();
reveals();
buttons();
scrollMotion();
goLinks();
route(true);
runLoader();
