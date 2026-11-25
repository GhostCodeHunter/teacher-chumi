// ടീച്ചർ.Chumi — book engine
// Turns sheets into a laid-out, print-ready PDF (vector text, same fonts everywhere).
import { TEMPLATES, insetPt, roundRect } from './templates.js';

const MM = 72 / 25.4;
const topRound = (x, y, w, h, r) => `M${x} ${y + h} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} Z`;
const RADIUS = 7;
export const PAGE_SIZES = {
  A4: [210, 297], A5: [148, 210], A3: [297, 420], B5: [176, 250],
  Letter: [215.9, 279.4], Legal: [215.9, 355.6], Square: [210, 210],
};

export const KID_PALETTE = ['#EC6A73', '#F0A04B', '#5DB8A5', '#5B8FE0', '#9273CF'];

export const DEFAULTS = {
  title: 'My Maths Book', subtitle: 'Practice Workbook', author: '', institution: '',
  contentMode: 'exact', cover: false, toc: false,
  pageSize: 'A4', customW: 210, customH: 297, orientation: 'portrait',
  margin: 'auto', marginMM: 18, mirror: false,
  textFont: 'helvetica', numFont: 'helvetica', numBold: true,
  baseSize: 'auto', minSize: 8, uniformSize: true,
  numAlign: 'right', grouping: 'none', decimals: 'auto',
  headerMode: 'auto', headingRows: true,
  tableStyle: 'playful', zebra: true, grid: 'all', tableWidth: 'full', equalCols: true,
  chapterTitles: false,
  runningHeader: false, pageNumbers: 'center', pageNumFormat: 'n',
  design: 'none', coverDesign: 'same', accent: '#F0A04B', accent2: '#5DB8A5', ink: '#2E2A26',
  bgOpacity: 1, bgFit: 'cover',
  wmType: 'none', wmText: 'ടീച്ചർ.Chumi', wmOpacity: 0.08, wmAngle: 40, wmScale: 60, wmColor: '#2E2A26', wmImageId: null, wmOnTop: false,
};

// ---------- colour helpers ----------
function hexToRgb01(hex) {
  const h = (hex || '#000').replace('#', '');
  const v = h.length === 3 ? h.split('').map(x => x + x).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

// ---------- number formatting ----------
const NUM_RE = /^([+\-−]?)\s*(\d+(?:,\d+)*)(\.\d+)?\s*(%?)$/;

function inferDec(v) {
  if (!isFinite(v) || Number.isInteger(v)) return 0;
  const s = String(Number(v.toPrecision(12)));
  if (s.includes('e')) return 4;
  const i = s.indexOf('.');
  return i < 0 ? 0 : Math.min(s.length - i - 1, 4);
}

export function formatNumber(n, dec, grouping) {
  let str = Math.abs(n).toFixed(dec);
  if (/e/.test(str)) return String(n);
  let neg = n < 0 && Number(str) !== 0;
  let [int, frac] = str.split('.');
  if (grouping === 'intl') int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  else if (grouping === 'indian' && int.length > 3) {
    const last3 = int.slice(-3);
    int = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return (neg ? '-' : '') + int + (frac ? '.' + frac : '');
}

const cleanLine = (s) => cleanText(s).replace(/\s*\n\s*/g, ' ');
function cleanText(s) {
  return String(s)
    .replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
    .replace(/[   ]/g, ' ')
    .replace(/[​⁠﻿]/g, '')
    .replace(/−/g, '-')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

// classify one raw cell into a display cell
function toCell(raw, exact) {
  const c = toCellInner(raw, exact);
  if (c && raw) { if (raw.b) c.bold = true; if (raw.a) c.align = raw.a; }
  return c;
}
function toCellInner(raw, exact) {
  if (!raw) return null;
  if (exact && raw.t === 'n' && raw.text != null) {
    // keep the number exactly as Excel shows it
    return { kind: 'num', num: raw.v, text: cleanText(raw.text), fixed: true };
  }
  if (raw.t === 'n') {
    const pct = raw.fmt === 'pct';
    const val = pct ? raw.v * 100 : raw.v;
    const dec = raw.dec != null ? raw.dec : Math.min(inferDec(val), pct ? 2 : 3);
    return { kind: 'num', num: val, dec, pct, plus: false };
  }
  const text = cleanText(raw.v);
  if (!text) return null;
  if (!raw.date && !raw.err) {
    let m = NUM_RE.exec(text);
    if (m && m[2].includes(',')) {
      const g = m[2];
      const thousands = /^\d{1,3}(,\d{3})+$/.test(g) || /^\d{1,2}(,\d{2})*,\d{3}$/.test(g);
      if (!thousands) {
        // "12,5" written with a decimal comma
        const dc = /^(\d+),(\d+)$/.exec(g);
        m = dc && !m[3] ? [m[0], m[1], dc[1], '.' + dc[2], m[4]] : null;
      }
    }
    if (m && exact) return { kind: 'numtext', text };
    if (m) {
      const digits = m[2].replace(/,/g, '');
      if ((digits.length > 1 && digits[0] === '0' && !m[3]) || digits.length > 15) return { kind: 'numtext', text };
      const val = parseFloat(digits + (m[3] || '')) * (m[1] && m[1] !== '+' ? -1 : 1);
      return { kind: 'num', num: val, dec: m[3] ? m[3].length - 1 : 0, pct: !!m[4], plus: m[1] === '+' };
    }
  }
  return { kind: 'text', text };
}

// ---------- text engine: vector text when the font can encode it, canvas image otherwise (Malayalam etc.) ----------
const CANVAS_FAMILY = {
  helvetica: '"Baloo Chettan 2","Noto Sans Malayalam","Nirmala UI",Arial,sans-serif',
  times: '"Noto Serif Malayalam","Noto Sans Malayalam","Nirmala UI",Georgia,serif',
  courier: '"Noto Sans Malayalam","Nirmala UI","Courier New",monospace',
};

class TextEngine {
  constructor(doc, fonts) {
    this.doc = doc; this.fonts = fonts;
    this.enc = new Map(); this.imgs = new Map();
    this.cv = document.createElement('canvas');
    this.cx = this.cv.getContext('2d');
    this.canvasCount = 0;
  }
  font(family, bold) { return this.fonts[family + (bold ? 'B' : '')]; }
  encodable(text, font) {
    const key = font.name + '|' + text;
    let ok = this.enc.get(key);
    if (ok === undefined) { try { font.encodeText(text); ok = true; } catch { ok = false; } this.enc.set(key, ok); }
    return ok;
  }
  cssFont(family, bold, px) { return `${bold ? 700 : 500} ${px}px ${CANVAS_FAMILY[family] || CANVAS_FAMILY.helvetica}`; }
  width(text, family, bold, size) {
    if (!text) return 0;
    const f = this.font(family, bold);
    if (this.encodable(text, f)) return f.widthOfTextAtSize(text, size);
    this.cx.font = this.cssFont(family, bold, 100);
    return (this.cx.measureText(text).width / 100) * size;
  }
  async draw(page, text, x, y, family, bold, size, color, opts = {}) {
    if (!text) return;
    const f = this.font(family, bold);
    if (this.encodable(text, f)) {
      page.drawText(text, { x, y, size, font: f, color: window.PDFLib.rgb(...color), opacity: opts.opacity ?? 1, rotate: opts.rotate });
      return;
    }
    const img = await this.image(text, family, bold, size, color);
    const w = img.w, h = img.h;
    const dx = -size * 0.08, dy = -size * 0.42;
    if (opts.rotate) {
      const a = opts.rotate.angle * Math.PI / 180;
      page.drawImage(img.ref, { x: x + dx * Math.cos(a) - dy * Math.sin(a), y: y + dx * Math.sin(a) + dy * Math.cos(a), width: w, height: h, rotate: opts.rotate, opacity: opts.opacity ?? 1 });
    } else page.drawImage(img.ref, { x: x + dx, y: y + dy, width: w, height: h, opacity: opts.opacity ?? 1 });
  }
  async image(text, family, bold, size, color) {
    const key = [text, family, bold, size.toFixed(2), color.join(',')].join('|');
    if (this.imgs.has(key)) return this.imgs.get(key);
    const scale = 5; // px per pt → sharp print
    const wPt = this.width(text, family, bold, size) + size * 0.16;
    const hPt = size * 1.6;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(wPt * scale)); cv.height = Math.ceil(hPt * scale);
    const g = cv.getContext('2d');
    g.font = this.cssFont(family, bold, size * scale);
    g.fillStyle = `rgb(${color.map(v => Math.round(v * 255)).join(',')})`;
    g.textBaseline = 'alphabetic';
    g.fillText(text, size * 0.08 * scale, (hPt - size * 0.42) * scale);
    const bytes = await new Promise(res => cv.toBlob(b => b.arrayBuffer().then(res), 'image/png'));
    const ref = await this.doc.embedPng(bytes);
    const out = { ref, w: wPt, h: hPt };
    this.imgs.set(key, out); this.canvasCount++;
    return out;
  }
  wrap(text, family, bold, size, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      const words = para.split(/ +/);
      let line = '';
      for (let word of words) {
        // break words that are wider than the column
        while (this.width(word, family, bold, size) > maxW && word.length > 1) {
          let k = word.length - 1;
          while (k > 1 && this.width(word.slice(0, k), family, bold, size) > maxW) k--;
          if (line) { out.push(line); line = ''; }
          out.push(word.slice(0, k)); word = word.slice(k);
        }
        const test = line ? line + ' ' + word : word;
        if (!line || this.width(test, family, bold, size) <= maxW) line = test;
        else { out.push(line); line = word; }
      }
      out.push(line);
    }
    return out.length ? out : [''];
  }
}

// ---------- sheet analysis ----------
function analyseSheet(sheet, s, report, label) {
  const exact = s.contentMode === 'exact';
  let grid = (sheet.rows || []).map(r => Array.from(r || [], (c) => toCell(c, exact)));
  const merges = sheet.merges || [];
  const mergedStart = new Map();
  for (const m of merges) if (m.c2 > m.c1) mergedStart.set(m.r1 + ':' + m.c1, m.c2 - m.c1 + 1);

  const width = grid.reduce((a, r) => Math.max(a, r.length), 0);
  // empty columns (exact: only the empty edges are trimmed, inner columns like a blank "Answer" stay)
  const used = new Array(width).fill(false);
  grid.forEach(r => r.forEach((c, i) => { if (c) used[i] = true; }));
  // a merged cell counts as using every column it covers
  for (const m of merges) for (let i = m.c1; i <= m.c2 && i < width; i++) if (grid[m.r1] && grid[m.r1][m.c1]) used[i] = true;
  let keep;
  if (exact) {
    const a = used.indexOf(true), b = used.lastIndexOf(true);
    keep = a < 0 ? [] : Array.from({ length: b - a + 1 }, (_, k) => a + k);
  } else keep = used.map((u, i) => u ? i : -1).filter(i => i >= 0);
  const removedCols = exact ? 0 : width - keep.length;
  const colPos = new Map(keep.map((c, k) => [c, k]));
  // merged cells become one wide cell
  if (exact) for (const m of merges) {
    const r = grid[m.r1];
    if (!r || !r[m.c1] || m.c2 <= m.c1) continue;
    const a = colPos.get(m.c1); let b = a;
    for (let c = m.c1 + 1; c <= m.c2; c++) if (colPos.has(c)) b = colPos.get(c);
    if (a != null && b > a) r[m.c1].span = b - a + 1;
  }
  grid = grid.map(r => keep.map(i => r[i] || null));
  const nCols = keep.length;
  const excelWidths = sheet.colWidths ? keep.map(i => sheet.colWidths[i] || 8.43) : null;

  // rows: trim + collapse blanks (exact: every blank row inside stays as a blank line)
  const rows = [];
  let blank = 0, collapsed = 0;
  grid.forEach((r, ri) => {
    const filled = r.filter(Boolean).length;
    if (!filled) { blank++; return; }
    if (rows.length && blank) {
      if (exact) for (let k = 0; k < blank; k++) rows.push({ type: 'spacer' });
      else { rows.push({ type: 'spacer' }); if (blank > 1) collapsed += blank - 1; }
    }
    blank = 0;
    const firstIdx = r.findIndex(Boolean);
    const merged = mergedStart.get(ri + ':' + keep[firstIdx]) > 1;
    rows.push({ type: 'row', cells: r, filled, merged, src: ri });
  });
  if (!rows.length) return null;

  if (removedCols) report.push({ k: 'fix', t: `${label}: removed ${removedCols} empty column${removedCols > 1 ? 's' : ''}` });
  if (collapsed) report.push({ k: 'fix', t: `${label}: joined ${collapsed} extra blank row${collapsed > 1 ? 's' : ''}` });
  if (sheet.truncated) report.push({ k: 'warn', t: `${label}: very long sheet, only the first 20,000 rows are used` });
  if (sheet.hiddenRows || sheet.hiddenCols) report.push({ k: 'info', t: `${label}: skipped hidden rows/columns like Excel` });
  if (merges.length) report.push({ k: 'info', t: exact ? `${label}: merged cells kept as in Excel` : `${label}: merged cells laid out as headings` });
  if (exact) report.push({ k: 'ok', t: `${label}: same rows, columns and numbers as your Excel` });

  // headings + header rows
  let headings = 0, headers = 0;
  let segStart = true, firstTable = true;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.type === 'spacer') { segStart = true; continue; }
    const only = r.filled === 1 ? r.cells.find(Boolean) : null;
    if (!exact && s.headingRows && nCols > 1 && only && only.kind === 'text' && (r.merged || segStart)) {
      r.type = 'heading'; r.text = only.text; headings++; segStart = true; continue;
    }
    if (segStart) {
      const next = rows.slice(i + 1).find(x => x.type === 'row');
      const allText = r.cells.every(c => !c || c.kind === 'text');
      const nextHasNum = next && next.cells.some(c => c && c.kind !== 'text');
      const isHeader = s.headerMode === 'first' ? firstTable
        : s.headerMode === 'none' ? false
        : ((r.filled >= 2 || nCols === 1) && allText && !!nextHasNum)
          // text-only table: a full first row of short labels is a header
          || (firstTable && nCols >= 2 && r.filled === nCols && allText && !!next && r.cells.every(c => c.text.length <= 40));
      if (isHeader) { r.type = 'header'; headers++; }
      firstTable = false;
    }
    segStart = false;
  }
  if (headings) report.push({ k: 'info', t: `${label}: found ${headings} title row${headings > 1 ? 's' : ''}` });
  if (headers) report.push({ k: 'info', t: `${label}: found ${headers} header row${headers > 1 ? 's' : ''}, repeated on new pages` });

  // column types and decimals
  const cols = Array.from({ length: nCols }, () => ({ num: 0, text: 0, dec: 0, pctDec: 0 }));
  for (const r of rows) if (r.type === 'row') r.cells.forEach((c, i) => {
    if (!c) return;
    if (c.kind === 'text') cols[i].text++;
    else { cols[i].num++; if (c.kind === 'num') { if (c.pct) cols[i].pctDec = Math.max(cols[i].pctDec, c.dec); else cols[i].dec = Math.max(cols[i].dec, c.dec); } }
  });
  cols.forEach(c => { c.isNum = c.num > 0 && c.num >= (c.num + c.text) * 0.6; });

  // final display text
  let mixedDec = 0;
  for (const r of rows) {
    if (!r.cells) continue;
    r.cells.forEach((c, i) => {
      if (!c) return;
      if (c.kind === 'num' && !c.fixed) {
        const want = s.decimals === 'auto' ? (c.pct ? cols[i].pctDec : cols[i].dec) : +s.decimals;
        if (want !== c.dec) mixedDec++;
        c.text = (c.plus ? '+' : '') + formatNumber(c.num, want, s.grouping) + (c.pct ? '%' : '');
      }
    });
  }
  if (mixedDec) report.push({ k: 'fix', t: `${label}: made ${mixedDec} number${mixedDec > 1 ? 's' : ''} use the same decimal style` });

  return { rows, cols, nCols, exact, excelWidths };
}

// ---------- layout ----------
function pageDims(s, landscape) {
  let [wmm, hmm] = s.pageSize === 'Custom'
    ? [clamp(+s.customW || 210, 50, 1000), clamp(+s.customH || 297, 50, 1000)]
    : (PAGE_SIZES[s.pageSize] || PAGE_SIZES.A4);
  let w = wmm * MM, h = hmm * MM;
  if (landscape ? w < h : w > h) [w, h] = [h, w];
  return { w, h };
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function margins(s, w, h) {
  let base;
  if (s.margin === 'custom') base = clamp(+s.marginMM || 18, 5, 60) * MM;
  else {
    const auto = clamp(Math.min(w, h) * 0.085, 12 * MM, 24 * MM);
    base = { auto, narrow: auto * 0.7, normal: auto, wide: auto * 1.35 }[s.margin] || auto;
  }
  return { base, inner: s.mirror ? base * 1.25 : base, outer: s.mirror ? base * 0.85 : base, t: base, b: base };
}

// ---------- designs: none, vector template ("tpl:id") or picture ("img:id") ----------
export function resolveDesign(id, images) {
  if (!id || id === 'none') return { kind: 'none', id: 'none' };
  if (id.startsWith('tpl:')) { const t = TEMPLATES.find(x => x.id === id.slice(4)); return t ? { kind: 'tpl', id, tpl: t } : { kind: 'none', id: 'none' }; }
  if (id.startsWith('img:')) { const im = images.find(x => x.id === id); return im ? { kind: 'img', id, img: im } : { kind: 'none', id: 'none' }; }
  return { kind: 'none', id: 'none' };
}

function pictureRect(img, w, h, s) {
  return fitRect(img.w || 1, img.h || 1, w, h, img.fit || s.bgFit);
}

// space each design needs around the content, from the page edges
function designNeed(d, w, h, s, base) {
  const out = { l: base, r: base, t: base, b: base };
  if (d.kind === 'tpl') { const i = insetPt(d.tpl); out.l += i; out.r += i; out.t += i; out.b += i; }
  if (d.kind === 'img' && d.img.safe) {
    const r = pictureRect(d.img, w, h, s), sf = d.img.safe;
    out.l = Math.max(base, r.x + r.width * sf.l);
    out.r = Math.max(base, w - (r.x + r.width) + r.width * sf.r);
    out.t = Math.max(base, h - (r.y + r.height) + r.height * sf.t);
    out.b = Math.max(base, r.y + r.height * sf.b);
  }
  return out;
}

function frame(s, landscape) {
  const { w, h } = pageDims(s, landscape);
  const m = margins(s, w, h);
  // every page of the book gets the same margins: the biggest any chosen design needs
  for (const d of (s.__designs || [])) {
    const n = designNeed(d, w, h, s, m.base);
    const side = Math.max(n.l, n.r);
    if (s.mirror) { m.inner = Math.max(m.inner, side); m.outer = Math.max(m.outer, side); }
    else { m.inner = Math.max(m.inner, n.l); m.outer = Math.max(m.outer, n.r); }
    m.t = Math.max(m.t, n.t); m.b = Math.max(m.b, n.b);
  }
  const ins = 0;
  const headH = s.runningHeader ? 16 : 0;
  const footH = s.pageNumbers !== 'none' ? 16 : 0;
  const contentW = w - m.inner - m.outer;
  return { w, h, m, ins, headH, footH, contentW, top: h - m.t - headH, bottom: m.b + footH };
}

function baseSizeFor(s, fr) {
  if (s.baseSize !== 'auto') return clamp(+s.baseSize || 12, 6, 28);
  return Math.round(clamp(fr.contentW / 36, 9, 16) * 2) / 2;
}

const PAD = 0.55; // cell padding in em
function measureCols(an, s, T) {
  const tf = s.textFont, nf = s.numFont;
  return an.cols.map((col, j) => {
    let numW = 0, textW = 0, wordW = 0;
    for (const r of an.rows) {
      if (!r.cells || !r.cells[j]) continue;
      const c = r.cells[j];
      if (c.span > 1) continue; // wide merged cells don't force one column wider
      const bold = r.type === 'header' || !!c.bold;
      if (c.kind !== 'text' && r.type !== 'header') numW = Math.max(numW, T.width(c.text, nf, s.numBold, 1));
      else {
        const isNumFont = c.kind !== 'text';
        const fam = isNumFont ? nf : tf;
        const b = bold || (isNumFont && s.numBold);
        for (const line of c.text.split('\n')) textW = Math.max(textW, T.width(line, fam, b, 1));
        for (const word of c.text.split(/\s+/)) wordW = Math.max(wordW, T.width(word, fam, b, 1));
      }
    }
    const minW = Math.max(numW, Math.min(wordW, 14), Math.min(textW, col.isNum ? 0 : 4)) + 2 * PAD;
    const want = Math.max(numW, Math.min(textW, 24)) + 2 * PAD;
    return { minW, want: Math.max(want, minW), isNum: col.isNum, xw: an.excelWidths ? an.excelWidths[j] : null };
  });
}

function fitSize(meas, idx, W, base) {
  const sum = idx.reduce((a, j) => a + meas[j].minW, 0);
  return Math.min(base, W / sum);
}

// exact mode: keep the column widths from Excel (scaled to the page), only widen too-narrow columns
function exactWidths(meas, idx, W, size, s) {
  const min = idx.map(j => meas[j].minW * size);
  const xw = idx.map(j => Math.max(0.5, meas[j].xw));
  const tot = xw.reduce((a, b) => a + b, 0);
  const natural = tot * 5.25 * size / 11; // Excel width at this text size (about 7px per character at 11pt)
  const target = s.tableWidth === 'fit' ? Math.min(W, Math.max(natural, min.reduce((a, b) => a + b, 0))) : W;
  let w = xw.map(c => target * c / tot);
  for (let pass = 0; pass < 6; pass++) {
    const need = w.reduce((a, x, i) => a + Math.max(0, min[i] - x), 0);
    if (need <= 0.01) break;
    const excess = w.map((x, i) => Math.max(0, x - min[i]));
    const exTot = excess.reduce((a, b) => a + b, 0);
    w = w.map((x, i) => Math.max(x, min[i]));
    if (exTot > 0) { const k = Math.min(1, need / exTot); w = w.map((x, i) => x - excess[i] * k); }
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return sum > W ? w.map(x => x * W / sum) : w;
}

function columnWidths(meas, idx, W, size, s) {
  if (s.contentMode === 'exact' && idx.every(j => meas[j].xw)) return exactWidths(meas, idx, W, size, s);
  let w = idx.map(j => meas[j].minW * size);
  const want = idx.map(j => meas[j].want * size);
  let extra = W - w.reduce((a, b) => a + b, 0);
  if (extra < 0) { const k = W / (W - extra); return w.map(x => x * k); }
  // grow text columns towards wanted width
  const deficit = w.map((x, i) => Math.max(0, want[i] - x));
  const dsum = deficit.reduce((a, b) => a + b, 0);
  if (dsum > 0) { const k = Math.min(1, extra / dsum); w = w.map((x, i) => x + deficit[i] * k); extra -= dsum * k; }
  // same width for number columns → neat rows of numbers
  if (s.equalCols) {
    const numI = idx.map((j, i) => meas[j].isNum ? i : -1).filter(i => i >= 0);
    if (numI.length > 1) {
      const target = Math.max(...numI.map(i => w[i]));
      const need = numI.reduce((a, i) => a + (target - w[i]), 0);
      if (need <= extra) { numI.forEach(i => { w[i] = target; }); extra -= need; }
    }
  }
  if (s.tableWidth === 'full' && extra > 0) {
    const allNumTable = idx.every(j => meas[j].isNum);
    const cap = (i) => meas[idx[i]].isNum ? Math.max(w[i], size * (allNumTable ? 9 : 7)) : Infinity;
    const numI = idx.map((j, i) => meas[j].isNum ? i : -1).filter(i => i >= 0);
    const allNum = numI.length === idx.length;
    const caps = w.map((_, i) => cap(i));
    // share the extra space; number columns stop at a sensible width, the table is centred if space is left
    for (let pass = 0; pass < 4 && extra > 0.5; pass++) {
      const open = w.map((x, i) => (x < caps[i] - 0.01 ? i : -1)).filter(i => i >= 0);
      if (!open.length) break;
      const tot = open.reduce((a, i) => a + (allNum || !s.equalCols ? w[i] : 1), 0);
      let used = 0;
      for (const i of open) {
        const share = extra * ((allNum || !s.equalCols ? w[i] : 1) / tot);
        const add = Math.min(share, caps[i] - w[i]);
        w[i] += add; used += add;
      }
      extra -= used;
    }
  }
  return w;
}

function splitGroups(meas, W, size, keyCol) {
  const groups = [];
  let cur = keyCol != null ? [keyCol] : [], curW = keyCol != null ? meas[keyCol].minW * size : 0;
  for (let j = 0; j < meas.length; j++) {
    if (j === keyCol) continue;
    const cw = meas[j].minW * size;
    const base = keyCol != null ? 1 : 0;
    if (cur.length > base && curW + cw > W) {
      groups.push(cur);
      cur = keyCol != null ? [keyCol] : []; curW = keyCol != null ? meas[keyCol].minW * size : 0;
    }
    cur.push(j); curW += cw;
  }
  if (cur.length > (keyCol != null ? 1 : 0)) groups.push(cur);
  // even out the parts (e.g. 8+8+7+7 columns instead of 9+9+9+3)
  if (groups.length > 1) {
    const rest = meas.map((_, j) => j).filter(j => j !== keyCol);
    const per = Math.ceil(rest.length / groups.length);
    const even = [];
    for (let i = 0; i < rest.length; i += per) even.push((keyCol != null ? [keyCol] : []).concat(rest.slice(i, i + per)));
    const fits = even.length === groups.length && even.every(g => g.reduce((a, j) => a + meas[j].minW * size, 0) <= W + 0.5);
    if (fits) return even;
  }
  return groups;
}

function planChapter(an, s, T, report, label) {
  const meas = measureCols(an, s, T);
  const all = meas.map((_, j) => j);
  let landscape = s.orientation === 'landscape';
  let fr = frame(s, landscape);
  let base = baseSizeFor(s, fr);
  let size = fitSize(meas, all, fr.contentW, base);
  if (size < s.minSize && s.orientation === 'auto' && !landscape) {
    const fr2 = frame(s, true);
    const size2 = fitSize(meas, all, fr2.contentW, baseSizeFor(s, fr));
    if (size2 > size) { landscape = true; fr = fr2; size = size2; report.push({ k: 'fix', t: `${label}: wide table, turned pages sideways (landscape)` }); }
  }
  let groups = [all];
  const keyCol = !meas[0].isNum && meas.length > 2 ? 0 : null;
  if (size < s.minSize) {
    size = Math.max(s.minSize, Math.min(base, s.minSize * 1.15));
    groups = splitGroups(meas, fr.contentW, size, keyCol);
    report.push({ k: 'fix', t: `${label}: too many columns for one page, split into ${groups.length} parts` });
  } else if (size < base - 0.01) {
    report.push({ k: 'fix', t: `${label}: text made smaller (${(Math.floor(size * 2) / 2).toFixed(1)} pt) so the table fits the page` });
  }
  size = Math.floor(size * 2) / 2;
  return { an, meas, groups, landscape, fr, size, label, keyCol, split: groups.length > 1 };
}

// ---------- pagination into draw ops ----------
function paginate(plan, s, T, ch) {
  const { an, meas, groups, fr } = plan;
  const size = plan.size;
  const lineH = size * 1.3, padY = size * 0.42, pad = PAD * size;
  const pages = [];
  let page = null, y = 0, seg = null;
  const newPage = () => {
    page = { landscape: plan.landscape, fr, ops: [], chapter: ch.title }; pages.push(page);
    y = fr.top; seg = null;
  };
  const closeSeg = () => { seg = null; };

  groups.forEach((g, gi) => {
    const widths = columnWidths(meas, g, fr.contentW, size, s);
    const tableW = widths.reduce((a, b) => a + b, 0);
    const x0 = (fr.contentW - tableW) / 2; // relative to content left
    const xs = []; widths.reduce((acc, w, i) => { xs[i] = acc; return acc + w; }, x0);

    const rowItem = (r) => {
      const cells = [], bounds = [];
      const header = r.type === 'header';
      for (let i = 0; i < g.length;) {
        const j = g[i];
        const c = r.cells[j];
        if (i > 0) bounds.push(xs[i]);
        if (!c) { cells.push(null); i++; continue; }
        const isNumFont = c.kind !== 'text';
        const fam = isNumFont ? s.numFont : s.textFont;
        const bold = header || !!c.bold || (isNumFont && s.numBold);
        let span = 1;
        if (c.span > 1) { const end = j + c.span - 1; while (i + span < g.length && g[i + span] > j && g[i + span] <= end) span++; }
        let w = widths.slice(i, i + span).reduce((a, b) => a + b, 0);
        // like Excel: long text runs on into the empty cells next to it
        // (only for a row with one filled cell, so a blank Answer column always stays a box)
        if (an.exact && !isNumFont && !header && span === 1 && r.filled === 1 && (!c.align || c.align === 'left')) {
          const need = Math.max(...c.text.split('\n').map(l => T.width(l, fam, bold, size))) + 2 * pad;
          while (w < need && i + span < g.length && !r.cells[g[i + span]] && g[i + span] > j) { w += widths[i + span]; span++; }
        }
        let align = c.align || (meas[j].isNum ? (s.numAlign === 'center' ? 'center' : 'right') : 'left');
        if (span > 1 && !c.align && an.exact && c.span > 1) align = 'center';
        const lines = isNumFont ? [c.text] : T.wrap(c.text, fam, bold, size, w - 2 * pad);
        cells.push({ lines, fam, bold, align, x: xs[i], w });
        i += span;
      }
      const n = Math.max(1, ...cells.map(c => (c ? c.lines.length : 1)));
      return { kind: 'row', header, cells, h: n * lineH + 2 * padY, n, widths, xs, bounds };
    };

    if (!page) newPage();
    if (gi === 0 && s.chapterTitles) {
      const tSize = size * 1.75;
      const lines = T.wrap(ch.title, s.textFont, true, tSize, fr.contentW - tSize * 1.4);
      const h = lines.length * tSize * 1.25 + tSize * 0.9;
      page.ops.push({ kind: 'chapter', y, h, lines, size: tSize });
      y -= h + size * 1.2;
    }
    if (groups.length > 1) {
      const h = size * 1.6;
      const firstRows = an.rows.filter(r => r.cells).slice(0, 3).reduce((a, r) => a + rowItem(r).h, 0);
      if (y - h - firstRows < fr.bottom && page.ops.some(o => o.kind === 'row')) newPage();
      page.ops.push({ kind: 'part', y, text: `Part ${gi + 1} of ${groups.length}`, size: size * 0.9 });
      y -= h;
    }

    let header = null, zebra = 0;
    const items = an.rows;
    const cache = new Map();
    const itemOf = (r) => { let it = cache.get(r); if (!it) { it = rowItem(r); cache.set(r, it); } return it; };
    const fullH = fr.top - fr.bottom;
    // height of the table block that starts at index i (until the next blank row or title)
    const blockH = (i) => {
      let h = 0;
      for (let k = i; k < items.length && (items[k].type === 'row' || items[k].type === 'header'); k++) h += itemOf(items[k]).h;
      return h;
    };
    let blockStart = true;
    // avoid leaving a single last row of a table alone on the next page
    const widow = (i, item) => {
      const nx = items[i + 1];
      if (!nx || nx.type !== 'row' || (items[i + 2] && items[i + 2].type === 'row')) return false;
      if (!page.ops.some(o => o.kind === 'row' && !o.header)) return false;
      return y - item.h >= fr.bottom && y - item.h - itemOf(nx).h < fr.bottom;
    };
    const hasBody = () => page.ops.some(o => o.kind === 'row' || o.kind === 'heading');
    const lastIsHeading = () => { const o = page.ops[page.ops.length - 1]; return o && (o.kind === 'heading' || o.kind === 'part' || o.kind === 'chapter'); };
    for (let i = 0; i < items.length; i++) {
      const r = items[i];
      if (r.type === 'spacer') { if (y < fr.top - 1) y -= an.exact ? lineH + 2 * padY : size * 0.9; closeSeg(); header = null; zebra = 0; blockStart = true; continue; }
      if (r.type === 'heading') {
        const hs = size * 1.2;
        const lines = T.wrap(r.text, s.textFont, true, hs, fr.contentW);
        const h = lines.length * hs * 1.3 + size * 0.5;
        const nextI = items.findIndex((x, k) => k > i && x.type !== 'spacer');
        const nb = nextI > 0 && items[nextI].type !== 'heading' ? blockH(nextI) : 0;
        const keep = h + nb <= fullH * 0.92 ? nb : (nextI > 0 && items[nextI].cells ? itemOf(items[nextI]).h * 2 : 0);
        if (y - h - keep < fr.bottom && hasBody()) newPage();
        page.ops.push({ kind: 'heading', y, lines, size: hs, h });
        y -= h; closeSeg(); header = null; zebra = 0; blockStart = true;
        continue;
      }
      const item = itemOf(r);
      if (blockStart) {
        // keep a whole small table together on one page
        const bh = blockH(i);
        if (y - bh < fr.bottom && bh <= fullH * 0.92 && hasBody() && !lastIsHeading()) newPage();
        blockStart = false;
      }
      if (r.type === 'header') {
        header = item; zebra = 0;
        const next = items[i + 1] && items[i + 1].cells ? itemOf(items[i + 1]).h : 0;
        if (y - item.h - next < fr.bottom && y < fr.top - 1) { newPage(); }
      } else if (y - item.h < fr.bottom || widow(i, item)) {
        newPage();
        if (header) { pushRow(header); }
      }
      pushRow(item, r.type !== 'header' ? zebra++ : -1);
    }
    function pushRow(item, z = -1) {
      if (!seg) { seg = { kind: 'seg', top: y, bottom: y, x: item.xs[0], w: item.widths.reduce((a, b) => a + b, 0) }; page.ops.push(seg); }
      page.ops.push({ ...item, y, zebra: z });
      y -= item.h; seg.bottom = y;
    }
    closeSeg();
    if (gi < groups.length - 1) y -= size * 1.5;
  });
  return pages;
}

// ---------- drawing ----------
async function drawPageContent(pdfPage, pg, s, T, C, pageNo, isOdd) {
  const { fr } = pg;
  const { rgb } = window.PDFLib;
  const left = (s.mirror ? (isOdd ? fr.m.inner : fr.m.outer) : fr.m.inner) + fr.ins;
  const ink = C.ink;
  const style = s.tableStyle;
  const ordered = pg.ops.filter(o => o.kind !== 'seg').concat(pg.ops.filter(o => o.kind === 'seg'));
  for (const op of ordered) {
    if (op.kind === 'chapter') {
      const pillH = op.h;
      const lw = Math.max(...op.lines.map(l => T.width(l, s.textFont, true, op.size)));
      const pw = Math.min(fr.contentW, lw + op.size * 1.4);
      const px = left + (style === 'playful' ? (fr.contentW - pw) / 2 : 0);
      if (style === 'playful') {
        pdfPage.drawSvgPath(roundRect(px, fr.h - op.y, pw, pillH, Math.min(pillH / 2, op.size * 0.9)), { x: 0, y: fr.h, color: rgb(...C.accentSoft) });
      }
      for (let i = 0; i < op.lines.length; i++) {
        const l = op.lines[i];
        const lwid = T.width(l, s.textFont, true, op.size);
        const tx = style === 'playful' ? px + (pw - lwid) / 2 : left;
        await T.draw(pdfPage, l, tx, op.y - op.size * 0.45 - op.size * (0.95 + i * 1.25), s.textFont, true, op.size, ink);
      }
      if (style !== 'playful') pdfPage.drawRectangle({ x: left, y: op.y - pillH + 2, width: Math.min(fr.contentW, 60), height: 2.5, color: rgb(...C.accent) });
    } else if (op.kind === 'part') {
      await T.draw(pdfPage, op.text, left, op.y - op.size, s.textFont, true, op.size, C.muted);
    } else if (op.kind === 'heading') {
      for (let i = 0; i < op.lines.length; i++) {
        const l = op.lines[i];
        const lw = T.width(l, s.textFont, true, op.size);
        const tx = style === 'playful' ? left + (fr.contentW - lw) / 2 : left;
        await T.draw(pdfPage, l, tx, op.y - op.size * (1.0 + i * 1.3), s.textFont, true, op.size, C.heading);
      }
    } else if (op.kind === 'row') {
      const rowTop = op.y, rowH = op.h;
      const x = left + op.xs[0];
      const w = op.widths.reduce((a, b) => a + b, 0);
      if (op.header) {
        if (style === 'playful') pdfPage.drawSvgPath(topRound(x, fr.h - rowTop, w, rowH, Math.min(rowH * 0.45, RADIUS)), { x: 0, y: fr.h, color: rgb(...C.headerFill) });
        else if (style === 'classic') pdfPage.drawRectangle({ x, y: rowTop - rowH, width: w, height: rowH, color: rgb(...C.headerFill) });
      } else {
        // solid row so background pictures / ruled lines never make numbers hard to read
        const fill = s.zebra && op.zebra % 2 === 1 ? C.zebra : C.white;
        pdfPage.drawRectangle({ x, y: rowTop - rowH, width: w, height: rowH, color: rgb(...fill) });
      }
      // grid
      const lc = rgb(...C.line), th = 0.6;
      if (!op.header || style !== 'playful') {
        if (s.grid === 'all' || s.grid === 'horizontal') pdfPage.drawLine({ start: { x, y: rowTop - rowH }, end: { x: x + w, y: rowTop - rowH }, thickness: th, color: lc });
        if (s.grid === 'all') for (const bx of (op.bounds || op.xs.slice(1))) {
          const vx = left + bx;
          pdfPage.drawLine({ start: { x: vx, y: rowTop }, end: { x: vx, y: rowTop - rowH }, thickness: th, color: lc });
        }
      }
      for (const c of op.cells) {
        if (!c) continue;
        const sz = c.size || pg.size;
        const lineH = sz * 1.3, padY = sz * 0.42, pad = PAD * sz;
        const offset = (op.n - c.lines.length) * lineH / 2;
        for (let i = 0; i < c.lines.length; i++) {
          const line = c.lines[i];
          const lw = T.width(line, c.fam, c.bold, sz);
          const cx = left + c.x;
          const tx = c.align === 'right' ? cx + c.w - pad - lw : c.align === 'center' ? cx + (c.w - lw) / 2 : cx + pad;
          const ty = rowTop - padY - offset - i * lineH - (lineH - sz) / 2 - sz * 0.84;
          await T.draw(pdfPage, line, tx, ty, c.fam, c.bold, sz, op.header ? C.headerInk : ink);
        }
      }
    } else if (op.kind === 'seg') {
      const x = left + op.x;
      if (op.top - op.bottom < 1) continue;
      if (style === 'playful' && (s.grid === 'all' || s.grid === 'outer')) {
        pdfPage.drawSvgPath(roundRect(x, fr.h - op.top, op.w, op.top - op.bottom, RADIUS), { x: 0, y: fr.h, borderColor: rgb(...C.lineStrong), borderWidth: 1 });
      } else if (s.grid === 'all' || s.grid === 'outer') {
        pdfPage.drawRectangle({ x, y: op.bottom, width: op.w, height: op.top - op.bottom, borderColor: rgb(...C.lineStrong), borderWidth: 0.9 });
      } else if (s.grid === 'horizontal') {
        pdfPage.drawLine({ start: { x, y: op.top }, end: { x: x + op.w, y: op.top }, thickness: 0.9, color: rgb(...C.lineStrong) });
      }
    }
  }
}

function colours(s) {
  const white = [1, 1, 1];
  const accent = hexToRgb01(s.accent), accent2 = hexToRgb01(s.accent2), ink = hexToRgb01(s.ink);
  return {
    accent, accent2, ink, white,
    accentSoft: mix(accent, white, 0.78),
    headerFill: mix(accent, white, s.tableStyle === 'playful' ? 0.62 : 0.8),
    headerInk: ink,
    zebra: mix(accent2, white, 0.9),
    line: mix(ink, white, 0.78),
    lineStrong: mix(ink, white, 0.55),
    muted: mix(ink, white, 0.4),
    heading: mix(ink, accent, 0.25),
    pal: KID_PALETTE.map(hexToRgb01),
  };
}

function tplColours(C, rgb) {
  return {
    accent: rgb(...C.accent), accent2: rgb(...C.accent2), ink: rgb(...C.ink), white: rgb(1, 1, 1),
    soft: rgb(...C.accentSoft), rule: rgb(0.55, 0.7, 0.92), paper: rgb(1, 1, 1),
    pal: C.pal.map(p => rgb(...p)),
    sky: rgb(...hexToRgb01('#5B8FE0')), mint: rgb(...hexToRgb01('#5DB8A5')), sun: rgb(...hexToRgb01('#F6C24C')),
  };
}

// ---------- images ----------
async function embedImage(doc, img, cache) {
  if (!img) return null;
  if (cache.has(img.id)) return cache.get(img.id);
  const e = img.type === 'image/png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
  cache.set(img.id, e);
  return e;
}

function fitRect(iw, ih, W, H, mode) {
  if (mode === 'stretch') return { x: 0, y: 0, width: W, height: H };
  const k = mode === 'contain' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
  const w = iw * k, h = ih * k;
  return { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h };
}

// ---------- main ----------
export async function buildBook(book, settings, images = []) {
  const s = { ...DEFAULTS, ...settings };
  const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
  const report = [];
  const doc = await PDFDocument.create();
  doc.setTitle(s.title || 'Book');
  doc.setAuthor(s.author || '');
  doc.setCreator('ടീച്ചർ.Chumi');
  doc.setProducer('ടീച്ചർ.Chumi book maker');

  const F = StandardFonts;
  const fonts = {
    helvetica: await doc.embedFont(F.Helvetica), helveticaB: await doc.embedFont(F.HelveticaBold),
    times: await doc.embedFont(F.TimesRoman), timesB: await doc.embedFont(F.TimesRomanBold),
    courier: await doc.embedFont(F.Courier), courierB: await doc.embedFont(F.CourierBold),
  };
  const T = new TextEngine(doc, fonts);
  const C = colours(s);
  const pageDesigns = s.pageDesigns || {};
  const used = new Set([s.design, pageDesigns.toc]);
  book.chapters.forEach(ch => { if (ch.include && ch.design && ch.design !== 'book') used.add(ch.design); });
  Object.entries(pageDesigns).forEach(([k, v]) => { if (k !== 'cover') used.add(v); });
  s.__designs = [...used].filter(Boolean).map(id => resolveDesign(id, images)).filter(d => d.kind !== 'none');
  const TC = tplColours(C, rgb);

  // 1. analyse + plan chapters
  const chapters = [];
  for (const ch of book.chapters) {
    if (!ch.include) continue;
    const sheet = book.sheets[ch.sheet];
    if (!sheet) continue;
    const label = ch.title || sheet.name;
    const an = analyseSheet(sheet, s, report, label);
    if (!an) { report.push({ k: 'warn', t: `${label}: sheet is empty, skipped` }); continue; }
    chapters.push({ title: label, design: ch.design && ch.design !== 'book' ? ch.design : null, plan: planChapter(an, s, T, report, label) });
  }
  if (!chapters.length) throw new Error('No sheets with data are selected. Tick at least one sheet with content.');

  // same font size on every page
  if (s.uniformSize) {
    // wide tables that had to be split don't drag the whole book down to tiny text
    const fitting = chapters.filter(c => !c.plan.split);
    const sizes = (fitting.length ? fitting : chapters).map(c => c.plan.size);
    const min = Math.min(...sizes);
    const differ = chapters.some(c => Math.abs(c.plan.size - min) > 0.01);
    chapters.forEach(c => {
      const pl = c.plan;
      if (pl.split && min > pl.size) {
        pl.groups = splitGroups(pl.meas, pl.fr.contentW, min, pl.keyCol);
        report.push({ k: 'fix', t: `${pl.label}: now in ${pl.groups.length} parts so it keeps the same text size` });
      }
      pl.size = min;
    });
    if (differ) report.push({ k: 'fix', t: `Same text size (${min.toFixed(1)} pt) used on every page` });
  }

  // 2. paginate
  const contentPages = [];
  for (const ch of chapters) {
    ch.start = contentPages.length + 1;
    const pages = paginate(ch.plan, s, T, ch);
    pages.forEach(p => { p.size = ch.plan.size; p.chapter = ch.title; p.chapterDesign = ch.design; });
    contentPages.push(...pages);
  }

  // 3. front matter
  const portrait = frame(s, s.orientation === 'landscape');
  const imgCache = new Map();
  const wmImg = images.find(i => i.id === s.wmImageId);
  const wmRef = s.wmType === 'image' && wmImg ? await embedImage(doc, wmImg, imgCache) : null;
  const pagesMeta = [];

  const decorate = async (p, w, h, fr, kind, index, designId) => {
    const d = resolveDesign(designId, images);
    if (d.kind === 'img') {
      const ref = await embedImage(doc, d.img, imgCache);
      if (d.img.fill) p.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(...hexToRgb01(d.img.fill)) });
      p.drawImage(ref, { ...pictureRect({ ...d.img, w: ref.width, h: ref.height }, w, h, s), opacity: clamp(+s.bgOpacity, 0.05, 1) });
    } else if (d.kind === 'tpl') {
      const ctx = { page: p, w, h, m: { l: fr.m.inner, r: fr.m.outer, t: fr.m.t, b: fr.m.b }, c: TC, rgb, deg: degrees, index };
      try {
        if (kind === 'cover') d.tpl.cover.call(d.tpl, ctx); else d.tpl.page.call(d.tpl, ctx);
      } catch (e) { console.warn('template', e); }
    }
    if (!s.wmOnTop) await watermark(p, w, h);
  };
  const watermark = async (p, w, h) => {
    if (s.wmType === 'text' && s.wmText && s.wmText.trim()) {
      const text = cleanLine(s.wmText);
      const diag = Math.hypot(w, h);
      const target = diag * 0.7 * clamp(+s.wmScale, 10, 100) / 100;
      const fs = clamp(target / Math.max(1, T.width(text, s.textFont, true, 1)), 8, 220);
      const tw = T.width(text, s.textFont, true, fs), th = fs * 0.7;
      const a = (+s.wmAngle || 0) * Math.PI / 180;
      const x = w / 2 - (tw / 2 * Math.cos(a) - th / 2 * Math.sin(a));
      const y = h / 2 - (tw / 2 * Math.sin(a) + th / 2 * Math.cos(a));
      await T.draw(p, text, x, y, s.textFont, true, fs, hexToRgb01(s.wmColor), { opacity: clamp(+s.wmOpacity, 0.02, 1), rotate: degrees(+s.wmAngle || 0) });
    } else if (wmRef) {
      const iw = w * 0.8 * clamp(+s.wmScale, 10, 100) / 100;
      const ih = iw * wmRef.height / wmRef.width;
      const a = (+s.wmAngle || 0) * Math.PI / 180;
      const x = w / 2 - (iw / 2 * Math.cos(a) - ih / 2 * Math.sin(a));
      const y = h / 2 - (iw / 2 * Math.sin(a) + ih / 2 * Math.cos(a));
      p.drawImage(wmRef, { x, y, width: iw, height: ih, opacity: clamp(+s.wmOpacity, 0.02, 1), rotate: degrees(+s.wmAngle || 0) });
    }
  };

  let pdfIndex = 0;
  if (s.cover) {
    const { w, h } = portrait;
    const p = doc.addPage([w, h]);
    const cd = pageDesigns.cover || (s.coverDesign && s.coverDesign !== 'same' ? s.coverDesign : s.design);
    pagesMeta.push({ key: 'cover', label: 'Cover', design: cd, own: !!pageDesigns.cover });
    await decorate(p, w, h, portrait, 'cover', pdfIndex++, cd);
    const cw = w * 0.76;
    const ts = clamp(w / 13, 22, 64);
    let y = h * 0.62;
    const tLines = T.wrap(cleanText(s.title || 'My Book'), s.textFont, true, ts, cw);
    // centre the title block around 60% height
    y = h * 0.6 + (tLines.length - 1) * ts * 0.6;
    for (const l of tLines) { await T.draw(p, l, (w - T.width(l, s.textFont, true, ts)) / 2, y, s.textFont, true, ts, C.ink); y -= ts * 1.2; }
    if (s.subtitle) {
      const ss = ts * 0.45;
      y -= ss * 0.4;
      for (const l of T.wrap(cleanText(s.subtitle), s.textFont, false, ss, cw)) { await T.draw(p, l, (w - T.width(l, s.textFont, false, ss)) / 2, y, s.textFont, false, ss, C.heading); y -= ss * 1.35; }
    }
    const bs = clamp(w / 40, 10, 18);
    let by = h * 0.2;
    for (const [txt, bold] of [[s.author, true], [s.institution, false]]) {
      if (!txt) continue;
      for (const l of T.wrap(cleanText(txt), s.textFont, bold, bs, cw)) { await T.draw(p, l, (w - T.width(l, s.textFont, bold, bs)) / 2, by, s.textFont, bold, bs, C.ink); by -= bs * 1.4; }
    }
    if (s.wmOnTop) await watermark(p, w, h);
  }

  if (s.toc && chapters.length) {
    const fr = portrait;
    const size = clamp(baseSizeFor(s, fr), 10, 16);
    const rowH = size * 2;
    const perPage = Math.max(1, Math.floor((fr.top - fr.bottom - size * 4) / rowH));
    for (let i = 0; i < chapters.length; i += perPage) {
      const p = doc.addPage([fr.w, fr.h]);
      const td = pageDesigns.toc || s.design;
      pagesMeta.push({ key: 'toc', label: 'Contents', design: td, own: !!pageDesigns.toc });
      await decorate(p, fr.w, fr.h, fr, 'toc', pdfIndex++, td);
      const left = fr.m.inner + fr.ins;
      let y = fr.top;
      if (i === 0) {
        const ts = size * 1.9;
        await T.draw(p, 'Contents', left, y - ts, s.textFont, true, ts, C.ink);
        p.drawRectangle({ x: left, y: y - ts * 1.55, width: 46, height: 3, color: rgb(...C.accent) });
        y -= ts * 2.4;
      }
      for (const ch of chapters.slice(i, i + perPage)) {
        const num = String(ch.start);
        const nw = T.width(num, s.numFont, s.numBold, size);
        const maxT = fr.contentW - nw - size * 3;
        let title = cleanLine(ch.title);
        while (title.length > 1 && T.width(title, s.textFont, false, size) > maxT) title = title.slice(0, -2) + '…';
        const tw = T.width(title, s.textFont, false, size);
        await T.draw(p, title, left, y - size, s.textFont, false, size, C.ink);
        await T.draw(p, num, left + fr.contentW - nw, y - size, s.numFont, s.numBold, size, C.ink);
        // dot leader
        for (let dx = left + tw + size * 0.8; dx < left + fr.contentW - nw - size * 0.8; dx += size * 0.55) {
          p.drawCircle({ x: dx, y: y - size * 1.05, size: 0.55, color: rgb(...C.muted) });
        }
        y -= rowH;
      }
      if (s.wmOnTop) await watermark(p, fr.w, fr.h);
    }
  }

  // 4. content pages
  const total = contentPages.length;
  let issues = 0;
  for (let i = 0; i < total; i++) {
    if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
    const pg = contentPages[i];
    const fr = pg.fr;
    const p = doc.addPage([fr.w, fr.h]);
    const pageNo = i + 1;
    const isOdd = pageNo % 2 === 1;
    const own = pageDesigns[String(pageNo)];
    const pd = own || pg.chapterDesign || s.design;
    pagesMeta.push({ key: String(pageNo), label: `Page ${pageNo}`, chapter: pg.chapter, design: pd, own: !!own });
    await decorate(p, fr.w, fr.h, fr, 'content', pdfIndex++, pd);
    await drawPageContent(p, pg, s, T, C, pageNo, isOdd);
    // check: everything stayed inside the printable area
    for (const op of pg.ops) {
      const bottom = op.kind === 'row' ? op.y - op.h : op.kind === 'seg' ? op.bottom : op.y - (op.h || 0);
      if (bottom < fr.bottom - 0.5 && op.kind !== 'seg') issues++;
    }
    const left = (s.mirror ? (isOdd ? fr.m.inner : fr.m.outer) : fr.m.inner) + fr.ins;
    const hs = clamp(pg.size * 0.75, 7, 10);
    if (s.runningHeader) {
      const hy = fr.top + fr.headH - hs * 0.5;
      const title = cleanLine(s.title || '');
      const chap = cleanLine(pg.chapter || '');
      const leftTxt = s.mirror && !isOdd ? chap : title;
      const rightTxt = s.mirror && !isOdd ? title : chap;
      if (leftTxt) await T.draw(p, leftTxt, left, hy, s.textFont, false, hs, C.muted);
      if (rightTxt && rightTxt !== leftTxt) await T.draw(p, rightTxt, left + fr.contentW - T.width(rightTxt, s.textFont, false, hs), hy, s.textFont, false, hs, C.muted);
      p.drawLine({ start: { x: left, y: hy - hs * 0.6 }, end: { x: left + fr.contentW, y: hy - hs * 0.6 }, thickness: 0.5, color: rgb(...C.line) });
    }
    if (s.pageNumbers !== 'none') {
      const ns = clamp(pg.size * 0.85, 8, 12);
      const txt = s.pageNumFormat === 'page-n' ? `Page ${pageNo}` : s.pageNumFormat === 'n-of-total' ? `${pageNo} / ${total}` : String(pageNo);
      const tw = T.width(txt, s.numFont, true, ns);
      let x = left + (fr.contentW - tw) / 2;
      if (s.pageNumbers === 'right' || (s.pageNumbers === 'outer' && isOdd)) x = left + fr.contentW - tw;
      if (s.pageNumbers === 'outer' && !isOdd) x = left;
      const ny = fr.bottom - fr.footH + ns * 0.35;
      if (s.tableStyle === 'playful' && s.pageNumbers === 'center') {
        const bw = Math.max(tw + ns * 1.4, ns * 2.2), bh = ns * 1.7;
        p.drawSvgPath(roundRect(x + tw / 2 - bw / 2, fr.h - (ny + ns * 1.2), bw, bh, bh / 2), { x: 0, y: fr.h, color: rgb(...C.accentSoft) });
      }
      await T.draw(p, txt, x, ny, s.numFont, true, ns, C.ink);
    }
    if (s.wmOnTop) await watermark(p, fr.w, fr.h);
  }

  if (issues) report.push({ k: 'warn', t: `${issues} item${issues > 1 ? 's' : ''} touch the bottom margin, try a smaller text size` });
  report.push({ k: 'ok', t: `Checked ${total} content page${total > 1 ? 's' : ''}: margins, padding and alignment set` });
  if (T.canvasCount) report.push({ k: 'info', t: `Malayalam / special text kept sharp as high-resolution text images (${T.canvasCount})` });

  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, report, pages: doc.getPageCount(), contentPages: total, fontSize: chapters[0].plan.size, pagesMeta };
}

// image helper used by the UI: normalise any uploaded picture to png/jpg bytes, max 2600 px
export async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This picture could not be opened. Try a PNG or JPG file.')); i.src = url; });
    const max = 2600;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const isJpg = /jpe?g/i.test(file.type);
    if (k === 1 && (isJpg || file.type === 'image/png')) {
      return { bytes: new Uint8Array(await file.arrayBuffer()), type: isJpg ? 'image/jpeg' : 'image/png', w: img.naturalWidth, h: img.naturalHeight, url: URL.createObjectURL(file) };
    }
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const type = isJpg ? 'image/jpeg' : 'image/png';
    const blob = await new Promise(r => cv.toBlob(r, type, 0.92));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type, w: cv.width, h: cv.height, url: URL.createObjectURL(blob) };
  } finally { URL.revokeObjectURL(url); }
}
