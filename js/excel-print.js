// ടീച്ചർ.Chumi — "Print like Excel": draws each sheet the way Excel prints it
// (page setup, column widths, row heights, fills, borders, fonts, merged cells, pictures, shapes, headers/footers).
import { formatExcel, BUILTIN_FORMATS, isDateFormat } from './excel-format.js';

const EMU_PT = 12700;
const PX_PT = 0.75;
const MDW = 7; // max digit width of Calibri 11 in pixels

/* =================================================================================
   1. Reading the workbook
   ================================================================================= */
const all = (node, tag) => (node ? Array.from(node.getElementsByTagNameNS('*', tag)) : []);
const first = (node, tag) => (node ? node.getElementsByTagNameNS('*', tag)[0] || null : null);
const kids = (node, tag) => (node ? Array.from(node.children).filter(e => !tag || e.localName === tag) : []);
const kid = (node, tag) => kids(node, tag)[0] || null;
const attr = (el, n) => (el ? el.getAttribute(n) : null);
const num = (v, d = 0) => (v == null || v === '' || isNaN(+v) ? d : +v);
const isOn = (el, name = 'val') => !!el && !/^(0|false)$/i.test(attr(el, name) || '1');
function relId(el, name = 'id') {
  if (!el) return null;
  for (const a of Array.from(el.attributes)) if (a.localName === name && a.namespaceURI && /relationships/.test(a.namespaceURI)) return a.value;
  return el.getAttribute('r:' + name);
}
function xml(text) {
  const d = new DOMParser().parseFromString(text, 'application/xml');
  if (d.getElementsByTagName('parsererror').length) throw new Error('Part of the workbook could not be read.');
  return d;
}
function resolvePath(base, target) {
  if (!target) return null;
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
}
const relsPath = (p) => { const i = p.lastIndexOf('/'); return p.slice(0, i) + '/_rels/' + p.slice(i + 1) + '.rels'; };

const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
const PRESET = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080', orange: 'FFA500', purple: '800080', pink: 'FFC0CB', brown: 'A52A2A', cyan: '00FFFF', magenta: 'FF00FF', ltGray: 'D3D3D3', dkGray: 'A9A9A9', navy: '000080', lime: '00FF00', gold: 'FFD700', silver: 'C0C0C0' };

// ---- colours ----
const hex2rgb = (h) => [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
function rgb2hsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  return [h, s, l];
}
function hsl2rgb([h, s, l]) {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
function applyTint(rgb, tint) {
  if (!tint) return rgb;
  const [h, s, l] = rgb2hsl(rgb);
  return hsl2rgb([h, s, tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint]);
}

function parseTheme(doc) {
  const out = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72', minorFont: 'Calibri', majorFont: 'Calibri Light' };
  if (!doc) return out;
  const cs = first(doc, 'clrScheme');
  for (const c of kids(cs)) {
    const v = kid(c, 'srgbClr'), sys = kid(c, 'sysClr');
    if (v) out[c.localName] = attr(v, 'val');
    else if (sys) out[c.localName] = attr(sys, 'lastClr') || (attr(sys, 'val') === 'window' ? 'FFFFFF' : '000000');
  }
  const minor = first(first(doc, 'minorFont'), 'latin'), major = first(first(doc, 'majorFont'), 'latin');
  if (minor) out.minorFont = attr(minor, 'typeface'); if (major) out.majorFont = attr(major, 'typeface');
  return out;
}
const THEME_IDX = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

// spreadsheet colour element → [r,g,b] (0..1) or null
function cellColor(el, theme, fallback = null) {
  if (!el) return fallback;
  if (attr(el, 'auto') === '1' || attr(el, 'auto') === 'true') return fallback;
  let rgb = null;
  const v = attr(el, 'rgb');
  if (v) rgb = hex2rgb(v.length === 8 ? v.slice(2) : v.padStart(6, '0'));
  else if (attr(el, 'theme') != null) rgb = hex2rgb(theme[THEME_IDX[+attr(el, 'theme')]] || '000000');
  else if (attr(el, 'indexed') != null) {
    const i = +attr(el, 'indexed');
    if (i === 64) return fallback || [0, 0, 0];
    if (i === 65) return fallback || [1, 1, 1];
    rgb = hex2rgb(INDEXED[i] || '000000');
  } else return fallback;
  return applyTint(rgb, num(attr(el, 'tint')));
}

// DrawingML colour (inside solidFill etc.) → { rgb, alpha }
const SCHEME_MAP = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
function drawingColor(parent, theme, phClr) {
  if (!parent) return null;
  const c = kids(parent).find(e => /^(srgbClr|schemeClr|sysClr|prstClr|scrgbClr|hslClr)$/.test(e.localName));
  if (!c) return null;
  let rgb;
  if (c.localName === 'srgbClr') rgb = hex2rgb(attr(c, 'val'));
  else if (c.localName === 'sysClr') rgb = hex2rgb(attr(c, 'lastClr') || (attr(c, 'val') === 'window' ? 'FFFFFF' : '000000'));
  else if (c.localName === 'prstClr') rgb = hex2rgb(PRESET[attr(c, 'val')] || '000000');
  else if (c.localName === 'scrgbClr') rgb = [num(attr(c, 'r')) / 100000, num(attr(c, 'g')) / 100000, num(attr(c, 'b')) / 100000];
  else if (c.localName === 'schemeClr') {
    const v = attr(c, 'val');
    if (v === 'phClr' && phClr) rgb = phClr.rgb.slice();
    else rgb = hex2rgb(theme[SCHEME_MAP[v] || v] || '000000');
  } else rgb = [0, 0, 0];
  let alpha = 1;
  for (const m of kids(c)) {
    const val = num(attr(m, 'val')) / 100000;
    if (m.localName === 'lumMod') { const h = rgb2hsl(rgb); h[2] *= val; rgb = hsl2rgb(h); }
    else if (m.localName === 'lumOff') { const h = rgb2hsl(rgb); h[2] = Math.min(1, h[2] + val); rgb = hsl2rgb(h); }
    else if (m.localName === 'shade') rgb = rgb.map(x => x * val);
    else if (m.localName === 'tint') rgb = rgb.map(x => x + (1 - x) * (1 - val));
    else if (m.localName === 'satMod') { const h = rgb2hsl(rgb); h[1] = Math.min(1, h[1] * val); rgb = hsl2rgb(h); }
    else if (m.localName === 'alpha') alpha = val;
  }
  return { rgb: rgb.map(x => Math.max(0, Math.min(1, x))), alpha };
}

function parseStyles(doc, theme) {
  const numFmts = {};
  for (const nf of all(doc, 'numFmt')) numFmts[attr(nf, 'numFmtId')] = attr(nf, 'formatCode');
  const fonts = kids(first(doc, 'fonts'), 'font').map(f => {
    const g = (t) => kid(f, t);
    return {
      name: attr(g('name') || g('rFont'), 'val') || theme.minorFont || 'Calibri',
      sz: num(attr(g('sz'), 'val'), 11), b: isOn(g('b')), i: isOn(g('i')),
      u: g('u') ? (attr(g('u'), 'val') || 'single') !== 'none' : false, strike: isOn(g('strike')),
      color: cellColor(g('color'), theme, [0, 0, 0]),
    };
  });
  const fills = kids(first(doc, 'fills'), 'fill').map(f => {
    const p = kid(f, 'patternFill');
    if (p) {
      const type = attr(p, 'patternType') || (kid(p, 'fgColor') ? 'solid' : 'none');
      if (type === 'none') return null;
      const fg = cellColor(kid(p, 'fgColor'), theme, null), bg = cellColor(kid(p, 'bgColor'), theme, null);
      if (type === 'solid') return fg || [0, 0, 0];
      // patterns: blend foreground into white/background
      const k = { gray125: 0.125, gray0625: 0.0625, lightGray: 0.25, mediumGray: 0.5, darkGray: 0.75 }[type] ?? 0.4;
      const base = bg || [1, 1, 1], ink = fg || [0, 0, 0];
      return base.map((b, i) => b + (ink[i] - b) * k);
    }
    const gr = kid(f, 'gradientFill');
    if (gr) { const st = all(gr, 'stop')[0]; return st ? cellColor(kid(st, 'color'), theme, null) : null; }
    return null;
  });
  const side = (b, n) => {
    const e = kid(b, n);
    const st = e && attr(e, 'style');
    return st && st !== 'none' ? { style: st, color: cellColor(kid(e, 'color'), theme, [0, 0, 0]) } : null;
  };
  const borders = kids(first(doc, 'borders'), 'border').map(b => ({
    l: side(b, 'left') || side(b, 'start'), r: side(b, 'right') || side(b, 'end'), t: side(b, 'top'), b: side(b, 'bottom'),
    d: side(b, 'diagonal'), du: isOn(b, 'diagonalUp') && attr(b, 'diagonalUp') != null, dd: isOn(b, 'diagonalDown') && attr(b, 'diagonalDown') != null,
  }));
  const xfs = kids(first(doc, 'cellXfs'), 'xf').map(x => {
    const al = kid(x, 'alignment');
    const id = num(attr(x, 'numFmtId'));
    return {
      fmt: numFmts[id] != null ? numFmts[id] : BUILTIN_FORMATS[id], fmtId: id,
      font: fonts[num(attr(x, 'fontId'))] || fonts[0],
      fill: fills[num(attr(x, 'fillId'))] || null,
      border: borders[num(attr(x, 'borderId'))] || null,
      h: attr(al, 'horizontal') || 'general', v: attr(al, 'vertical') || 'bottom',
      wrap: isOn(al, 'wrapText') && attr(al, 'wrapText') != null, indent: num(attr(al, 'indent')),
      rot: num(attr(al, 'textRotation')), shrink: isOn(al, 'shrinkToFit') && attr(al, 'shrinkToFit') != null,
    };
  });
  if (!xfs.length) xfs.push({ fmt: 'General', font: fonts[0] || { name: 'Calibri', sz: 11, color: [0, 0, 0] }, fill: null, border: null, h: 'general', v: 'bottom' });
  return { xfs, fonts };
}

function parseRuns(si, theme, fonts) {
  const rs = kids(si, 'r');
  if (!rs.length) { let t = ''; for (const e of kids(si, 't')) t += e.textContent; return t; }
  const runs = [];
  for (const r of rs) {
    const t = kids(r, 't').map(e => e.textContent).join('');
    const p = kid(r, 'rPr');
    let st = null;
    if (p) {
      const g = (n) => kid(p, n);
      st = {
        name: attr(g('rFont') || g('name'), 'val'), sz: g('sz') ? num(attr(g('sz'), 'val')) : null,
        b: g('b') ? isOn(g('b')) : null, i: g('i') ? isOn(g('i')) : null,
        u: g('u') ? (attr(g('u'), 'val') || 'single') !== 'none' : null, strike: g('strike') ? isOn(g('strike')) : null,
        color: g('color') ? cellColor(g('color'), theme, [0, 0, 0]) : null,
      };
    }
    runs.push({ t, st });
  }
  return { runs };
}

const colIdx = (letters) => { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
function parseRef(ref) { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec((ref || '').toUpperCase().trim()); return m ? { c: colIdx(m[1]), r: +m[2] - 1 } : null; }
function parseRange(ref) {
  const [a, b] = ref.split(':'); const p = parseRef(a), q = parseRef(b || a);
  return p && q ? { r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) } : null;
}

export async function parseWorkbookForPrint(buf) {
  const zip = await window.JSZip.loadAsync(buf);
  const text = async (p) => { const f = zip.file(p); return f ? f.async('string') : null; };
  const bin = async (p) => { const f = zip.file(p); return f ? f.async('uint8array') : null; };
  const rels = async (p) => {
    const t = await text(relsPath(p)); const out = {};
    if (t) for (const r of all(xml(t), 'Relationship')) out[attr(r, 'Id')] = { target: resolvePath(p, attr(r, 'Target')), type: attr(r, 'Type') || '', external: attr(r, 'TargetMode') === 'External' };
    return out;
  };
  const wbPath = 'xl/workbook.xml';
  const wb = xml(await text(wbPath));
  const wbRels = await rels(wbPath);
  const themeRel = Object.values(wbRels).find(r => /theme$/.test(r.type));
  const theme = parseTheme(themeRel ? xml(await text(themeRel.target) || '<a/>') : null);
  const stylesRel = Object.values(wbRels).find(r => /styles$/.test(r.type));
  const styles = parseStyles(stylesRel ? xml(await text(stylesRel.target)) : xml('<styleSheet/>'), theme);
  const ssRel = Object.values(wbRels).find(r => /sharedStrings$/.test(r.type));
  const strings = ssRel ? kids(xml(await text(ssRel.target)).documentElement, 'si').map(si => parseRuns(si, theme, styles.fonts)) : [];
  const date1904 = /^(1|true)$/i.test(attr(first(wb, 'workbookPr'), 'date1904') || '');

  const sheetEls = all(wb, 'sheet');
  const printAreas = {};
  for (const dn of all(wb, 'definedName')) {
    if (attr(dn, 'name') !== '_xlnm.Print_Area' || attr(dn, 'localSheetId') == null) continue;
    const first = dn.textContent.split(',')[0].replace(/^.*!/, '').replace(/\$/g, '');
    printAreas[+attr(dn, 'localSheetId')] = parseRange(first);
  }
  const media = new Map();
  const sheets = [];
  for (let si = 0; si < sheetEls.length; si++) {
    const sh = sheetEls[si];
    const state = attr(sh, 'state');
    if (state === 'hidden' || state === 'veryHidden') continue;
    const rel = wbRels[relId(sh)];
    if (!rel || !/worksheet$/.test(rel.type)) continue;
    const t = await text(rel.target);
    if (!t) continue;
    const sheet = parseSheet(xml(t), { styles, strings, theme, date1904 });
    sheet.name = attr(sh, 'name');
    sheet.printArea = printAreas[si] || null;
    // drawings
    const srels = await rels(rel.target);
    const drawEl = first(xml(t), 'drawing');
    sheet.drawings = [];
    if (drawEl) {
      const dr = srels[relId(drawEl)];
      if (dr && dr.target) {
        const dt = await text(dr.target);
        if (dt) {
          const drels = await rels(dr.target);
          sheet.drawings = parseDrawing(xml(dt), drels, theme);
          for (const d of flatten(sheet.drawings)) if (d.kind === 'pic' && d.src && !media.has(d.src)) media.set(d.src, null);
        }
      }
    }
    sheets.push(sheet);
  }
  for (const p of media.keys()) media.set(p, await bin(p));
  return { sheets, theme, styles, media, date1904 };
}

function flatten(list) { const out = []; for (const d of list) { out.push(d); if (d.children) out.push(...flatten(d.children)); } return out; }

function parseSheet(doc, ctx) {
  const { styles, strings, date1904 } = ctx;
  const fmtPr = first(doc, 'sheetFormatPr');
  const defH = num(attr(fmtPr, 'defaultRowHeight'), 15);
  const defColW = attr(fmtPr, 'defaultColWidth') != null ? num(attr(fmtPr, 'defaultColWidth')) : null;
  const baseColW = num(attr(fmtPr, 'baseColWidth'), 8);
  const defColPx = defColW != null ? Math.round(defColW * MDW) : (baseColW * MDW + 5 + 3) & ~7 || 64;
  const cols = []; // {px, hidden, s}
  for (const c of all(doc, 'col')) {
    const a = num(attr(c, 'min'), 1) - 1, b = Math.min(num(attr(c, 'max'), 1) - 1, 16383);
    const w = attr(c, 'width') != null ? Math.round(num(attr(c, 'width')) * MDW) : defColPx;
    const hidden = /^(1|true)$/i.test(attr(c, 'hidden') || '');
    const s = attr(c, 'style') != null ? num(attr(c, 'style')) : null;
    for (let i = a; i <= b && i < 2000; i++) cols[i] = { px: w, hidden, s };
  }
  const rows = []; // {ht, hidden, s}
  const cells = new Map(); // key r*16384+c → cell
  let maxR = -1, maxC = -1;
  let rIdx = -1;
  for (const row of all(doc, 'row')) {
    rIdx = attr(row, 'r') ? num(attr(row, 'r')) - 1 : rIdx + 1;
    const info = {
      ht: attr(row, 'ht') != null ? num(attr(row, 'ht')) : null,
      hidden: /^(1|true)$/i.test(attr(row, 'hidden') || ''),
      s: /^(1|true)$/i.test(attr(row, 'customFormat') || '') ? num(attr(row, 's')) : null,
    };
    rows[rIdx] = info;
    let cIdx = -1;
    for (const c of kids(row, 'c')) {
      const ref = parseRef(attr(c, 'r'));
      cIdx = ref ? ref.c : cIdx + 1;
      const t = attr(c, 't') || 'n';
      const s = num(attr(c, 's'));
      const vEl = kid(c, 'v');
      const v = vEl ? vEl.textContent : null;
      let value = null;
      if (t === 's') value = v != null ? strings[+v] : null;
      else if (t === 'inlineStr') { const is = kid(c, 'is'); value = is ? parseRuns(is, ctx.theme, styles.fonts) : null; }
      else if (t === 'str' || t === 'e') value = v;
      else if (t === 'b') value = v == null ? null : (v === '1' ? 'TRUE' : 'FALSE');
      else if (t === 'd') value = v;
      else if (v != null && v !== '') {
        const n = parseFloat(v);
        const xf = styles.xfs[s] || styles.xfs[0];
        value = isFinite(n) ? { n, text: safeFormat(n, xf.fmt, date1904) } : v;
      }
      if (value === '') value = null;
      cells.set(rIdx * 16384 + cIdx, { r: rIdx, c: cIdx, s, value, t });
      if (rIdx > maxR) maxR = rIdx; if (cIdx > maxC) maxC = cIdx;
    }
  }
  const merges = all(doc, 'mergeCell').map(m => parseRange(attr(m, 'ref'))).filter(Boolean);
  const ps = first(doc, 'pageSetup'), pm = first(doc, 'pageMargins'), po = first(doc, 'printOptions');
  const fitEl = first(first(doc, 'sheetPr'), 'pageSetUpPr');
  const hf = first(doc, 'headerFooter');
  const breaks = (tag) => all(first(doc, tag), 'brk').map(b => num(attr(b, 'id')));
  return {
    defH, defColPx, cols, rows, cells, merges, maxR, maxC,
    setup: {
      paper: num(attr(ps, 'paperSize'), 9), landscape: attr(ps, 'orientation') === 'landscape',
      scale: num(attr(ps, 'scale'), 100), fitToPage: !!fitEl && /^(1|true)$/i.test(attr(fitEl, 'fitToPage') || ''),
      fitW: attr(ps, 'fitToWidth') != null ? num(attr(ps, 'fitToWidth')) : 1, fitH: attr(ps, 'fitToHeight') != null ? num(attr(ps, 'fitToHeight')) : 1,
      firstPage: attr(ps, 'useFirstPageNumber') === '1' ? num(attr(ps, 'firstPageNumber'), 1) : null,
      downThenOver: attr(ps, 'pageOrder') !== 'overThenDown',
      m: {
        l: num(attr(pm, 'left'), 0.7) * 72, r: num(attr(pm, 'right'), 0.7) * 72, t: num(attr(pm, 'top'), 0.75) * 72,
        b: num(attr(pm, 'bottom'), 0.75) * 72, h: num(attr(pm, 'header'), 0.3) * 72, f: num(attr(pm, 'footer'), 0.3) * 72,
      },
      hCenter: /^(1|true)$/i.test(attr(po, 'horizontalCentered') || ''), vCenter: /^(1|true)$/i.test(attr(po, 'verticalCentered') || ''),
      gridLines: /^(1|true)$/i.test(attr(po, 'gridLines') || ''),
      header: hf ? (kid(hf, 'oddHeader') || {}).textContent || '' : '', footer: hf ? (kid(hf, 'oddFooter') || {}).textContent || '' : '',
      rowBreaks: breaks('rowBreaks'), colBreaks: breaks('colBreaks'),
    },
  };
}

function safeFormat(n, fmt, date1904) {
  try { return formatExcel(n, fmt || 'General', date1904); } catch { return String(n); }
}

// ---------------- drawings ----------------
function parseDrawing(doc, drels, theme) {
  const out = [];
  for (const a of kids(doc.documentElement)) {
    const type = a.localName;
    if (!/Anchor$/.test(type)) continue;
    const anchor = { type };
    const pos = (el) => el && { c: num(kid(el, 'col') && kid(el, 'col').textContent), co: num(kid(el, 'colOff') && kid(el, 'colOff').textContent) / EMU_PT, r: num(kid(el, 'row') && kid(el, 'row').textContent), ro: num(kid(el, 'rowOff') && kid(el, 'rowOff').textContent) / EMU_PT };
    anchor.from = pos(kid(a, 'from'));
    anchor.to = pos(kid(a, 'to'));
    const ext = kid(a, 'ext'), p = kid(a, 'pos');
    if (ext) anchor.ext = { w: num(attr(ext, 'cx')) / EMU_PT, h: num(attr(ext, 'cy')) / EMU_PT };
    if (p) anchor.pos = { x: num(attr(p, 'x')) / EMU_PT, y: num(attr(p, 'y')) / EMU_PT };
    let el = kids(a).find(e => /^(pic|sp|cxnSp|grpSp|graphicFrame|AlternateContent)$/.test(e.localName));
    if (el && el.localName === 'AlternateContent') {
      const fb = kid(el, 'Fallback'), ch = kid(el, 'Choice');
      el = kids(fb).find(e => /^(pic|sp|cxnSp|grpSp)$/.test(e.localName)) || kids(ch).find(e => /^(pic|sp|cxnSp|grpSp)$/.test(e.localName)) || null;
    }
    if (!el) continue;
    const item = parseShapeEl(el, drels, theme);
    if (item) { item.anchor = anchor; out.push(item); }
  }
  return out;
}

function xfrmOf(spPr) {
  const x = kid(spPr, 'xfrm');
  if (!x) return null;
  const off = kid(x, 'off'), ext = kid(x, 'ext'), cho = kid(x, 'chOff'), che = kid(x, 'chExt');
  return {
    x: num(attr(off, 'x')) / EMU_PT, y: num(attr(off, 'y')) / EMU_PT, w: num(attr(ext, 'cx')) / EMU_PT, h: num(attr(ext, 'cy')) / EMU_PT,
    rot: num(attr(x, 'rot')) / 60000, flipH: attr(x, 'flipH') === '1', flipV: attr(x, 'flipV') === '1',
    ch: cho ? { x: num(attr(cho, 'x')) / EMU_PT, y: num(attr(cho, 'y')) / EMU_PT, w: num(attr(che, 'cx')) / EMU_PT, h: num(attr(che, 'cy')) / EMU_PT } : null,
  };
}

function parseFillLine(spPr, styleEl, theme, isLine) {
  // fill
  let fill;
  const nf = kid(spPr, 'noFill'), sf = kid(spPr, 'solidFill'), gf = kid(spPr, 'gradFill'), pf = kid(spPr, 'pattFill');
  if (nf) fill = null;
  else if (sf) fill = drawingColor(sf, theme);
  else if (gf) { const gs = all(gf, 'gs'); fill = gs.length ? drawingColor(gs[Math.floor(gs.length / 2)], theme) : null; }
  else if (pf) fill = drawingColor(kid(pf, 'fgClr'), theme);
  else if (kid(spPr, 'blipFill')) fill = null;
  else {
    const fr = kid(styleEl, 'fillRef');
    fill = fr && num(attr(fr, 'idx')) > 0 && !isLine ? drawingColor(fr, theme) : null;
  }
  // line
  let line = null;
  const ln = kid(spPr, 'ln');
  const lr = kid(styleEl, 'lnRef');
  const refColor = lr && num(attr(lr, 'idx')) > 0 ? drawingColor(lr, theme) : null;
  const refW = lr ? [0, 0.75, 1, 1.5][Math.min(3, num(attr(lr, 'idx')))] : 0;
  if (ln) {
    if (!kid(ln, 'noFill')) {
      const c = kid(ln, 'solidFill') ? drawingColor(kid(ln, 'solidFill'), theme) : (kid(ln, 'gradFill') ? drawingColor(all(kid(ln, 'gradFill'), 'gs')[0], theme) : refColor);
      if (c) {
        const w = attr(ln, 'w') != null ? num(attr(ln, 'w')) / EMU_PT : (refW || 0.75);
        const dash = attr(kid(ln, 'prstDash'), 'val') || 'solid';
        line = { ...c, w: Math.max(0.25, w), dash, head: !!kid(ln, 'headEnd') && attr(kid(ln, 'headEnd'), 'type') !== 'none' && attr(kid(ln, 'headEnd'), 'type') != null, tail: !!kid(ln, 'tailEnd') && attr(kid(ln, 'tailEnd'), 'type') !== 'none' && attr(kid(ln, 'tailEnd'), 'type') != null };
      }
    }
  } else if (refColor) line = { ...refColor, w: refW || 0.75, dash: 'solid' };
  return { fill, line };
}

function parseTextBody(tx, styleEl, theme) {
  if (!tx) return null;
  const body = kid(tx, 'bodyPr');
  const fontRef = kid(styleEl, 'fontRef');
  const defColor = fontRef ? drawingColor(fontRef, theme) : null;
  const paras = [];
  for (const p of kids(tx, 'p')) {
    const ppr = kid(p, 'pPr');
    const algn = attr(ppr, 'algn') || 'l';
    const runs = [];
    for (const r of kids(p)) {
      if (r.localName !== 'r' && r.localName !== 'fld') { if (r.localName === 'br') runs.push({ t: '\n' }); continue; }
      const rpr = kid(r, 'rPr');
      const t = (kid(r, 't') || {}).textContent || '';
      const sf = kid(rpr, 'solidFill');
      runs.push({ t, sz: attr(rpr, 'sz') ? num(attr(rpr, 'sz')) / 100 : null, b: attr(rpr, 'b') === '1', i: attr(rpr, 'i') === '1', u: attr(rpr, 'u') && attr(rpr, 'u') !== 'none', color: sf ? drawingColor(sf, theme) : null, font: attr(kid(rpr, 'latin'), 'typeface') });
    }
    const end = kid(p, 'endParaRPr');
    paras.push({ algn, runs, sz: end && attr(end, 'sz') ? num(attr(end, 'sz')) / 100 : null });
  }
  if (!paras.some(p => p.runs.some(r => r.t && r.t.trim()))) return null;
  return {
    paras, defColor,
    anchor: attr(body, 'anchor') || 't', wrap: attr(body, 'wrap') !== 'none', vert: attr(body, 'vert'),
    ins: { l: num(attr(body, 'lIns'), 91440) / EMU_PT, r: num(attr(body, 'rIns'), 91440) / EMU_PT, t: num(attr(body, 'tIns'), 45720) / EMU_PT, b: num(attr(body, 'bIns'), 45720) / EMU_PT },
  };
}

function parseShapeEl(el, drels, theme) {
  const n = el.localName;
  if (n === 'grpSp') {
    const gpr = kid(el, 'grpSpPr');
    const children = kids(el).filter(e => /^(pic|sp|cxnSp|grpSp)$/.test(e.localName)).map(e => parseShapeEl(e, drels, theme)).filter(Boolean);
    return { kind: 'group', xfrm: xfrmOf(gpr), children };
  }
  if (n === 'pic') {
    const blip = first(kid(el, 'blipFill'), 'blip');
    const rid = relId(blip, 'embed') || relId(blip, 'link');
    const rel = rid ? drels[rid] : null;
    const src = rel && !rel.external ? rel.target : null;
    const sr = first(kid(el, 'blipFill'), 'srcRect');
    const crop = sr ? { l: num(attr(sr, 'l')) / 100000, t: num(attr(sr, 't')) / 100000, r: num(attr(sr, 'r')) / 100000, b: num(attr(sr, 'b')) / 100000 } : null;
    const spPr = kid(el, 'spPr');
    const ln = kid(spPr, 'ln');
    const line = ln && !kid(ln, 'noFill') && kid(ln, 'solidFill') ? { ...drawingColor(kid(ln, 'solidFill'), theme), w: attr(ln, 'w') ? num(attr(ln, 'w')) / EMU_PT : 0.75, dash: 'solid' } : null;
    const alphaMod = first(blip, 'alphaModFix');
    return { kind: 'pic', src, crop, xfrm: xfrmOf(spPr), line, alpha: alphaMod ? num(attr(alphaMod, 'amt'), 100000) / 100000 : 1 };
  }
  if (n === 'sp' || n === 'cxnSp') {
    const spPr = kid(el, 'spPr');
    const styleEl = kid(el, 'style');
    const pg = kid(spPr, 'prstGeom');
    const cg = kid(spPr, 'custGeom');
    let prst = pg ? attr(pg, 'prst') : (cg ? 'cust' : 'rect');
    const adj = {};
    if (pg) for (const gd of all(kid(pg, 'avLst'), 'gd')) { const m = /val\s+(-?\d+)/.exec(attr(gd, 'fmla') || ''); if (m) adj[attr(gd, 'name')] = +m[1]; }
    let paths = null;
    if (cg) {
      paths = all(kid(cg, 'pathLst'), 'path').map(p => ({
        w: num(attr(p, 'w')), h: num(attr(p, 'h')), fill: attr(p, 'fill') !== 'none', stroke: attr(p, 'stroke') !== '0' && attr(p, 'stroke') !== 'false',
        cmds: kids(p).map(c => ({ op: c.localName, pts: all(c, 'pt').map(pt => [num(attr(pt, 'x')), num(attr(pt, 'y'))]), wR: num(attr(c, 'wR')), hR: num(attr(c, 'hR')), stAng: num(attr(c, 'stAng')), swAng: num(attr(c, 'swAng')) })),
      }));
    }
    const isLine = n === 'cxnSp' || /^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/.test(prst);
    const { fill, line } = parseFillLine(spPr, styleEl, theme, isLine);
    const text = parseTextBody(kid(el, 'txBody'), styleEl, theme);
    return { kind: 'shape', prst, adj, paths, fill, line, text, xfrm: xfrmOf(spPr), isLine };
  }
  return null;
}

/* =================================================================================
   2. Geometry helpers
   ================================================================================= */
const PAPER = { 1: [612, 792], 3: [792, 1224], 5: [612, 1008], 8: [841.89, 1190.55], 9: [595.28, 841.89], 11: [419.53, 595.28], 12: [708.66, 1000.63], 13: [515.91, 728.5], 34: [498.9, 708.66], 70: [297.64, 419.53] };

function sheetGeometry(sh, range) {
  const colPt = (c) => { const ci = sh.cols[c]; return ci ? (ci.hidden ? 0 : ci.px * PX_PT) : sh.defColPx * PX_PT; };
  const rowPt = (r) => { const ri = sh.rows[r]; return ri ? (ri.hidden ? 0 : (ri.ht != null ? ri.ht : sh.defH)) : sh.defH; };
  const maxC = Math.max(range.c2 + 1, 0), maxR = Math.max(range.r2 + 1, 0);
  const colX = [0], rowY = [0];
  // columns/rows before the range are needed for drawing anchors too, so build from 0
  const needC = Math.max(maxC + 1, ...sh.drawings.map(d => (d.anchor.to ? d.anchor.to.c + 2 : d.anchor.from ? d.anchor.from.c + 2 : 0)));
  const needR = Math.max(maxR + 1, ...sh.drawings.map(d => (d.anchor.to ? d.anchor.to.r + 2 : d.anchor.from ? d.anchor.from.r + 2 : 0)));
  for (let c = 0; c < needC + 40; c++) colX.push(colX[c] + colPt(c));
  for (let r = 0; r < needR + 40; r++) rowY.push(rowY[r] + rowPt(r));
  const X = (c, off = 0) => (c < colX.length ? colX[c] : colX[colX.length - 1] + (c - colX.length + 1) * sh.defColPx * PX_PT) + off;
  const Y = (r, off = 0) => (r < rowY.length ? rowY[r] : rowY[rowY.length - 1] + (r - rowY.length + 1) * sh.defH) + off;
  return { colPt, rowPt, X, Y };
}

function anchorRect(a, G) {
  if (a.type === 'absoluteAnchor' && a.pos) return { x: a.pos.x, y: a.pos.y, w: a.ext ? a.ext.w : 0, h: a.ext ? a.ext.h : 0 };
  const x = G.X(a.from.c, a.from.co), y = G.Y(a.from.r, a.from.ro);
  if (a.type === 'oneCellAnchor' || !a.to) return { x, y, w: a.ext ? a.ext.w : 0, h: a.ext ? a.ext.h : 0 };
  return { x, y, w: G.X(a.to.c, a.to.co) - x, h: G.Y(a.to.r, a.to.ro) - y };
}

// cells that print: a value, a visible fill or border, merged ranges and pictures
function usedRange(sh, styles) {
  let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
  const add = (r, c) => { if (r < r1) r1 = r; if (r > r2) r2 = r; if (c < c1) c1 = c; if (c > c2) c2 = c; };
  for (const cell of sh.cells.values()) {
    const xf = styles.xfs[cell.s];
    const b = xf && xf.border;
    if (cell.value != null || (xf && (xf.fill || (b && (b.l || b.r || b.t || b.b))))) add(cell.r, cell.c);
  }
  for (const m of sh.merges) { add(m.r1, m.c1); add(m.r2, m.c2); }
  const G = sheetGeometry(sh, { r2: Math.max(0, r2), c2: Math.max(0, c2) });
  for (const d of sh.drawings) {
    const a = d.anchor;
    if (a.from) { add(a.from.r, a.from.c); }
    if (a.to) add(a.to.ro > 0.5 ? a.to.r : Math.max(0, a.to.r - 1), a.to.co > 0.5 ? a.to.c : Math.max(0, a.to.c - 1));
    else if (a.from && a.ext) {
      const rect = anchorRect(a, G);
      let c = a.from.c, r = a.from.r;
      while (G.X(c + 1) < rect.x + rect.w && c < 500) c++;
      while (G.Y(r + 1) < rect.y + rect.h && r < 5000) r++;
      add(r, c);
    }
  }
  if (r2 < 0) return null;
  return { r1: 0, c1: 0, r2, c2 }; // Excel starts printing at A1 when no print area is set
}

/* =================================================================================
   3. Drawing helpers (raw PDF operators)
   ================================================================================= */
function ops() { return window.PDFLib; }

function lineDash(style, w) {
  switch (style) {
    case 'dotted': case 'sysDot': return [w, w];
    case 'dashed': case 'dash': case 'sysDash': case 'mediumDashed': return [w * 3, w * 1.5];
    case 'dashDot': case 'mediumDashDot': case 'sysDashDot': case 'lgDashDot': return [w * 4, w * 1.5, w, w * 1.5];
    case 'dashDotDot': case 'mediumDashDotDot': case 'lgDashDotDot': case 'sysDashDotDot': return [w * 4, w * 1.5, w, w * 1.5, w, w * 1.5];
    case 'slantDashDot': return [w * 5, w, w * 2, w];
    case 'hair': return [0.6, 0.6];
    case 'lgDash': return [w * 8, w * 3];
    default: return [];
  }
}
const BORDER_W = { hair: 0.5, thin: 1, dotted: 1, dashed: 1, dashDot: 1, dashDotDot: 1, medium: 2, mediumDashed: 2, mediumDashDot: 2, mediumDashDotDot: 2, slantDashDot: 2, thick: 3, double: 1 };

/* =================================================================================
   4. Rendering
   ================================================================================= */
const SERIF = /times|cambria|georgia|garamond|book antiqua|palatino|century schoolbook|bookman|baskerville|algerian|serif|constantia|rockwell|elephant|bodoni/i;
const MONO = /courier|consolas|mono|lucida console/i;
function fontInfo(name = 'Calibri', b, i) {
  const fam = MONO.test(name) ? 'courier' : SERIF.test(name) ? 'times' : 'helvetica';
  // width of the real font compared with the PDF base font
  let sq = 1;
  if (/calibri|aptos|carlito/i.test(name)) sq = 0.88;
  else if (/arial black/i.test(name)) { sq = 1.12; b = true; }
  else if (/arial narrow|condensed/i.test(name)) sq = 0.82;
  else if (/verdana/i.test(name)) sq = 1.1;
  else if (/tahoma|segoe/i.test(name)) sq = 0.96;
  else if (/century gothic/i.test(name)) sq = 1.08;
  else if (/comic/i.test(name)) sq = 1.02;
  else if (/cambria/i.test(name)) sq = 0.98;
  else if (/algerian/i.test(name)) { sq = 1.05; b = true; }
  else if (/impact|bebas|oswald/i.test(name)) { sq = 0.8; b = true; }
  const upper = /algerian|bebas|stencil/i.test(name);
  return { fam, b: !!b, i: !!i, sq, upper, css: name };
}

class TextDraw {
  constructor(doc, fonts) { this.doc = doc; this.fonts = fonts; this.enc = new Map(); this.imgs = new Map(); this.canvasCount = 0; }
  font(fi) { return this.fonts[fi.fam + (fi.b ? 'B' : '') + (fi.i ? 'I' : '')] || this.fonts[fi.fam]; }
  ok(text, f) {
    const k = f.name + '|' + text;
    let v = this.enc.get(k);
    if (v === undefined) { try { f.encodeText(text); v = true; } catch { v = false; } this.enc.set(k, v); }
    return v;
  }
  width(text, fi, size) {
    if (!text) return 0;
    const f = this.font(fi);
    if (this.ok(text, f)) {
      // pdf-lib adds kerning when measuring but draws without it: sum plain glyph widths instead
      let cw = this.cw || (this.cw = new Map()), t = 0;
      for (const ch of text) {
        const key = f.name + ch;
        let v = cw.get(key);
        if (v === undefined) { v = f.widthOfTextAtSize(ch, 1000); cw.set(key, v); }
        t += v;
      }
      return t / 1000 * size * fi.sq;
    }
    const g = this.ctx || (this.ctx = document.createElement('canvas').getContext('2d'));
    g.font = `${fi.i ? 'italic ' : ''}${fi.b ? 700 : 400} 100px "${fi.css}", "Noto Sans Malayalam", "Nirmala UI", sans-serif`;
    return g.measureText(text).width / 100 * size;
  }
  async draw(page, text, x, y, fi, size, color, opts = {}) {
    if (!text) return;
    const P = ops();
    const f = this.font(fi);
    if (this.ok(text, f)) {
      const sq = Math.round(fi.sq * 100);
      if (sq !== 100) page.pushOperators(P.setCharacterSqueeze(sq));
      page.drawText(text, { x, y, size, font: f, color: P.rgb(...color), rotate: opts.rotate ? P.degrees(opts.rotate) : undefined, opacity: opts.opacity });
      if (sq !== 100) page.pushOperators(P.setCharacterSqueeze(100));
      return;
    }
    const key = [text, fi.css, fi.b, fi.i, size.toFixed(2), color.join(',')].join('|');
    let im = this.imgs.get(key);
    if (!im) {
      const wPt = this.width(text, fi, size) + size * 0.2, hPt = size * 1.5;
      const scale = Math.max(1, Math.min(5, 2400 / wPt));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(wPt * scale)); cv.height = Math.max(1, Math.ceil(hPt * scale));
      const g = cv.getContext('2d');
      g.font = `${fi.i ? 'italic ' : ''}${fi.b ? 700 : 400} ${size * scale}px "${fi.css}", "Noto Sans Malayalam", "Nirmala UI", sans-serif`;
      g.fillStyle = `rgb(${color.map(v => Math.round(v * 255)).join(',')})`;
      g.fillText(text, size * 0.1 * scale, size * 1.1 * scale);
      const bytes = await new Promise(r => cv.toBlob(b => b.arrayBuffer().then(r), 'image/png'));
      cv.width = 0;
      im = { ref: await this.doc.embedPng(bytes), w: wPt, h: hPt };
      this.imgs.set(key, im); this.canvasCount++;
    }
    const rot = opts.rotate || 0;
    const dx = -size * 0.1, dy = -size * 0.4;
    const a = rot * Math.PI / 180;
    page.drawImage(im.ref, { x: x + dx * Math.cos(a) - dy * Math.sin(a), y: y + dx * Math.sin(a) + dy * Math.cos(a), width: im.w, height: im.h, rotate: rot ? P.degrees(rot) : undefined, opacity: opts.opacity });
  }
}

// processed (smaller) picture bytes are kept between rebuilds
const PIC_CACHE = new Map();
async function preparePicture(path, bytes) {
  if (PIC_CACHE.has(path)) return PIC_CACHE.get(path);
  const p = (async () => {
    const ext = (path.split('.').pop() || '').toLowerCase();
    if (!/^(png|jpe?g|gif|bmp|webp|tiff?|svg)$/.test(ext)) return null; // EMF/WMF can't be drawn in a browser
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50, isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if ((isPng || isJpg) && bytes.length < 600 * 1024) return { bytes, type: isPng ? 'png' : 'jpg' };
    // big or other picture types: redraw smaller in the browser
    const mime = ext === 'svg' ? 'image/svg+xml' : isPng ? 'image/png' : isJpg ? 'image/jpeg' : 'image/' + ext;
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const max = 1800;
      const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round((img.naturalWidth || 300) * k)); cv.height = Math.max(1, Math.round((img.naturalHeight || 300) * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const keepAlpha = !isJpg;
      const blob = await new Promise(r => cv.toBlob(r, keepAlpha ? 'image/png' : 'image/jpeg', 0.9));
      const out = { bytes: new Uint8Array(await blob.arrayBuffer()), type: keepAlpha ? 'png' : 'jpg' };
      cv.width = 0;
      return out;
    } catch { return isPng || isJpg ? { bytes, type: isPng ? 'png' : 'jpg' } : null; }
    finally { URL.revokeObjectURL(url); }
  })();
  PIC_CACHE.set(path, p);
  return p;
}

// --- preset shapes as polygons / paths in a w×h box (top-left origin) ---
function ellipsePts(cx, cy, rx, ry, n = 48) { const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return out; }
function presetPaths(prst, w, h, adj) {
  const A = (n, d) => (adj[n] != null ? adj[n] : d) / 100000;
  const ss = Math.min(w, h);
  switch (prst) {
    case 'ellipse': case 'flowChartConnector': case 'circle': return [{ pts: ellipsePts(w / 2, h / 2, w / 2, h / 2), close: true }];
    case 'flowChartSort': return [{ pts: [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], close: true }, { pts: [[0, h / 2], [w, h / 2]], close: false, strokeOnly: true }];
    case 'diamond': case 'flowChartDecision': return [{ pts: [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], close: true }];
    case 'triangle': case 'flowChartExtract': return [{ pts: [[w * A('adj', 50000), 0], [w, h], [0, h]], close: true }];
    case 'flowChartMerge': return [{ pts: [[0, 0], [w, 0], [w / 2, h]], close: true }];
    case 'rtTriangle': return [{ pts: [[0, 0], [w, h], [0, h]], close: true }];
    case 'parallelogram': { const o = ss * A('adj', 25000); return [{ pts: [[o, 0], [w, 0], [w - o, h], [0, h]], close: true }]; }
    case 'trapezoid': { const o = ss * A('adj', 25000); return [{ pts: [[o, 0], [w - o, 0], [w, h], [0, h]], close: true }]; }
    case 'pentagon': case 'homePlate': { const o = ss * A('adj', 50000); return [{ pts: [[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h]], close: true }]; }
    case 'hexagon': { const o = ss * A('adj', 25000); return [{ pts: [[o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h], [0, h / 2]], close: true }]; }
    case 'octagon': { const o = ss * A('adj', 29289); return [{ pts: [[o, 0], [w - o, 0], [w, o], [w, h - o], [w - o, h], [o, h], [0, h - o], [0, o]], close: true }]; }
    case 'plus': case 'mathPlus': { const o = ss * A('adj', 25000); return [{ pts: [[o, 0], [w - o, 0], [w - o, o], [w, o], [w, h - o], [w - o, h - o], [w - o, h], [o, h], [o, h - o], [0, h - o], [0, o], [o, o]].map(([x, y]) => [x, y]), close: true }]; }
    case 'star4': case 'star5': case 'star6': case 'star8': case 'star10': case 'star12': case 'star16': case 'star24': {
      const n = +prst.slice(4);
      const inner = n === 5 ? A('adj', 19098) * 2 : A('adj', n === 4 ? 12500 : n === 6 ? 28868 : 38250) * 2;
      const pts = [];
      for (let i = 0; i < n * 2; i++) {
        const a = -Math.PI / 2 + (Math.PI / n) * i;
        const k = i % 2 ? inner : 1;
        pts.push([w / 2 + (w / 2) * k * Math.cos(a), h / 2 + (h / 2) * k * Math.sin(a)]);
      }
      if (n === 5) { const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1])); const ky = h / (maxY - minY); pts.forEach(p => { p[1] = (p[1] - minY) * ky; }); }
      return [{ pts, close: true }];
    }
    case 'heart': {
      const pts = [];
      for (let i = 0; i <= 60; i++) { const t = (i / 60) * Math.PI * 2; const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); pts.push([w / 2 + (x / 17) * (w / 2), h * 0.42 - (y / 17) * (h * 0.58)]); }
      return [{ pts, close: true }];
    }
    case 'roundRect': case 'flowChartAlternateProcess': {
      const r = ss * A('adj', 16667); const pts = [];
      const arc = (cx, cy, a0) => { for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
      arc(w - r, r, -Math.PI / 2); arc(w - r, h - r, 0); arc(r, h - r, Math.PI / 2); arc(r, r, Math.PI);
      return [{ pts, close: true }];
    }
    case 'wedgeEllipseCallout': case 'wedgeRoundRectCallout': case 'wedgeRectCallout': case 'cloudCallout': {
      const tx = w * (0.5 + A('adj1', -20833)), ty = h * (0.5 + A('adj2', 62500));
      const ang = Math.atan2((ty - h / 2) / h, (tx - w / 2) / w);
      const p1 = [w / 2 + (w / 2) * Math.cos(ang - 0.25), h / 2 + (h / 2) * Math.sin(ang - 0.25)], p2 = [w / 2 + (w / 2) * Math.cos(ang + 0.25), h / 2 + (h / 2) * Math.sin(ang + 0.25)];
      const body = prst === 'wedgeEllipseCallout' || prst === 'cloudCallout' ? ellipsePts(w / 2, h / 2, w / 2, h / 2) : [[0, 0], [w, 0], [w, h], [0, h]];
      return [{ pts: [p1, [tx, ty], p2], close: true }, { pts: body, close: true }];
    }
    case 'line': case 'straightConnector1': case 'bentConnector2': case 'bentConnector3': case 'curvedConnector3':
      return [{ pts: [[0, 0], [w, h]], close: false }];
    case 'smileyFace': return [{ pts: ellipsePts(w / 2, h / 2, w / 2, h / 2), close: true }, { pts: ellipsePts(w * 0.35, h * 0.38, w * 0.05, h * 0.05), close: true }, { pts: ellipsePts(w * 0.65, h * 0.38, w * 0.05, h * 0.05), close: true }, { pts: [[w * 0.3, h * 0.65], [w * 0.4, h * 0.73], [w * 0.5, h * 0.76], [w * 0.6, h * 0.73], [w * 0.7, h * 0.65]], close: false, strokeOnly: true }];
    case 'cloud': { const pts = []; for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; const k = 1 + 0.08 * Math.cos(a * 8); pts.push([w / 2 + (w / 2) * 0.92 * k * Math.cos(a), h / 2 + (h / 2) * 0.92 * k * Math.sin(a)]); } return [{ pts, close: true }]; }
    default: return [{ pts: [[0, 0], [w, 0], [w, h], [0, h]], close: true }];
  }
}

function customPaths(paths, w, h) {
  const out = [];
  for (const p of paths) {
    const kx = p.w ? w / p.w : 1, ky = p.h ? h / p.h : 1;
    let cur = null, last = [0, 0];
    const flush = () => { if (cur && cur.pts.length) out.push(cur); cur = null; };
    for (const c of p.cmds) {
      if (c.op === 'moveTo') { flush(); cur = { pts: [[c.pts[0][0] * kx, c.pts[0][1] * ky]], close: false, noFill: !p.fill, noStroke: !p.stroke }; last = cur.pts[0]; }
      else if (c.op === 'lnTo' && cur) { const q = [c.pts[0][0] * kx, c.pts[0][1] * ky]; cur.pts.push(q); last = q; }
      else if ((c.op === 'cubicBezTo' || c.op === 'quadBezTo') && cur) {
        const pts = c.pts.map(q => [q[0] * kx, q[1] * ky]);
        const [p0, p1, p2, p3] = c.op === 'cubicBezTo' ? [last, ...pts] : [last, pts[0], pts[0], pts[1]];
        for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; cur.pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); }
        last = cur.pts[cur.pts.length - 1];
      } else if (c.op === 'arcTo' && cur) {
        const wR = c.wR * kx, hR = c.hR * ky, st = c.stAng / 60000 * Math.PI / 180, sw = c.swAng / 60000 * Math.PI / 180;
        const cx = last[0] - wR * Math.cos(st), cy = last[1] - hR * Math.sin(st);
        for (let i = 1; i <= 12; i++) { const a = st + sw * i / 12; cur.pts.push([cx + wR * Math.cos(a), cy + hR * Math.sin(a)]); }
        last = cur.pts[cur.pts.length - 1];
      } else if (c.op === 'close' && cur) { cur.close = true; flush(); }
    }
    flush();
  }
  return out;
}

export async function renderWorkbookPages(doc, wbp, chosen, opts) {
  // chosen: [{ sheet (print sheet object), title, design }]
  const P = ops();
  const { rgb } = P;
  const T = new TextDraw(doc, opts.fonts);
  const styles = wbp.styles;
  const embedded = new Map();
  const report = [];
  const pages = [];
  let skippedPics = 0, charts = 0;

  const embedPic = async (src) => {
    if (embedded.has(src)) return embedded.get(src);
    const raw = wbp.media.get(src);
    let ref = null;
    if (raw) {
      const pic = await preparePicture(src, raw);
      if (pic) { try { ref = pic.type === 'png' ? await doc.embedPng(pic.bytes) : await doc.embedJpg(pic.bytes); } catch { ref = null; } }
    }
    if (!ref) skippedPics++;
    embedded.set(src, ref);
    return ref;
  };

  // 1. plan all pages first (so &N / page totals are known)
  const plans = [];
  for (const ch of chosen) {
    const sh = ch.sheet;
    const range = sh.printArea || usedRange(sh, styles);
    if (!range) { report.push({ k: 'info', t: `${ch.title}: nothing to print, skipped` }); continue; }
    const G = sheetGeometry(sh, range);
    let [pw, ph] = PAPER[sh.setup.paper] || PAPER[9];
    if (sh.setup.landscape) [pw, ph] = [ph, pw];
    const m = sh.setup.m;
    const availW = Math.max(36, pw - m.l - m.r), availH = Math.max(36, ph - m.t - m.b);
    const totW = G.X(range.c2 + 1) - G.X(range.c1), totH = G.Y(range.r2 + 1) - G.Y(range.r1);
    let k = sh.setup.scale / 100;
    if (sh.setup.fitToPage) {
      const fw = sh.setup.fitW, fh = sh.setup.fitH;
      k = Math.min(fw > 0 ? (availW * fw) / totW : 10, fh > 0 ? (availH * fh) / totH : 10, 4);
    }
    if (opts.fitOne) k = Math.min(availW / totW, availH / totH, Math.max(k, 0.1));
    k = Math.max(0.1, Math.min(k, 4));
    // page breaks
    const split = (a, b, size, avail, manual) => {
      const out = []; let start = a, used = 0;
      for (let i = a; i <= b; i++) {
        const s = size(i) * k;
        if (i > start && (used + s > avail + 0.01 || manual.includes(i))) { out.push([start, i - 1]); start = i; used = 0; }
        used += s;
      }
      out.push([start, b]);
      return out;
    };
    const colRanges = split(range.c1, range.c2, G.colPt, availW, sh.setup.colBreaks.map(x => x));
    const rowRanges = split(range.r1, range.r2, G.rowPt, availH, sh.setup.rowBreaks.map(x => x));
    const order = [];
    if (sh.setup.downThenOver) { for (const cr of colRanges) for (const rr of rowRanges) order.push([rr, cr]); }
    else { for (const rr of rowRanges) for (const cr of colRanges) order.push([rr, cr]); }
    plans.push({ ch, sh, range, G, pw, ph, k, availW, availH, order });
    if (opts.fitOne && order.length > 1) report.push({ k: 'info', t: `${ch.title}: still needs ${order.length} pages` });
  }
  const totalPages = plans.reduce((a, p) => a + p.order.length, 0);
  let pageNo = 0;

  for (const plan of plans) {
    const { ch, sh, G, pw, ph, k } = plan;
    const m = sh.setup.m;
    let sheetPage = 0;
    // merged ranges lookup
    const mergeAt = new Map(), inMerge = new Map();
    for (const mg of sh.merges) {
      mergeAt.set(mg.r1 * 16384 + mg.c1, mg);
      for (let r = mg.r1; r <= mg.r2; r++) for (let c = mg.c1; c <= mg.c2; c++) inMerge.set(r * 16384 + c, mg);
    }
    const xfOf = (r, c) => {
      const cell = sh.cells.get(r * 16384 + c);
      if (cell) return styles.xfs[cell.s] || styles.xfs[0];
      const ri = sh.rows[r];
      if (ri && ri.s != null) return styles.xfs[ri.s] || styles.xfs[0];
      const ci = sh.cols[c];
      if (ci && ci.s != null) return styles.xfs[ci.s] || styles.xfs[0];
      return null;
    };
    const hasValue = (r, c) => { const cell = sh.cells.get(r * 16384 + c); return !!(cell && cell.value != null) || inMerge.has(r * 16384 + c); };

    for (const [[r0, r1], [c0, c1]] of plan.order) {
      pageNo++; sheetPage++;
      const page = doc.addPage([pw, ph]);
      const pageW = (G.X(c1 + 1) - G.X(c0)) * k, pageH = (G.Y(r1 + 1) - G.Y(r0)) * k;
      const ox = m.l + (sh.setup.hCenter ? Math.max(0, (plan.availW - pageW) / 2) : 0);
      const oy = m.t + (sh.setup.vCenter ? Math.max(0, (plan.availH - pageH) / 2) : 0);
      // sheet point → PDF point
      const PX = (x) => ox + (x - G.X(c0)) * k;
      const PY = (y) => ph - (oy + (y - G.Y(r0)) * k);
      const key = String(pageNo);
      const own = opts.pageDesigns && opts.pageDesigns[key];
      const design = own || ch.design || opts.bookDesign;
      pages.push({ key, label: `${ch.title}${plan.order.length > 1 ? ` (${sheetPage})` : ''}`, chapter: ch.title, design, own: !!own });
      if (opts.decorate) await opts.decorate(page, pw, ph, design, pageNo - 1, m);

      const clipX0 = PX(G.X(c0)), clipX1 = PX(G.X(c1 + 1)), clipYTop = PY(G.Y(r0)), clipYBot = PY(G.Y(r1 + 1));
      const pushClip = (x0, y0, x1, y1) => page.pushOperators(P.pushGraphicsState(), P.rectangle(x0, y0, x1 - x0, y1 - y0), P.clip(), P.endPath());
      const popClip = () => page.pushOperators(P.popGraphicsState());

      // ---- fills ----
      for (let r = r0; r <= r1; r++) {
        if (!G.rowPt(r)) continue;
        for (let c = c0; c <= c1; c++) {
          if (!G.colPt(c)) continue;
          const xf = xfOf(r, c);
          let fillC = xf && xf.fill;
          const mg = inMerge.get(r * 16384 + c);
          if (mg) { const tl = xfOf(mg.r1, mg.c1); fillC = tl && tl.fill; }
          if (!fillC) continue;
          const x = PX(G.X(c)), y = PY(G.Y(r + 1));
          page.pushOperators(P.setFillingRgbColor(...fillC), P.rectangle(x, y, G.colPt(c) * k, G.rowPt(r) * k), P.fill());
        }
      }
      if (sh.setup.gridLines) {
        page.pushOperators(P.setStrokingRgbColor(0.8, 0.8, 0.8), P.setLineWidth(0.4));
        for (let c = c0; c <= c1 + 1; c++) page.pushOperators(P.moveTo(PX(G.X(c)), clipYTop), P.lineTo(PX(G.X(c)), clipYBot), P.stroke());
        for (let r = r0; r <= r1 + 1; r++) page.pushOperators(P.moveTo(clipX0, PY(G.Y(r))), P.lineTo(clipX1, PY(G.Y(r))), P.stroke());
      }

      // ---- text ----
      for (const cell of sh.cells.values()) {
        if (cell.value == null) continue;
        const { r, c } = cell;
        const mg = mergeAt.get(r * 16384 + c);
        if (inMerge.has(r * 16384 + c) && !mg) continue;
        const rr2 = mg ? mg.r2 : r, cc2 = mg ? mg.c2 : c;
        if (rr2 < r0 || r > r1 || cc2 < c0 - 30 || c > c1 + 30) continue;
        const xf = styles.xfs[cell.s] || styles.xfs[0];
        await drawCellText(page, T, cell, xf, { x0: G.X(c), x1: G.X(cc2 + 1), y0: G.Y(r), y1: G.Y(rr2 + 1) }, {
          k, PX, PY, G, merged: !!mg, hasValue, sh, clip: [clipX0, clipYBot, clipX1, clipYTop], pushClip, popClip, minC: c0, maxC: c1,
        });
      }

      // ---- borders ----
      const seg = [];
      for (let r = r0; r <= r1; r++) {
        if (!G.rowPt(r)) continue;
        for (let c = c0; c <= c1; c++) {
          if (!G.colPt(c)) continue;
          const xf = xfOf(r, c);
          const b = xf && xf.border;
          if (!b) continue;
          const mg = inMerge.get(r * 16384 + c);
          const x0 = PX(G.X(c)), x1 = PX(G.X(c + 1)), yT = PY(G.Y(r)), yB = PY(G.Y(r + 1));
          if (b.t && (!mg || r === mg.r1)) seg.push([b.t, x0, yT, x1, yT, 'h']);
          if (b.b && (!mg || r === mg.r2)) seg.push([b.b, x0, yB, x1, yB, 'h']);
          if (b.l && (!mg || c === mg.c1)) seg.push([b.l, x0, yT, x0, yB, 'v']);
          if (b.r && (!mg || c === mg.c2)) seg.push([b.r, x1, yT, x1, yB, 'v']);
          if (b.d && (b.dd || b.du)) {
            if (b.dd) seg.push([b.d, x0, yT, x1, yB, 'd']);
            if (b.du) seg.push([b.d, x0, yB, x1, yT, 'd']);
          }
        }
      }
      // thin lines first, heavier lines on top (like Excel)
      seg.sort((a, b) => (BORDER_W[a[0].style] || 1) - (BORDER_W[b[0].style] || 1));
      for (const [st, x0, y0, x1, y1, dir] of seg) {
        const w = Math.max(0.3, (BORDER_W[st.style] || 1) * PX_PT * Math.max(k, 0.6));
        page.pushOperators(P.setStrokingRgbColor(...st.color), P.setLineWidth(st.style === 'double' ? w * 0.8 : w), P.setDashPattern(lineDash(st.style, w), 0), P.setLineCap(0));
        if (st.style === 'double') {
          const o = 1.1 * Math.max(k, 0.6);
          const [dx, dy] = dir === 'h' ? [0, o] : [o, 0];
          page.pushOperators(P.moveTo(x0 - dx, y0 - dy), P.lineTo(x1 - dx, y1 - dy), P.stroke(), P.moveTo(x0 + dx, y0 + dy), P.lineTo(x1 + dx, y1 + dy), P.stroke());
        } else {
          // extend a little so corners close
          const e = dir === 'h' ? [w / 2, 0] : dir === 'v' ? [0, w / 2] : [0, 0];
          page.pushOperators(P.moveTo(x0 - e[0], y0 + e[1]), P.lineTo(x1 + e[0], y1 - e[1]), P.stroke());
        }
      }
      page.pushOperators(P.setDashPattern([], 0));

      // ---- pictures and shapes ----
      pushClip(Math.min(clipX0, clipX1) - 0.5, Math.min(clipYBot, clipYTop) - 0.5, Math.max(clipX0, clipX1) + 0.5, Math.max(clipYBot, clipYTop) + 0.5);
      for (const d of sh.drawings) {
        const rect = anchorRect(d.anchor, G);
        if (rect.x > G.X(c1 + 1) || rect.x + rect.w < G.X(c0) || rect.y > G.Y(r1 + 1) || rect.y + rect.h < G.Y(r0)) continue;
        await drawItem(page, d, rect, { k, PX, PY, T, embedPic, rgb });
      }
      popClip();
      if (sh.drawings.some(d => d.kind === 'chart')) charts++;

      // ---- header / footer ----
      const hfCtx = { page: pageNo, pages: totalPages, sheet: ch.title, file: opts.fileName || '' };
      if (sh.setup.header) await drawHF(page, T, sh.setup.header, hfCtx, { x0: m.l, x1: pw - m.r, y: ph - m.h, top: true });
      if (sh.setup.footer) await drawHF(page, T, sh.setup.footer, hfCtx, { x0: m.l, x1: pw - m.r, y: m.f, top: false });
      if (opts.watermarkOnTop) await opts.watermarkOnTop(page, pw, ph);
      if (pageNo % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }
  }
  if (skippedPics) report.push({ k: 'warn', t: `${skippedPics} picture${skippedPics > 1 ? 's' : ''} in a format browsers can't draw (EMF/WMF) were left out. Save them as PNG in Excel to include them.` });
  if (T.canvasCount) report.push({ k: 'info', t: `Malayalam / special text kept sharp as high-resolution text images (${T.canvasCount})` });
  return { pages, report, totalPages };
}

/* ---- cell text ---- */
function runStyle(base, st) {
  if (!st) return base;
  return {
    name: st.name || base.name, sz: st.sz || base.sz, b: st.b != null ? st.b : base.b, i: st.i != null ? st.i : base.i,
    u: st.u != null ? st.u : base.u, strike: st.strike != null ? st.strike : base.strike, color: st.color || base.color,
  };
}

async function drawCellText(page, T, cell, xf, box, g) {
  const { k, PX, PY } = g;
  const base = xf.font || { name: 'Calibri', sz: 11, color: [0, 0, 0] };
  // build runs
  let runs;
  const v = cell.value;
  if (typeof v === 'string') runs = [{ t: v, st: base }];
  else if (v && v.runs) runs = v.runs.map(r => ({ t: r.t, st: runStyle(base, r.st) }));
  else if (v && v.n != null) runs = [{ t: v.text, st: base }];
  else runs = [{ t: String(v), st: base }];
  if (!runs.some(r => r.t)) return;
  const isNum = !!(v && v.n != null) && !/@/.test(xf.fmt || '');
  let h = xf.h;
  if (h === 'general') h = isNum ? 'right' : (cell.t === 'b' || cell.t === 'e') ? 'center' : 'left';
  if (h === 'centerContinuous' || h === 'distributed') h = 'center';
  if (h === 'fill' || h === 'justify') h = 'left';
  const rot = xf.rot === 255 ? 0 : xf.rot <= 90 ? xf.rot : -(xf.rot - 90);
  const padX = 2 * PX_PT; // Excel keeps ~2px inside the cell edge
  const indent = (xf.indent || 0) * 3 * MDW * PX_PT;
  const cellW = box.x1 - box.x0, cellH = box.y1 - box.y0;
  let scaleF = 1;

  // measure helper at sheet scale
  const fi = (st) => fontInfo(st.name, st.b, st.i);
  const text = (r) => (fi(r.st).upper ? r.t.toUpperCase() : r.t);
  const measureRun = (r, s = 1) => T.width(text(r), fi(r.st), r.st.sz * s);

  // tokens → lines
  const availW = (rot ? cellH : cellW) - 2 * padX - indent;
  const plain = runs.map(text).join('');
  const wrapping = xf.wrap || /\n/.test(plain) || xf.rot === 255;
  const layout = (avail) => {
    let lines;
    if (wrapping) {
      const tokens = [];
      for (const r of runs) {
        const parts = (xf.rot === 255 ? text(r).split('').join('\n') : text(r)).split(/(\n| +)/);
        for (const p of parts) if (p) tokens.push({ t: p, st: r.st });
      }
      lines = [[]]; let lw = 0;
      for (const tk of tokens) {
        if (tk.t === '\n') { lines.push([]); lw = 0; continue; }
        const w = T.width(tk.t, fi(tk.st), tk.st.sz);
        const isSpace = /^ +$/.test(tk.t);
        if (xf.wrap && !isSpace && lw + w > avail && lines[lines.length - 1].length) {
          const L = lines[lines.length - 1]; while (L.length && /^ +$/.test(L[L.length - 1].t)) L.pop();
          lines.push([]); lw = 0;
        }
        if (isSpace && !lines[lines.length - 1].length) continue;
        lines[lines.length - 1].push(tk); lw += w;
      }
    } else lines = [runs.map(r => ({ t: text(r), st: r.st }))];
    return lines.map(L => ({ L, w: L.reduce((a, tk) => a + T.width(tk.t, fi(tk.st), tk.st.sz), 0), sz: Math.max(...L.map(tk => tk.st.sz), base.sz) }));
  };
  let lineInfo = layout(availW);
  const blockOf = (li, f) => li.reduce((a, l) => a + l.sz * 1.22 * f, 0);
  if (xf.wrap && !rot && blockOf(lineInfo, 1) > cellH + 0.5) {
    // our stand-in font can be a little wider than the real one: squeeze a little instead of cutting lines off
    for (const f of [0.94, 0.88, 0.82, 0.76, 0.7]) {
      const li = layout(availW / f);
      lineInfo = li; scaleF = f;
      if (blockOf(li, f) <= cellH + 0.5) break;
    }
  }
  if (xf.shrink && !xf.wrap) { const mw = Math.max(...lineInfo.map(l => l.w)); if (mw > availW && mw > 0) scaleF = Math.max(0.3, availW / mw); }

  // horizontal extent for clipping (text may run into empty neighbours like in Excel)
  let clipX0 = box.x0, clipX1 = box.x1;
  const maxW = Math.max(...lineInfo.map(l => l.w)) * scaleF;
  if (!xf.wrap && !g.merged && !isNum && !rot && maxW + 2 * padX > cellW) {
    const needR = h === 'left' ? maxW + 2 * padX + indent : h === 'center' ? (maxW - cellW) / 2 + padX : 0;
    const needL = h === 'right' ? maxW + 2 * padX : h === 'center' ? (maxW - cellW) / 2 + padX : 0;
    let c = cell.c;
    while (clipX1 - box.x0 < needR && !g.hasValue(cell.r, c + 1) && c < g.maxC) { c++; clipX1 = g.G.X(c + 1); }
    c = cell.c;
    while (box.x1 - clipX0 < needL && c > g.minC && !g.hasValue(cell.r, c - 1)) { c--; clipX0 = g.G.X(c); }
  }
  // still too wide for its space (merged cell or a filled neighbour)? shrink to fit rather than cut letters off
  if (!wrapping && !rot) {
    const room = (clipX1 - clipX0) - 2 * padX - (h === 'left' ? indent : 0);
    if (maxW > room && room > 0) scaleF = Math.max(0.55, scaleF * room / maxW);
  }

  const lh = (sz) => sz * 1.22 * scaleF;
  const blockH = lineInfo.reduce((a, l) => a + lh(l.sz), 0);
  const padY = 1.5;
  // vertical position of first line's top
  let top;
  if (rot) top = 0;
  else if (xf.v === 'top') top = box.y0 + padY;
  else if (xf.v === 'center' || xf.v === 'distributed' || xf.v === 'justify') top = box.y0 + (cellH - blockH) / 2;
  else top = box.y1 - padY - blockH;

  // clip to the (extended) cell and the printed page
  const cx0 = Math.max(PX(clipX0), g.clip[0]), cx1 = Math.min(PX(clipX1), g.clip[2]);
  const cy0 = Math.max(PY(box.y1), g.clip[1]), cy1 = Math.min(PY(box.y0), g.clip[3]);
  if (cx1 <= cx0 || cy1 <= cy0) return;
  g.pushClip(cx0, cy0, cx1, cy1);
  if (rot) {
    // rotated text: one line centred in the cell
    const l = lineInfo[0];
    const cxm = (box.x0 + box.x1) / 2, cym = (box.y0 + box.y1) / 2;
    const a = rot * Math.PI / 180;
    let x = PX(cxm) - Math.cos(a) * l.w * k / 2 + Math.sin(a) * l.sz * k * 0.35;
    let y = PY(cym) - Math.sin(a) * l.w * k / 2 - Math.cos(a) * l.sz * k * 0.35;
    for (const tk of l.L) {
      const f = fi(tk.st), size = tk.st.sz * k;
      await T.draw(page, tk.t, x, y, f, size, tk.st.color || [0, 0, 0], { rotate: rot });
      const w = T.width(tk.t, f, size);
      x += Math.cos(a) * w; y += Math.sin(a) * w;
    }
  } else {
    let y = top;
    for (const l of lineInfo) {
      const base = y + lh(l.sz) * 0.8; // baseline
      let x;
      const w = l.w * scaleF;
      if (h === 'right') x = box.x1 - padX - w;
      else if (h === 'center') x = box.x0 + (cellW - w) / 2;
      else x = box.x0 + padX + indent;
      for (const tk of l.L) {
        const f = fi(tk.st), size = tk.st.sz * scaleF;
        const tw = T.width(tk.t, f, size);
        if (!/^ +$/.test(tk.t)) {
          const color = tk.st.color || [0, 0, 0];
          await T.draw(page, tk.t, PX(x), PY(base), f, size * k, color);
          if (tk.st.u || tk.st.strike) {
            const uy = tk.st.u ? base + size * 0.12 : base - size * 0.28;
            page.pushOperators(ops().setStrokingRgbColor(...color), ops().setLineWidth(Math.max(0.4, size * 0.06 * k)), ops().moveTo(PX(x), PY(uy)), ops().lineTo(PX(x + tw), PY(uy)), ops().stroke());
          }
        }
        x += tw;
      }
      y += lh(l.sz);
    }
  }
  g.popClip();
}

/* ---- drawings ---- */
function transformPts(pts, rect, xf) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const rot = xf && xf.rot ? xf.rot * Math.PI / 180 : 0;
  return pts.map(([x, y]) => {
    let px = x - rect.w / 2, py = y - rect.h / 2;
    if (xf && xf.flipH) px = -px;
    if (xf && xf.flipV) py = -py;
    if (rot) { const c = Math.cos(rot), s = Math.sin(rot); [px, py] = [px * c - py * s, px * s + py * c]; }
    return [cx + px, cy + py];
  });
}

async function drawItem(page, d, rect, ctx) {
  const P = ops();
  const { k, PX, PY } = ctx;
  if (d.kind === 'group') {
    const gx = d.xfrm;
    for (const child of d.children) {
      let r = rect;
      if (gx && gx.ch && child.xfrm && gx.ch.w && gx.ch.h) {
        const sx = rect.w / gx.ch.w, sy = rect.h / gx.ch.h;
        r = { x: rect.x + (child.xfrm.x - gx.ch.x) * sx, y: rect.y + (child.xfrm.y - gx.ch.y) * sy, w: child.xfrm.w * sx, h: child.xfrm.h * sy };
      }
      await drawItem(page, child, r, ctx);
    }
    return;
  }
  if (d.kind === 'pic') {
    if (!d.src) return;
    const ref = await ctx.embedPic(d.src);
    if (!ref) return;
    let { x, y, w, h } = rect;
    if (d.crop) {
      const c = d.crop, fw = w / Math.max(0.01, 1 - c.l - c.r), fh = h / Math.max(0.01, 1 - c.t - c.b);
      page.pushOperators(P.pushGraphicsState(), P.rectangle(PX(x), PY(y + h), w * k, h * k), P.clip(), P.endPath());
      x -= fw * c.l; y -= fh * c.t; w = fw; h = fh;
    }
    const rot = d.xfrm && d.xfrm.rot ? d.xfrm.rot : 0;
    if (rot) {
      // rotate around the centre
      const cx = PX(x + w / 2), cy = PY(y + h / 2), a = -rot * Math.PI / 180;
      const dx = -w * k / 2, dy = -h * k / 2;
      page.drawImage(ref, { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a), width: w * k, height: h * k, rotate: P.degrees(-rot), opacity: d.alpha < 1 ? d.alpha : undefined });
    } else page.drawImage(ref, { x: PX(x), y: PY(y + h), width: w * k, height: h * k, opacity: d.alpha < 1 ? d.alpha : undefined });
    if (d.crop) page.pushOperators(P.popGraphicsState());
    if (d.line && d.line.rgb) {
      page.pushOperators(P.setStrokingRgbColor(...d.line.rgb), P.setLineWidth(d.line.w * k), P.rectangle(PX(rect.x), PY(rect.y + rect.h), rect.w * k, rect.h * k), P.stroke());
    }
    return;
  }
  if (d.kind !== 'shape') return;
  const geo = d.prst === 'cust' && d.paths ? customPaths(d.paths, rect.w, rect.h) : presetPaths(d.prst, rect.w, rect.h, d.adj || {});
  for (const path of geo) {
    const pts = transformPts(path.pts, rect, d.xfrm);
    if (pts.length < 2) continue;
    const fillOn = d.fill && !path.strokeOnly && path.close && !path.noFill && !d.isLine;
    const strokeOn = d.line && !path.noStroke;
    if (!fillOn && !strokeOn) continue;
    const opsList = [P.pushGraphicsState()];
    if (fillOn && d.fill.alpha < 1 || strokeOn && d.line.alpha < 1) {
      const gs = page.doc.context.obj({ Type: 'ExtGState', ca: fillOn ? d.fill.alpha : 1, CA: strokeOn ? d.line.alpha : 1 });
      const name = page.node.newExtGState('GS', page.doc.context.register(gs));
      opsList.push(P.setGraphicsState(name));
    }
    if (fillOn) opsList.push(P.setFillingRgbColor(...d.fill.rgb));
    if (strokeOn) opsList.push(P.setStrokingRgbColor(...d.line.rgb), P.setLineWidth(Math.max(0.25, d.line.w * k)), P.setDashPattern(lineDash(d.line.dash, d.line.w * k), 0), P.setLineJoin(1));
    opsList.push(P.moveTo(PX(pts[0][0]), PY(pts[0][1])));
    for (let i = 1; i < pts.length; i++) opsList.push(P.lineTo(PX(pts[i][0]), PY(pts[i][1])));
    if (path.close) opsList.push(P.closePath());
    opsList.push(fillOn && strokeOn ? P.fillAndStroke() : fillOn ? P.fill() : P.stroke());
    opsList.push(P.popGraphicsState());
    page.pushOperators(...opsList);
    // arrow heads for lines
    if (d.isLine && strokeOn && (d.line.tail || d.line.head)) {
      const arrow = (a, b) => {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.max(4, d.line.w * 4);
        const p1 = [b[0] - L * Math.cos(ang - 0.4), b[1] - L * Math.sin(ang - 0.4)], p2 = [b[0] - L * Math.cos(ang + 0.4), b[1] - L * Math.sin(ang + 0.4)];
        page.pushOperators(P.setFillingRgbColor(...d.line.rgb), P.moveTo(PX(b[0]), PY(b[1])), P.lineTo(PX(p1[0]), PY(p1[1])), P.lineTo(PX(p2[0]), PY(p2[1])), P.closePath(), P.fill());
      };
      if (d.line.tail) arrow(pts[pts.length - 2], pts[pts.length - 1]);
      if (d.line.head) arrow(pts[1], pts[0]);
    }
  }
  if (d.text) await drawShapeText(page, d.text, rect, ctx);
}

async function drawShapeText(page, tx, rect, ctx) {
  const { k, PX, PY, T } = ctx;
  const x0 = rect.x + tx.ins.l, x1 = rect.x + rect.w - tx.ins.r, y0 = rect.y + tx.ins.t, y1 = rect.y + rect.h - tx.ins.b;
  const W = Math.max(1, x1 - x0);
  const laid = [];
  for (const p of tx.paras) {
    const tokens = [];
    for (const r of p.runs) for (const part of (r.t || '').split(/(\n| +)/)) if (part) tokens.push({ t: part, r });
    let line = [], lw = 0;
    const flush = () => { laid.push({ toks: line, w: lw, algn: p.algn, sz: Math.max(p.sz || 11, ...line.map(t => t.r.sz || p.sz || 11)) }); line = []; lw = 0; };
    if (!tokens.length) { laid.push({ toks: [], w: 0, algn: p.algn, sz: p.sz || 11 }); continue; }
    for (const tk of tokens) {
      if (tk.t === '\n') { flush(); continue; }
      const f = fontInfo(tk.r.font || 'Calibri', tk.r.b, tk.r.i), sz = tk.r.sz || p.sz || 11;
      const w = T.width(tk.t, f, sz);
      if (tx.wrap && lw + w > W && line.length && !/^ +$/.test(tk.t)) flush();
      if (/^ +$/.test(tk.t) && !line.length) continue;
      line.push(tk); lw += w;
    }
    flush();
  }
  const total = laid.reduce((a, l) => a + l.sz * 1.2, 0);
  let y = tx.anchor === 'ctr' ? y0 + (y1 - y0 - total) / 2 : tx.anchor === 'b' ? y1 - total : y0;
  for (const l of laid) {
    const base = y + l.sz * 0.95;
    let x = l.algn === 'ctr' ? x0 + (W - l.w) / 2 : l.algn === 'r' ? x1 - l.w : x0;
    for (const tk of l.toks) {
      const f = fontInfo(tk.r.font || 'Calibri', tk.r.b, tk.r.i), sz = tk.r.sz || 11;
      const w = T.width(tk.t, f, sz);
      if (!/^ +$/.test(tk.t)) {
        const color = (tk.r.color && tk.r.color.rgb) || (tx.defColor && tx.defColor.rgb) || [0, 0, 0];
        await T.draw(page, tk.t, PX(x), PY(base), f, sz * k, color);
      }
      x += w;
    }
    y += l.sz * 1.2;
  }
}

/* ---- header / footer ---- */
async function drawHF(page, T, spec, ctx, pos) {
  const parts = { L: '', C: '', R: '' };
  let cur = 'C';
  let sz = 11, bold = false;
  const re = /&([LCRPNDTAFBIUSKEXYZGH]|"[^"]*"|\d+|&|\+|-)/g;
  let last = 0, m;
  while ((m = re.exec(spec))) {
    parts[cur] += spec.slice(last, m.index);
    const code = m[1];
    if (code === 'L' || code === 'C' || code === 'R') cur = code;
    else if (code === 'P') parts[cur] += String(ctx.page);
    else if (code === 'N') parts[cur] += String(ctx.pages);
    else if (code === 'D') parts[cur] += new Date().toLocaleDateString();
    else if (code === 'T') parts[cur] += new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    else if (code === 'A') parts[cur] += ctx.sheet;
    else if (code === 'F') parts[cur] += ctx.file;
    else if (code === '&') parts[cur] += '&';
    else if (/^\d+$/.test(code)) sz = +code;
    else if (code === 'B') bold = !bold;
    else if (/^"/.test(code)) bold = /bold/i.test(code);
    last = re.lastIndex;
  }
  parts[cur] += spec.slice(last);
  const fi = fontInfo('Calibri', bold, false);
  const y = pos.top ? pos.y - sz : pos.y + sz * 0.25;
  for (const [k, t] of Object.entries(parts)) {
    const text = t.trim();
    if (!text) continue;
    const w = T.width(text, fi, sz);
    const x = k === 'L' ? pos.x0 : k === 'R' ? pos.x1 - w : (pos.x0 + pos.x1) / 2 - w / 2;
    await T.draw(page, text, x, y, fi, sz, [0, 0, 0]);
  }
}
