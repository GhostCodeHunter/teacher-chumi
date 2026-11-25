// ടീച്ചർ.Chumi — loader, page transitions, landing animations, router
import { TEMPLATES } from './templates.js';
import { DEFAULTS } from './book-engine.js';
import { drawThumb } from './thumbs.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- loader ---------- */
function splitLetters() {
  $$('[data-split]').forEach(el => {
    const t = el.textContent;
    el.textContent = '';
    [...t].forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.animationDelay = `${0.45 + i * 0.07}s`;
      el.appendChild(s);
    });
  });
}

async function runLoader() {
  const bar = $('#loaderBar'), count = $('#loaderCount'), loader = $('#loader');
  splitLetters();
  let shown = 0, target = 0;
  const start = performance.now();
  const ready = Promise.all([
    new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true }))),
    Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(2500)]),
  ]);
  let done = false;
  ready.then(() => { done = true; });
  setTimeout(() => { done = true; }, 8000); // never keep people waiting on a slow network
  await new Promise(resolve => {
    const tick = () => {
      const t = performance.now() - start;
      target = done ? 100 : Math.min(92, 20 + t / 25);
      shown += (target - shown) * 0.12 + (done ? 1.2 : 0);
      shown = Math.min(shown, target);
      bar.style.width = shown + '%';
      count.textContent = Math.round(shown);
      if (done && shown >= 99.5 && t > (reduce ? 200 : 1500)) { count.textContent = '100'; bar.style.width = '100%'; resolve(); }
      else requestAnimationFrame(tick);
    };
    tick();
  });
  loader.classList.add('is-done');
  document.body.classList.remove('is-loading');
  await wait(reduce ? 0 : 350);
  document.body.classList.add('is-ready');
  loader.addEventListener('animationend', () => loader.remove(), { once: true });
  setTimeout(() => loader.isConnected && loader.remove(), 1500);
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

async function wipe(swap) {
  const w = $('#wipe');
  if (reduce) { await swap(); return; }
  w.classList.remove('is-out'); void w.offsetWidth;
  w.classList.add('is-in');
  await wait(680);
  await swap();
  w.classList.remove('is-in'); void w.offsetWidth;
  w.classList.add('is-out');
  await wait(750);
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
  };
  current = view;
  if (first) await show(); else await wipe(show);
}

function goLinks() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const href = a.getAttribute('href') || (a.dataset.go === 'studio' ? '#/studio' : '#/');
    if (a.hasAttribute('data-confetti')) confetti(a);
    if (location.hash === href) route(); else location.hash = href;
  });
  window.addEventListener('hashchange', () => route());
}

/* ---------- fun bits ---------- */
const COLORS = ['#FF6B6B', '#FFB703', '#06D6A0', '#4D96FF', '#9B5DE5'];
export function confetti(el) {
  if (reduce) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 36; i++) {
    const d = document.createElement('i');
    d.className = 'confetti';
    d.style.background = COLORS[i % COLORS.length];
    d.style.left = r.left + r.width / 2 + 'px';
    d.style.top = r.top + r.height / 2 + 'px';
    document.body.appendChild(d);
    const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
    d.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v - 120}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${Math.cos(a) * v * 1.2}px, ${Math.sin(a) * v + 160}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
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
      b.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.18}px ${(e.clientY - r.top - r.height / 2) * 0.25}px`;
    });
    b.addEventListener('pointerleave', () => { b.style.translate = ''; });
  });
  $$('.tilt').forEach(c => {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.style.transform = `perspective(700px) rotateX(${(0.5 - y) * 9}deg) rotateY(${(x - 0.5) * 11}deg) translateY(-6px)`;
      c.style.setProperty('--mx', x * 100 + '%'); c.style.setProperty('--my', y * 100 + '%');
    });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
  });
  const art = $('.hero__art');
  if (art) {
    $('.hero').addEventListener('pointermove', (e) => {
      const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
      $$('[data-depth]', art).forEach(el => { el.style.translate = `${x * 30 * el.dataset.depth}px ${y * 24 * el.dataset.depth}px`; });
      $$('.float', art).forEach((el, i) => { el.style.marginLeft = `${x * (10 + i * 6)}px`; el.style.marginTop = `${y * (10 + i * 5)}px`; });
    });
  }
}

function reveals() {
  const groups = new Map();
  $$('.reveal').forEach(el => {
    const p = el.parentElement;
    const i = groups.get(p) || 0; groups.set(p, i + 1);
    el.style.setProperty('--d', `${Math.min(i, 6) * 0.09}s`);
  });
  if (!('IntersectionObserver' in window)) { $$('.reveal').forEach(el => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal, .steps').forEach(el => io.observe(el));
  // hero shows straight after the loader
  const hero = () => $$('.hero .reveal').forEach(el => el.classList.add('is-in'));
  if (document.body.classList.contains('is-ready')) hero();
  else new MutationObserver((m, ob) => { if (document.body.classList.contains('is-ready')) { hero(); ob.disconnect(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function ticker() {
  const facts = ['2 + 3 = 5', '7 × 8 = 56', '12 − 4 = 8', '9 + 9 = 18', '6 × 7 = 42', '20 ÷ 4 = 5', '15 + 27 = 42', '100 − 1 = 99', '3 × 9 = 27', '1 + 1 = 2'];
  const html = facts.map(f => `<span>${f}</span>`).join('');
  $('#ticker').innerHTML = html + html;
}

function nav() {
  const n = $('#nav');
  const on = () => n.classList.toggle('is-stuck', scrollY > 10);
  addEventListener('scroll', on, { passive: true }); on();
}

function gallery() {
  const g = $('#tplGallery');
  g.innerHTML = TEMPLATES.map((t, i) => `
    <button class="tpl-card reveal" data-tpl="${t.id}" type="button" aria-label="Start a book with the ${t.name} template">
      <div class="tpl-card__page"><canvas width="10" height="14" aria-hidden="true"></canvas></div>
      <span class="tpl-card__name">${t.name}</span>
      <span class="tpl-card__note">${t.note}</span>
    </button>`).join('');
  g.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tpl]');
    if (b) location.hash = `#/studio?template=${b.dataset.tpl}`;
  });
  const io = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    io.disconnect();
    const libsReady = () => window.PDFLib ? Promise.resolve() : new Promise(r => addEventListener('load', r, { once: true }));
    libsReady().then(() => {
      $$('.tpl-card', g).forEach(card => {
        const cv = $('canvas', card);
        drawThumb(cv, card.dataset.tpl, { ...DEFAULTS }, 'cover', card.clientWidth || 180);
      });
    });
  }, { rootMargin: '300px' });
  io.observe(g);
}

/* ---------- start ---------- */
ticker();
nav();
gallery();
reveals();
buttons();
goLinks();
route(true);
runLoader();
