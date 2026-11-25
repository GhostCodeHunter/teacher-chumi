// ടീച്ചർ.Chumi — studio (settings, Excel upload, live PDF preview, download)
import { readFile } from './xlsx-reader.js';
import { buildBook, DEFAULTS, prepareImage } from './book-engine.js';
import { TEMPLATES } from './templates.js';
import { openPdf, renderPage, cancelRender, closePdf } from './pdfview.js';
import { drawThumb } from './thumbs.js';
import { sampleBook } from './sample.js';
import { PICTURES, allDesigns, designName, designOptionsHtml, loadPictures } from './designs.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const KEY = 'teacherChumi.settings.v4';

const state = {
  book: null, fileName: '', images: [], pageDesigns: {},
  settings: loadSettings(),
  bytes: null, pdf: null, meta: null,
  busy: false, pending: false, timer: 0, token: 0,
  zoom: 1, inited: false,
};

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const out = { ...DEFAULTS };
      for (const k of Object.keys(DEFAULTS)) if (k in raw && typeof raw[k] === typeof DEFAULTS[k] || (k in raw && (DEFAULTS[k] === null || k === 'baseSize' || k === 'decimals'))) out[k] = raw[k];
      out.wmImageId = null; // your own pictures are not stored between visits
      const known = (id) => id === 'none' || allDesigns([]).some(d => d.id === id);
      if (!known(out.design)) out.design = 'none';
      if (out.coverDesign !== 'same' && !known(out.coverDesign)) out.coverDesign = 'same';
      return out;
    }
  } catch { /* storage blocked */ }
  return { ...DEFAULTS };
}
function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(state.settings)); } catch { /* ignore */ }
}

/* ---------- toast + status ---------- */
let toastT = 0;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('is-on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2800);
}
function setStatus(kind, text) {
  const s = $('#status');
  s.className = 'status' + (kind ? ' is-' + kind : '');
  s.textContent = text || '';
}

/* ---------- settings form ---------- */
function bindForm() {
  $$('[data-k]').forEach(el => {
    const k = el.dataset.k;
    const ev = el.type === 'range' || el.type === 'text' || el.type === 'number' || el.type === 'color' ? 'input' : 'change';
    el.addEventListener(ev, () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'radio') { if (!el.checked) return; v = el.value; }
      else if (el.type === 'range' || el.type === 'number') v = el.value === '' ? DEFAULTS[k] : +el.value;
      else v = el.value;
      state.settings[k] = v;
      saveSettings();
      syncDependents();
      if (k === 'accent' || k === 'accent2' || k === 'ink' || k === 'tableStyle' || k === 'textFont' || k === 'numFont' || k === 'numBold') refreshThumbsSoon();
      schedule(el.type === 'text' || el.type === 'range' || el.type === 'color' ? 600 : 250);
    });
  });
}

function fillForm() {
  const s = state.settings;
  $$('[data-k]').forEach(el => {
    const v = s[el.dataset.k];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'radio') el.checked = String(v) === el.value;
    else el.value = v == null ? '' : v;
  });
  syncDependents();
}

function syncDependents() {
  const s = state.settings;
  $('#customSize').hidden = s.pageSize !== 'Custom';
  $('#modeHint').textContent = s.contentMode === 'exact'
    ? 'Every row, column, blank cell and number stays as in your Excel. Only margins, fonts and alignment are arranged.'
    : 'Chumi also removes empty rows/columns, makes titles and gives numbers the same decimals.';
  $$('.tidy-only').forEach(el => { el.hidden = s.contentMode === 'exact'; });
  $('#customMargin').hidden = s.margin !== 'custom';
  $('.wm-text').hidden = s.wmType !== 'text';
  $('.wm-image').hidden = s.wmType !== 'image';
  for (const k of ['bgOpacity', 'wmOpacity', 'wmScale', 'wmAngle']) {
    const o = $('#o-' + k); if (!o) continue;
    const v = +s[k];
    o.textContent = k === 'wmAngle' ? `${v}°` : k === 'wmScale' ? `${v}%` : `${Math.round(v * 100)}%`;
  }
  $$('.tpl-opt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.design === s.design)));
  renderImages();
}

function accordions() {
  $$('.group').forEach((g, i) => {
    const head = $('.group__head', g);
    if (i === 0) { g.classList.add('is-open'); head.setAttribute('aria-expanded', 'true'); }
    head.addEventListener('click', () => {
      const open = !g.classList.contains('is-open');
      g.classList.toggle('is-open', open);
      head.setAttribute('aria-expanded', String(open));
    });
  });
}

/* ---------- templates + colours ---------- */
const SWATCHES = [
  ['Orange', '#F0A04B', '#5DB8A5'], ['Coral', '#EC6A73', '#5B8FE0'], ['Mint', '#5DB8A5', '#F0A04B'],
  ['Sky', '#5B8FE0', '#F6C24C'], ['Grape', '#9273CF', '#EC6A73'], ['Calm', '#C9A27E', '#7A9E9F'],
];
function renderDesignPick() {
  const pick = $('#designPick');
  pick.innerHTML = allDesigns(state.images).map(d => {
    const art = d.id === 'none' ? '<span class="tpl-none" aria-hidden="true"></span>'
      : d.tpl ? '<canvas width="10" height="14" aria-hidden="true"></canvas>'
      : `<img src="${escapeHtml(d.thumb)}" alt="" loading="lazy">`;
    const name = d.id === 'none' ? 'Plain' : d.name;
    return `<button type="button" class="tpl-opt" role="radio" data-design="${escapeHtml(d.id)}"${d.tpl ? ` data-tpl="${d.tpl}"` : ''} aria-checked="${d.id === state.settings.design}" title="${escapeHtml(d.note || d.name)}">${art}<span>${escapeHtml(name)}</span></button>`;
  }).join('');
  refreshThumbs();
}
function renderDesignSelects() {
  const sel = $('#s-coverDesign');
  const v = state.settings.coverDesign;
  sel.innerHTML = `<option value="same">Same as the book</option>` + designOptionsHtml(state.images, v);
  sel.value = v;
}
function buildPickers() {
  const pick = $('#designPick');
  renderDesignPick();
  renderDesignSelects();
  pick.addEventListener('click', (e) => {
    const b = e.target.closest('.tpl-opt'); if (!b) return;
    state.settings.design = b.dataset.design; saveSettings(); syncDependents(); schedule(50);
  });
  pick.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const opts = $$('.tpl-opt', pick);
    let i = opts.findIndex(o => o.dataset.design === state.settings.design);
    i = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
    opts[i].focus(); opts[i].click(); e.preventDefault();
  });
  const sw = $('#swatches');
  sw.innerHTML = SWATCHES.map(([n, a, b]) => `<button type="button" class="swatch" data-a="${a}" data-b="${b}" title="${n} colours" aria-label="${n} colours"><i style="background:${a}"></i><i style="background:${b}"></i></button>`).join('');
  sw.addEventListener('click', (e) => {
    const b = e.target.closest('.swatch'); if (!b) return;
    state.settings.accent = b.dataset.a; state.settings.accent2 = b.dataset.b;
    saveSettings(); fillForm(); refreshThumbsSoon(); schedule(50);
  });
}
let thumbT = 0;
function refreshThumbsSoon() { clearTimeout(thumbT); thumbT = setTimeout(refreshThumbs, 900); }
function refreshThumbs() {
  $$('.tpl-opt[data-tpl]').forEach(b => drawThumb($('canvas', b), 'tpl:' + b.dataset.tpl, state.settings, 'content', b.clientWidth || 100));
}

/* ---------- pictures ---------- */
async function addImages(files, role) {
  for (const f of files) {
    try {
      const img = await prepareImage(f);
      const id = 'img:u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const name = f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My design';
      state.images.push({ ...img, id, role, name });
      if (role === 'bg') { state.settings.design = id; toast('Design added and used for the whole book. Change single pages in the preview.'); }
      else { state.settings.wmImageId = id; state.settings.wmType = 'image'; }
    } catch (e) { toast(e.message || 'That picture could not be used.'); }
  }
  renderDesignPick(); renderDesignSelects(); renderChapters(); fillForm(); schedule(50);
}
function renderImages() {
  for (const role of ['bg', 'wm']) {
    const list = $(role === 'bg' ? '#bgList' : '#wmList');
    const sel = role === 'bg' ? state.settings.design : state.settings.wmImageId;
    const imgs = state.images.filter(i => i.role === role);
    const key = imgs.map(i => i.id).join(',') + '|' + sel;
    if (list.dataset.key === key) continue;
    list.dataset.key = key;
    list.innerHTML = imgs.map(i => `
      <div class="img-item">
        <button type="button" class="img-pick" data-id="${i.id}" aria-pressed="${i.id === sel}" aria-label="Use ${escapeHtml(i.name)}"><img src="${i.url}" alt=""></button>
        <button type="button" class="rm" data-rm="${i.id}" aria-label="Remove ${escapeHtml(i.name)}"><svg class="ico" aria-hidden="true"><use href="#i-x"/></svg></button>
      </div>`).join('');
  }
}
function imageListEvents(list, role) {
  const act = (e) => {
    const rm = e.target.closest('[data-rm]');
    const k = role === 'bg' ? 'design' : 'wmImageId';
    if (rm) {
      const id = rm.dataset.rm;
      const img = state.images.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.url);
      state.images = state.images.filter(i => i.id !== id);
      if (role === 'bg') forgetDesign(id);
      else if (state.settings.wmImageId === id) state.settings.wmImageId = null;
      e.stopPropagation(); renderDesignPick(); renderDesignSelects(); renderChapters(); fillForm(); schedule(50); return;
    }
    const item = e.target.closest('.img-pick'); if (!item) return;
    state.settings[k] = state.settings[k] === item.dataset.id ? (role === 'bg' ? 'none' : null) : item.dataset.id;
    if (role === 'wm' && state.settings[k]) state.settings.wmType = 'image';
    fillForm(); schedule(50);
  };
  list.addEventListener('click', act);
}

// a removed design must not stay in use anywhere
function forgetDesign(id) {
  const s = state.settings;
  if (s.design === id) s.design = 'none';
  if (s.coverDesign === id) s.coverDesign = 'same';
  if (state.book) state.book.chapters.forEach(c => { if (c.design === id) c.design = 'book'; });
  for (const k of Object.keys(state.pageDesigns)) if (state.pageDesigns[k] === id) delete state.pageDesigns[k];
  saveSettings();
}

function clearBook() {
  state.token++;
  clearTimeout(state.timer);
  state.book = null; state.fileName = ''; state.pageDesigns = {};
  state.bytes = null; state.meta = null;
  if (state.pdf) { const old = state.pdf; state.pdf = null; setTimeout(() => closePdf(old), 0); }
  if (io) io.disconnect();
  if (infoIo) infoIo.disconnect();
  $('#pages').innerHTML = '';
  $('#reportList').innerHTML = '';
  $('#chapterList').innerHTML = '';
  $('#fileChip').hidden = true; $('#clearBtn').hidden = true; $('#clearBtn2').hidden = true;
  $('#downloadBtn').disabled = true;
  hideError();
  setStatus('', '');
  $('#viewer').hidden = true;
  $('#empty').hidden = false;
  $('#emptyError').hidden = true;
  setTab('preview');
  toast('Book cleared. Drop a new Excel file to start again.');
}
function askClear() {
  const d = $('#clearDialog');
  d.returnValue = '';
  if (d.showModal) d.showModal(); else if (window.confirm('Clear this book?')) clearBook();
}

/* ---------- file loading ---------- */
function prettyTitle(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()).slice(0, 80);
}

async function loadFile(file) {
  if (!file) return;
  if (file.size > 60 * 1024 * 1024) { showError('This file is bigger than 60 MB. Please split it into smaller files.'); return; }
  setStatus('busy', 'Reading Excel…');
  try {
    const wb = await readFile(file);
    setBook(wb, file.name);
    if (state.settings.title === DEFAULTS.title || !state.settings.title) { state.settings.title = prettyTitle(file.name) || DEFAULTS.title; fillForm(); saveSettings(); }
    toast(`Loaded ${wb.sheets.length} sheet${wb.sheets.length > 1 ? 's' : ''}`);
  } catch (e) {
    console.error(e);
    setStatus('', '');
    const msg = e.message || 'This file could not be read.';
    if (state.book) { showViewer(); showError(msg); }
    else { const b = $('#emptyError'); b.textContent = msg; b.hidden = false; toast('That file could not be opened'); }
  }
}

function setBook(wb, name) {
  $('#emptyError').hidden = true;
  state.book = { sheets: wb.sheets, chapters: wb.sheets.map((sh, i) => ({ sheet: i, title: sh.name, include: true, design: 'book' })) };
  state.pageDesigns = {};
  state.fileName = name;
  $('#fileChip').hidden = false;
  $('#clearBtn').hidden = false; $('#clearBtn2').hidden = false;
  $('#fileName').textContent = name;
  renderChapters();
  showViewer();
  schedule(0);
}

function loadSample() {
  setBook(sampleBook(), 'Sample maths book');
  if (state.settings.title === DEFAULTS.title || !state.settings.title) {
    state.settings.subtitle = state.settings.subtitle || DEFAULTS.subtitle;
  }
  toast('Sample book loaded. Upload your own Excel any time.');
}

function showViewer() {
  $('#empty').hidden = true;
  $('#viewer').hidden = false;
  $('#view-studio').classList.add('tab-preview');
  setTab('preview');
}
function setTab(tab) {
  $('#view-studio').classList.toggle('tab-preview', tab === 'preview');
  $$('.mobile-tabs button').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
}

function renderChapters() {
  const list = $('#chapterList');
  if (!state.book) { list.innerHTML = ''; return; }
  const chs = state.book.chapters;
  list.innerHTML = chs.map((c, i) => {
    const sh = state.book.sheets[c.sheet];
    const rows = (sh.rows || []).filter(r => r && r.some(Boolean)).length;
    const cols = (sh.rows || []).reduce((a, r) => Math.max(a, r ? r.length : 0), 0);
    return `<div class="chapter${c.include ? '' : ' is-off'}" data-i="${i}">
      <input type="checkbox" ${c.include ? 'checked' : ''} aria-label="Include ${escapeHtml(c.title)}" data-act="inc">
      <input type="text" value="${escapeHtml(c.title)}" aria-label="Chapter title" data-act="title" maxlength="100">
      <button class="icon-btn" type="button" data-act="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-up"/></svg></button>
      <button class="icon-btn" type="button" data-act="down" aria-label="Move down" ${i === chs.length - 1 ? 'disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-down"/></svg></button>
      <span class="chapter__meta">${rows} row${rows === 1 ? '' : 's'} · ${cols} column${cols === 1 ? '' : 's'}${rows ? '' : ' · empty'}</span>
      <label class="chapter__design"><span>Design</span><select data-act="design" aria-label="Design for ${escapeHtml(c.title)}">${designOptionsHtml(state.images, c.design && c.design !== 'book' ? c.design : '', 'Same as the book')}</select></label>
    </div>`;
  }).join('');
}

function chapterEvents() {
  const list = $('#chapterList');
  list.addEventListener('input', (e) => {
    const row = e.target.closest('.chapter'); if (!row) return;
    const c = state.book.chapters[+row.dataset.i];
    if (e.target.dataset.act === 'title') { c.title = e.target.value; schedule(700); }
  });
  list.addEventListener('change', (e) => {
    const row = e.target.closest('.chapter'); if (!row) return;
    const c = state.book.chapters[+row.dataset.i];
    if (e.target.dataset.act === 'inc') { c.include = e.target.checked; row.classList.toggle('is-off', !c.include); schedule(100); }
    if (e.target.dataset.act === 'design') { c.design = e.target.value || 'book'; schedule(100); }
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const i = +b.closest('.chapter').dataset.i;
    const chs = state.book.chapters;
    const j = b.dataset.act === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= chs.length) return;
    [chs[i], chs[j]] = [chs[j], chs[i]];
    renderChapters();
    const again = $(`.chapter[data-i="${j}"] [data-act="${b.dataset.act}"]`, list) || $(`.chapter[data-i="${j}"] input[type=text]`, list);
    again && again.focus();
    schedule(100);
  });
}

function dropZone(el, onFiles) {
  ['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'dragleave' && el.contains(e.relatedTarget)) return; el.classList.remove('is-over'); }));
  el.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) onFiles(f); });
}

/* ---------- build + preview ---------- */
function schedule(ms = 300) {
  if (!state.book) return;
  clearTimeout(state.timer);
  $('#pages').classList.add('is-stale');
  state.timer = setTimeout(run, ms);
}

let fontsOk = null;
function fontsReady() {
  if (!fontsOk) {
    fontsOk = Promise.race([
      Promise.all(['500 20px "Baloo Chettan 2"', '700 20px "Baloo Chettan 2"'].map(f => document.fonts.load(f, 'ടീച്ചർ'))).catch(() => {}),
      new Promise(r => setTimeout(r, 2500)),
    ]);
  }
  return fontsOk;
}

async function run() {
  if (state.busy) { state.pending = true; return; }
  state.busy = true; state.pending = false;
  const my = ++state.token;
  setStatus('busy', 'Arranging pages…');
  $('#downloadBtn').disabled = true;
  hideError();
  try {
    await fontsReady();
    const s = { ...state.settings, pageDesigns: { ...state.pageDesigns } };
    const used = new Set([s.design, s.coverDesign, ...Object.values(s.pageDesigns), ...state.book.chapters.map(c => c.design)]);
    const pictures = await loadPictures(used);
    const res = await buildBook(state.book, s, [...pictures, ...state.images]);
    if (my !== state.token || !state.book) return; // book was cleared meanwhile
    state.bytes = res.bytes;
    state.meta = res;
    showReport(res.report);
    await showPdf(res.bytes, res);
    setStatus('ok', `${res.pages} page${res.pages > 1 ? 's' : ''} ready`);
    $('#downloadBtn').disabled = false;
  } catch (e) {
    if (my !== state.token || !state.book) return;
    console.error(e);
    setStatus('', 'Needs a fix');
    showError(e.message || 'Something went wrong while making the book.');
  } finally {
    state.busy = false;
    $('#pages').classList.remove('is-stale');
    if (state.pending && state.book) run();
  }
}

function showError(msg) { const b = $('#errorBox'); b.textContent = msg; b.hidden = false; }
function hideError() { $('#errorBox').hidden = true; }

const ICON = { fix: 'i-wand', ok: 'i-check', info: 'i-info', warn: 'i-warn' };
function showReport(items) {
  const fixes = items.filter(i => i.k === 'fix').length;
  $('#reportTitle').textContent = fixes ? `Auto-check: ${fixes} thing${fixes > 1 ? 's' : ''} tidied for you` : 'Auto-check: all pages look good';
  $('#reportList').innerHTML = items.map(i => `<li class="k-${i.k}"><svg class="ico" aria-hidden="true"><use href="#${ICON[i.k] || 'i-info'}"/></svg><span>${escapeHtml(i.t)}</span></li>`).join('');
}

let io = null, infoIo = null;
async function showPdf(bytes, res) {
  const pagesEl = $('#pages');
  let pdf;
  try { pdf = await openPdf(bytes); }
  catch (e) {
    console.warn('pdf.js failed, using built-in viewer', e);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    pagesEl.innerHTML = `<iframe class="pdf-frame" title="Book preview" src="${url}"></iframe>`;
    pagesEl.style.padding = '0';
    return;
  }
  const old = state.pdf;
  state.pdf = pdf;
  const scrollRatio = pagesEl.scrollHeight ? pagesEl.scrollTop / pagesEl.scrollHeight : 0;
  if (io) io.disconnect();
  if (infoIo) infoIo.disconnect();
  $$('canvas', pagesEl).forEach(cancelRender);

  const meta = res.pagesMeta || [];
  const labels = meta.map(m => m.label);
  const sizes = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const v = p.getViewport({ scale: 1 });
    sizes.push([v.width, v.height]);
  }
  const frag = document.createDocumentFragment();
  sizes.forEach(([w, h], i) => {
    const box = document.createElement('div');
    box.className = 'pagebox';
    box.dataset.n = i + 1;
    box.dataset.w = w; box.dataset.h = h;
    box.style.animationDelay = `${Math.min(i, 6) * 0.05}s`;
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', `${labels[i]} of ${sizes.length}`);
    const m = meta[i] || { key: String(i + 1), label: `Page ${i + 1}`, design: 'none', own: false };
    const inherit = 'Auto';
    box.innerHTML = `<canvas></canvas>
      <div class="pagebox__bar">
        <span class="pagebox__n">${escapeHtml(m.label)}</span>
        <label class="page-design${m.own ? ' is-own' : ''}"><svg class="ico" aria-hidden="true"><use href="#i-palette"/></svg><span class="vh">Design for ${escapeHtml(m.label)}</span>
          <select data-page="${escapeHtml(m.key)}">${designOptionsHtml(state.images, m.own ? m.design : '', inherit + ' (' + designName(m.design, state.images) + ')')}</select>
        </label>
      </div>`;
    frag.appendChild(box);
  });
  pagesEl.innerHTML = '';
  pagesEl.style.padding = '';
  pagesEl.appendChild(frag);
  layoutBoxes();
  pagesEl.scrollTop = scrollRatio * pagesEl.scrollHeight;
  if (old) setTimeout(() => closePdf(old), 0);

  io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) drawBox(en.target); else freeBox(en.target); });
  }, { root: pagesEl, rootMargin: '1200px 0px' });
  $$('.pagebox', pagesEl).forEach(b => io.observe(b));

  const visible = new Map();
  infoIo = new IntersectionObserver((entries) => {
    entries.forEach(en => visible.set(+en.target.dataset.n, en.intersectionRatio));
    let best = 1, r = -1;
    visible.forEach((v, k) => { if (v > r) { r = v; best = k; } });
    $('#pageInfo').textContent = `${labels[best - 1]} · ${best} of ${sizes.length}`;
  }, { root: pagesEl, threshold: [0, 0.25, 0.5, 0.75, 1] });
  $$('.pagebox', pagesEl).forEach(b => infoIo.observe(b));
  $('#pageInfo').textContent = `${sizes.length} page${sizes.length > 1 ? 's' : ''}`;
}

function pageDesignEvents() {
  $('#pages').addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-page]');
    if (!sel) return;
    const key = sel.dataset.page;
    if (sel.value) state.pageDesigns[key] = sel.value; else delete state.pageDesigns[key];
    toast(sel.value ? `${key === 'cover' ? 'Cover' : key === 'toc' ? 'Contents' : 'Page ' + key}: ${designName(sel.value, state.images)}` : 'Back to the chapter / book design');
    schedule(50);
  });
}

function fitWidth() {
  const pagesEl = $('#pages');
  return Math.max(200, Math.min(pagesEl.clientWidth - 32, 860));
}
function layoutBoxes() {
  const base = fitWidth();
  const maxW = Math.max(...$$('.pagebox').map(b => +b.dataset.w), 1);
  $$('.pagebox').forEach(b => {
    const w = base * state.zoom * (+b.dataset.w / maxW);
    b.style.width = w + 'px';
    b.style.height = (w * +b.dataset.h / +b.dataset.w) + 'px';
  });
  $('#zoomFit').textContent = state.zoom === 1 ? 'Fit' : Math.round(state.zoom * 100) + '%';
}
async function drawBox(box) {
  const want = Math.round(parseFloat(box.style.width));
  if (box.dataset.drawn === String(want) || box.dataset.drawing) return;
  box.dataset.drawing = '1';
  const pdf = state.pdf;
  const cv = $('canvas', box);
  try {
    await renderPage(pdf, +box.dataset.n, cv, want);
    if (pdf === state.pdf) { box.dataset.drawn = String(want); box.classList.add('is-drawn'); }
  } catch (e) {
    if (e && e.name !== 'RenderingCancelledException') console.warn(e);
  } finally { delete box.dataset.drawing; }
}
function freeBox(box) {
  const cv = $('canvas', box);
  if (!cv || box.dataset.drawing) return;
  cancelRender(cv);
  cv.width = 0; cv.height = 0;
  delete box.dataset.drawn;
  box.classList.remove('is-drawn');
}
function rezoom(z) {
  state.zoom = Math.max(0.4, Math.min(3, z));
  layoutBoxes();
  $$('.pagebox').forEach(b => {
    const r = b.getBoundingClientRect();
    const root = $('#pages').getBoundingClientRect();
    if (r.bottom > root.top - 1300 && r.top < root.bottom + 1300) drawBox(b);
  });
}

/* ---------- download ---------- */
function safeName(t) {
  return (t || 'book').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'book';
}
function openConfirm() {
  if (!state.bytes) return;
  const s = state.settings;
  const size = s.pageSize === 'Custom' ? `${s.customW} × ${s.customH} mm` : s.pageSize;
  const own = Object.keys(state.pageDesigns).length;
  $('#confirmText').textContent = `${state.meta.pages} pages · ${size} · ${designName(s.design, state.images)}${own ? ` + ${own} page design${own > 1 ? 's' : ''}` : ''} · ${(state.bytes.length / 1024 / 1024).toFixed(1)} MB`;
  $('#confirmCheck').checked = false;
  $('#confirmGo').disabled = true;
  const d = $('#confirm');
  d.returnValue = '';
  if (typeof d.showModal === 'function') d.showModal();
  else if (window.confirm('Download your book as PDF?')) download();
}
function download() {
  const blob = new Blob([state.bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = safeName(state.settings.title) + '.pdf';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Saved! Look in your Downloads folder.');
  import('./main.js').then(m => m.confetti && m.confetti($('#downloadBtn'))).catch(() => {});
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- init ---------- */
function init() {
  if (state.inited) return;
  state.inited = true;
  buildPickers();
  bindForm();
  fillForm();
  accordions();
  chapterEvents();
  pageDesignEvents();
  imageListEvents($('#bgList'), 'bg');
  imageListEvents($('#wmList'), 'wm');

  const onPick = (inp) => inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; loadFile(f); });
  onPick($('#fileInput')); onPick($('#fileInputBig'));
  $('#bgInput').addEventListener('change', (e) => { const f = Array.from(e.target.files); e.target.value = ''; addImages(f, 'bg'); });
  $('#wmInput').addEventListener('change', (e) => { const f = Array.from(e.target.files); e.target.value = ''; addImages(f, 'wm'); });
  dropZone($('#dropBig'), (f) => loadFile(f[0]));
  dropZone($('#dropSmall'), (f) => loadFile(f[0]));
  dropZone($('.preview'), (f) => loadFile(f[0]));
  $('#sampleBtn').addEventListener('click', loadSample);
  $('#sampleBtn2').addEventListener('click', loadSample);

  $('#zoomIn').addEventListener('click', () => rezoom(state.zoom * 1.25));
  $('#zoomOut').addEventListener('click', () => rezoom(state.zoom / 1.25));
  $('#zoomFit').addEventListener('click', () => rezoom(1));
  let rt = 0;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if ($('.pagebox')) rezoom(state.zoom); }, 150); }).observe($('#pages'));

  $('#downloadBtn').addEventListener('click', openConfirm);
  $('#clearBtn').addEventListener('click', askClear);
  $('#clearBtn2').addEventListener('click', askClear);
  $('#clearDialog').addEventListener('close', () => { if ($('#clearDialog').returnValue === 'clear') clearBook(); });
  $('#confirmCheck').addEventListener('change', (e) => { $('#confirmGo').disabled = !e.target.checked; });
  $('#confirm').addEventListener('close', () => { if ($('#confirm').returnValue === 'ok') download(); });

  $('#resetBtn').addEventListener('click', () => {
    const keepTitle = state.settings.title;
    state.settings = { ...DEFAULTS, title: keepTitle };
    state.pageDesigns = {};
    if (state.book) state.book.chapters.forEach(c => { c.design = 'book'; });
    saveSettings(); renderDesignPick(); renderDesignSelects(); renderChapters(); fillForm(); schedule(50);
    toast('Settings are back to normal');
  });

  $$('.mobile-tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

  setTimeout(refreshThumbs, 300);

  // opened by double-clicking an Excel file once the app is installed
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      const h = params.files && params.files[0];
      if (h) loadFile(await h.getFile());
    });
  }
}

export function enterStudio(params) {
  init();
  const t = params && params.get('template');
  const d = (params && params.get('design')) || (t && TEMPLATES.some(x => x.id === t) ? 'tpl:' + t : null);
  if (d && allDesigns(state.images).some(x => x.id === d)) {
    state.settings.design = d; saveSettings(); syncDependents();
    toast(`${designName(d, state.images)} design picked for the whole book`);
    if (state.book) schedule(50);
  }
  if (params && params.get('sample') === '1' && !state.book) loadSample();
  if (state.book && $('.pagebox')) setTimeout(() => rezoom(state.zoom), 50);
  if (!state.book) setTab('preview');
}
