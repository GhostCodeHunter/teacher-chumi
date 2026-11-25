// ടീച്ചർ.Chumi — Excel / CSV reader (runs fully in the browser, nothing is uploaded)
// Output: { sheets: [{ name, rows: Cell[][], merges: [{r1,c1,r2,c2}], hiddenRows, hiddenCols }] }
// Cell: null | { t:'n', v:number, fmt:'num'|'pct', dec:number|null } | { t:'s', v:string, err?:true }

const MAX_ROWS = 20000;
const MAX_COLS = 200;

export async function readFile(file) {
  const name = (file.name || '').toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(name)) {
    const text = await file.text();
    return { sheets: [{ name: baseName(file.name), rows: parseCSV(text), merges: [], hiddenRows: 0, hiddenCols: 0 }] };
  }
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 8));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isCFB = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  if (!isZip) {
    if (isCFB) throw new Error('This looks like an old .xls file or a password-protected workbook. In Excel choose File → Save As → Excel Workbook (.xlsx), then upload again.');
    throw new Error('This file is not an Excel workbook. Please upload a .xlsx or .csv file.');
  }
  return readXlsx(buf);
}

function baseName(n) { return (n || 'Sheet').replace(/\.[^.]+$/, '') || 'Sheet'; }

function xml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The workbook XML could not be read. Try re-saving the file in Excel.');
  return doc;
}
const all = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
const first = (node, tag) => node.getElementsByTagNameNS('*', tag)[0] || null;
const attr = (el, name) => (el && el.getAttribute(name));
// relationship id attribute can carry any prefix (r:id, x:id ...)
function relId(el) {
  for (const a of Array.from(el.attributes)) if (a.localName === 'id' && a.namespaceURI && /relationships/.test(a.namespaceURI)) return a.value;
  return el.getAttribute('r:id');
}

async function readXlsx(buf) {
  if (!window.JSZip) throw new Error('Reader library did not load. Please refresh the page.');
  let zip;
  try { zip = await window.JSZip.loadAsync(buf); } catch { throw new Error('The Excel file seems damaged. Open it in Excel, save it again and retry.'); }
  const get = async (p) => { const f = zip.file(p.replace(/^\//, '')); return f ? f.async('string') : null; };

  const wbText = await get('xl/workbook.xml');
  if (!wbText) throw new Error('No workbook found inside this file. Please upload a normal .xlsx workbook.');
  const wb = xml(wbText);
  const pr = first(wb, 'workbookPr');
  const date1904 = pr && /^(1|true)$/i.test(attr(pr, 'date1904') || '');

  const rels = {};
  const relText = await get('xl/_rels/workbook.xml.rels');
  if (relText) for (const r of all(xml(relText), 'Relationship')) rels[attr(r, 'Id')] = attr(r, 'Target');

  // shared strings
  const strings = [];
  const ssText = await get('xl/sharedStrings.xml');
  if (ssText) {
    for (const si of all(xml(ssText), 'si')) {
      let s = '';
      for (const t of all(si, 't')) { if (t.parentNode && t.parentNode.localName === 'rPh') continue; s += t.textContent; }
      strings.push(s);
    }
  }

  // styles → number formats
  const xfFmt = [];
  const stText = await get('xl/styles.xml');
  if (stText) {
    const st = xml(stText);
    const custom = {};
    for (const nf of all(st, 'numFmt')) custom[attr(nf, 'numFmtId')] = attr(nf, 'formatCode') || '';
    const cellXfs = first(st, 'cellXfs');
    if (cellXfs) for (const xf of Array.from(cellXfs.children).filter(e => e.localName === 'xf')) {
      const id = +(attr(xf, 'numFmtId') || 0);
      xfFmt.push(classifyFmt(id, custom[id]));
    }
  }

  const sheets = [];
  for (const sh of all(wb, 'sheet')) {
    const state = attr(sh, 'state');
    if (state === 'hidden' || state === 'veryHidden') continue;
    let target = rels[relId(sh)];
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const text = await get(target);
    if (!text) continue; // chart sheets etc.
    const parsed = parseSheet(xml(text), strings, xfFmt, date1904);
    sheets.push({ name: attr(sh, 'name') || `Sheet ${sheets.length + 1}`, ...parsed });
  }
  if (!sheets.length) throw new Error('No visible sheets with data were found in this workbook.');
  return { sheets };
}

function classifyFmt(id, code) {
  const out = { kind: 'num', dec: null };
  if (id === 9) return { kind: 'pct', dec: 0 };
  if (id === 10) return { kind: 'pct', dec: 2 };
  if ((id >= 14 && id <= 17) || id === 22 || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return { kind: 'date', time: id === 22 };
  if ((id >= 18 && id <= 21) || (id >= 45 && id <= 47)) return { kind: 'time' };
  if (id === 1 || id === 3 || id === 37 || id === 38) out.dec = 0;
  if (id === 2 || id === 4 || id === 39 || id === 40) out.dec = 2;
  if (!code) return out;
  const clean = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').replace(/_.|\*./g, '');
  const sec = clean.split(';')[0];
  if (/%/.test(sec)) { const m = sec.match(/\.(0+)/); return { kind: 'pct', dec: m ? m[1].length : 0 }; }
  if (/[dy]/i.test(sec)) return { kind: 'date', time: /h/i.test(sec) };
  if (/[hs]/i.test(sec) && !/general/i.test(sec)) return { kind: 'time' };
  if (/m/i.test(sec) && !/0/.test(sec)) return { kind: 'date', time: false };
  if (/general/i.test(sec)) return out;
  const m = sec.match(/\.([0#?]+)/);
  out.dec = m ? m[1].replace(/[#?]/g, '').length : (/0/.test(sec) ? 0 : null);
  return out;
}

function colIndex(ref) {
  let n = 0;
  for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); }
  return n - 1;
}
function parseRef(ref) {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec((ref || '').toUpperCase());
  return m ? { c: colIndex(m[1]), r: +m[2] - 1 } : null;
}

const pad2 = (n) => String(n).padStart(2, '0');
function serialToDate(serial, date1904, withTime, timeOnly) {
  const ms = Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86400000);
  const d = new Date(ms);
  if (isNaN(d)) return String(serial);
  const date = `${pad2(d.getUTCDate())}-${pad2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  if (timeOnly) return time;
  return withTime && (d.getUTCHours() || d.getUTCMinutes()) ? `${date} ${time}` : date;
}

function parseSheet(doc, strings, xfFmt, date1904) {
  const rows = [];
  const hiddenColSet = new Set();
  for (const col of all(doc, 'col')) {
    if (/^(1|true)$/i.test(attr(col, 'hidden') || '')) {
      const a = +attr(col, 'min'), b = Math.min(+attr(col, 'max'), MAX_COLS);
      for (let i = a; i <= b; i++) hiddenColSet.add(i - 1);
    }
  }
  let hiddenRows = 0, truncated = false;
  let rIdx = -1;
  for (const row of all(doc, 'row')) {
    const rr = attr(row, 'r');
    rIdx = rr ? +rr - 1 : rIdx + 1;
    if (rIdx >= MAX_ROWS) { truncated = true; break; }
    if (/^(1|true)$/i.test(attr(row, 'hidden') || '')) { hiddenRows++; rows[rIdx] = 'hidden'; continue; }
    const cells = [];
    let cIdx = -1;
    for (const c of Array.from(row.children).filter(e => e.localName === 'c')) {
      const ref = parseRef(attr(c, 'r'));
      cIdx = ref ? ref.c : cIdx + 1;
      if (cIdx >= MAX_COLS) continue;
      const t = attr(c, 't') || 'n';
      const vEl = first(c, 'v');
      const v = vEl ? vEl.textContent : null;
      let cell = null;
      if (t === 's') { const s = strings[+v]; if (s != null && s !== '') cell = { t: 's', v: s }; }
      else if (t === 'inlineStr') { const s = all(c, 't').map(x => x.textContent).join(''); if (s) cell = { t: 's', v: s }; }
      else if (t === 'str') { if (v) cell = { t: 's', v }; }
      else if (t === 'b') { if (v != null) cell = { t: 's', v: v === '1' ? 'TRUE' : 'FALSE' }; }
      else if (t === 'e') { if (v) cell = { t: 's', v, err: true }; }
      else if (t === 'd') { if (v) cell = { t: 's', v: v.slice(0, 10).split('-').reverse().join('-') }; }
      else if (v != null && v !== '') {
        const num = parseFloat(v);
        if (!isFinite(num)) cell = { t: 's', v };
        else {
          const f = xfFmt[+(attr(c, 's') || 0)] || { kind: 'num', dec: null };
          if (f.kind === 'date') cell = { t: 's', v: serialToDate(num, date1904, f.time, false), date: true };
          else if (f.kind === 'time') cell = { t: 's', v: serialToDate(num, date1904, true, true), date: true };
          else cell = { t: 'n', v: num, fmt: f.kind === 'pct' ? 'pct' : 'num', dec: f.dec };
        }
      }
      if (cell) cells[cIdx] = cell;
    }
    rows[rIdx] = cells;
  }
  const merges = [];
  for (const m of all(doc, 'mergeCell')) {
    const [a, b] = (attr(m, 'ref') || '').split(':');
    const p = parseRef(a), q = parseRef(b || a);
    if (p && q) merges.push({ r1: p.r, c1: p.c, r2: q.r, c2: q.c });
  }
  // remove hidden rows / columns
  const keepCol = (i) => !hiddenColSet.has(i);
  const out = [];
  const rowMap = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] === 'hidden') continue;
    rowMap[i] = out.length;
    const r = rows[i] || [];
    out.push(hiddenColSet.size ? compactCols(r, hiddenColSet) : Array.from(r));
  }
  const colMap = (c) => { let n = 0; for (let i = 0; i < c; i++) if (keepCol(i)) n++; return n; };
  const mapped = merges
    .filter(m => rowMap[m.r1] != null)
    .map(m => ({ r1: rowMap[m.r1], c1: colMap(m.c1), r2: rowMap[m.r2] ?? rowMap[m.r1], c2: Math.max(colMap(m.c1), colMap(m.c2 + 1) - 1) }));
  return { rows: out, merges: mapped, hiddenRows, hiddenCols: hiddenColSet.size, truncated };
}

function compactCols(r, hidden) {
  const out = [];
  const len = r.length;
  for (let i = 0; i < len; i++) { if (hidden.has(i)) continue; out.push(r[i]); }
  return out;
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const head = text.split(/\r?\n/).slice(0, 6).join('\n').replace(/"[^"]*"/g, '');
  const counts = [',', ';', '\t'].map(d => [d, head.split(d).length]);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], field = '', q = false;
  const push = () => { row.push(field === '' ? null : { t: 's', v: field }); field = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === delim) push();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      push(); rows.push(row); row = [];
      if (rows.length >= MAX_ROWS) break;
    } else field += ch;
  }
  if (field !== '' || row.length) { push(); rows.push(row); }
  return rows;
}
