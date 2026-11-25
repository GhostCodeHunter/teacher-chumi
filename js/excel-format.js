// Show a number the way Excel shows it, using the cell's number format.

export const BUILTIN_FORMATS = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00',
  12: 'General', 13: 'General', 14: 'dd-mm-yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
  18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd-mm-yyyy h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;(#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;(#,##0.00)',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@',
};
for (let i = 27; i <= 36; i++) BUILTIN_FORMATS[i] = 'dd-mm-yyyy';
for (let i = 50; i <= 58; i++) BUILTIN_FORMATS[i] = 'dd-mm-yyyy';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function general(v) {
  if (!isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (Number.isInteger(v) && a < 1e11) return String(v);
  if (a !== 0 && (a >= 1e11 || a < 1e-9)) {
    const [m, e] = v.toExponential(5).split('e');
    const mm = m.replace(/\.?0+$/, '');
    const n = +e;
    return `${mm}E${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`;
  }
  return String(Number(v.toPrecision(10)));
}

function splitSections(code) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '"') q = !q;
    if (c === '\\' && !q) { cur += c + (code[i + 1] || ''); i++; continue; }
    if (c === ';' && !q) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// turn a format section into tokens: literal text or format characters
function tokens(sec) {
  const out = [];
  for (let i = 0; i < sec.length; i++) {
    const c = sec[i];
    if (c === '"') { const j = sec.indexOf('"', i + 1); out.push({ lit: sec.slice(i + 1, j < 0 ? undefined : j) }); i = j < 0 ? sec.length : j; continue; }
    if (c === '\\') { out.push({ lit: sec[i + 1] || '' }); i++; continue; }
    if (c === '_') { out.push({ lit: ' ' }); i++; continue; }
    if (c === '*') { i++; continue; }
    if (c === '[') {
      const j = sec.indexOf(']', i);
      const inner = sec.slice(i + 1, j < 0 ? undefined : j);
      const cur = /^\$([^-\]]*)/.exec(inner);
      if (cur) out.push({ lit: cur[1] });
      else if (/^h+$|^m+$|^s+$/i.test(inner)) out.push({ fmt: inner.toLowerCase(), elapsed: true });
      i = j < 0 ? sec.length : j; continue;
    }
    out.push({ fmt: c });
  }
  return out;
}

const isDateSection = (toks) => toks.some(t => t.fmt && /[dmyhs]/i.test(t.fmt) && !/e/i.test(t.fmt)) && !toks.some(t => t.fmt && /[0#?]/.test(t.fmt));

function formatDate(serial, toks, date1904) {
  const ms = Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86400000);
  const d = new Date(ms);
  if (isNaN(d)) return general(serial);
  const ampm = toks.some(t => t.fmt && /^[aA]$/.test(t.fmt));
  // group repeated letters
  const parts = [];
  for (const t of toks) {
    if (t.lit !== undefined) { parts.push({ lit: t.lit }); continue; }
    const c = t.fmt.toLowerCase();
    const last = parts[parts.length - 1];
    if (t.elapsed) { parts.push({ code: t.fmt, elapsed: true }); continue; }
    if (last && last.code && last.code[0] === c && /[dmyhs]/.test(c) && !last.elapsed) last.code += c;
    else parts.push({ code: c });
  }
  const p2 = (n) => String(n).padStart(2, '0');
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.lit !== undefined) { out += p.lit; continue; }
    const c = p.code;
    const prevTime = parts.slice(0, i).reverse().find(x => x.code && /[hmsdy]/.test(x.code[0]));
    const nextTime = parts.slice(i + 1).find(x => x.code && /[hmsdy]/.test(x.code[0]));
    if (c[0] === 'y') out += c.length <= 2 ? p2(d.getUTCFullYear() % 100) : d.getUTCFullYear();
    else if (c[0] === 'd') out += c.length === 1 ? d.getUTCDate() : c.length === 2 ? p2(d.getUTCDate()) : c.length === 3 ? DAYS[d.getUTCDay()].slice(0, 3) : DAYS[d.getUTCDay()];
    else if (c[0] === 'h') {
      let h = p.elapsed ? Math.floor(serial * 24) : d.getUTCHours();
      if (ampm && !p.elapsed) h = h % 12 || 12;
      out += c.length >= 2 ? p2(h) : h;
    } else if (c[0] === 's') out += c.length >= 2 ? p2(d.getUTCSeconds()) : d.getUTCSeconds();
    else if (c[0] === 'm') {
      const minute = (prevTime && prevTime.code[0] === 'h') || (nextTime && nextTime.code[0] === 's');
      if (minute) out += c.length >= 2 ? p2(d.getUTCMinutes()) : d.getUTCMinutes();
      else out += c.length === 1 ? d.getUTCMonth() + 1 : c.length === 2 ? p2(d.getUTCMonth() + 1) : c.length === 3 ? MONTHS[d.getUTCMonth()].slice(0, 3) : c.length === 5 ? MONTHS[d.getUTCMonth()][0] : MONTHS[d.getUTCMonth()];
    } else if (c[0] === 'a') {
      // AM/PM or A/P: consume the following "/pm" letters
      const pm = d.getUTCHours() >= 12;
      let j = i + 1, raw = c;
      while (j < parts.length && (parts[j].code || parts[j].lit !== undefined) && raw.length < 5 && !/^\s$/.test(parts[j].lit || 'x')) { raw += parts[j].code || parts[j].lit; j++; if (/^am\/pm$|^a\/p$/i.test(raw)) break; }
      if (/^am\/pm$/i.test(raw)) { out += pm ? 'PM' : 'AM'; i = j - 1; }
      else if (/^a\/p$/i.test(raw)) { out += pm ? 'P' : 'A'; i = j - 1; }
      else out += c;
    } else if (c === '0' || c === '.') out += c === '.' ? '.' : '0';
    else out += p.code;
  }
  return out.trim();
}

function formatNumberSection(v, toks) {
  // number pattern = format chars from first to last digit placeholder
  const isPh = (t) => t.fmt && /[0#?]/.test(t.fmt);
  const first = toks.findIndex(isPh);
  if (first < 0) return toks.map(t => t.lit !== undefined ? t.lit : (t.fmt === '@' ? general(v) : t.fmt)).join('');
  let last = toks.length - 1;
  while (last > first && !isPh(toks[last]) && !(toks[last].fmt && /[.,eE+\-]/.test(toks[last].fmt) && toks.slice(last + 1).some(isPh))) last--;
  const pattern = toks.slice(first, last + 1).map(t => t.fmt || '').join('');
  const prefix = toks.slice(0, first).map(t => t.lit !== undefined ? t.lit : (t.fmt === '%' ? '%' : t.fmt)).join('');
  // trailing commas right after the number scale it by 1000
  let scaleCommas = 0, k = last + 1;
  while (k < toks.length && toks[k].fmt === ',') { scaleCommas++; k++; }
  const suffix = toks.slice(k).map(t => t.lit !== undefined ? t.lit : t.fmt).join('');
  const pct = (prefix + pattern + suffix).split('%').length - 1;
  let x = v * Math.pow(100, pct) / Math.pow(1000, scaleCommas);

  const expM = /[eE][+-]/.exec(pattern);
  if (expM) {
    const mant = pattern.slice(0, expM.index);
    const dec = (mant.split('.')[1] || '').replace(/[^0#?]/g, '').length;
    const [m, e] = x.toExponential(dec).split('e');
    const ed = pattern.slice(expM.index + 2).replace(/[^0#?]/g, '').length || 2;
    const n = +e;
    return prefix + m + 'E' + (n < 0 ? '-' : '+') + String(Math.abs(n)).padStart(ed, '0') + suffix;
  }
  const [ip, fp = ''] = pattern.split('.');
  const minDec = (fp.match(/0/g) || []).length;
  const maxDec = (fp.match(/[0#?]/g) || []).length;
  const minInt = (ip.match(/0/g) || []).length;
  const group = /[0#?],[0#?]/.test(ip);
  let s = Math.abs(x).toFixed(maxDec);
  let [i2, f2 = ''] = s.split('.');
  while (f2.length > minDec && f2.endsWith('0')) f2 = f2.slice(0, -1);
  if (i2 === '0' && minInt === 0) i2 = '';
  i2 = i2.padStart(minInt, '0');
  if (group) i2 = i2.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return prefix + i2 + (f2 ? '.' + f2 : '') + suffix;
}

export function formatExcel(v, code, date1904 = false) {
  if (typeof v !== 'number' || !isFinite(v)) return String(v);
  if (code == null || /^\s*general\s*$/i.test(code)) return general(v);
  const sections = splitSections(code);
  const cond = (s) => /\[[<>=]/.test(s);
  let sec, neg = false;
  if (sections.length > 1 && !cond(sections[0])) {
    if (v < 0) { sec = sections[1]; v = -v; }
    else if (v === 0 && sections.length > 2) sec = sections[2];
    else sec = sections[0];
  } else { sec = sections[0]; if (v < 0) { neg = true; v = -v; } }
  if (sec === undefined || sec === '') return general(neg ? -v : v);
  const toks = tokens(sec);
  if (toks.length === 0) return '';
  if (toks.length === 1 && toks[0].fmt === '@') return general(neg ? -v : v);
  if (toks.some(t => t.fmt && /general/i.test(t.fmt)) || /general/i.test(sec)) {
    const lit = sec.replace(/general/i, '\u0000');
    return (neg ? '-' : '') + tokens(lit).map(t => t.lit !== undefined ? t.lit : t.fmt === '\u0000' ? general(v) : t.fmt).join('');
  }
  if (isDateSection(toks)) return formatDate(neg ? -v : v, toks, date1904);
  const out = formatNumberSection(v, toks);
  return (neg && /[1-9]/.test(out) ? '-' : '') + out;
}

export function isDateFormat(code) {
  if (!code || /general/i.test(code)) return false;
  const sec = splitSections(code)[0].replace(/\[(?:Red|Black|Blue|Green|White|Yellow|Magenta|Cyan|Color\s*\d+)\]/gi, '');
  return isDateSection(tokens(sec));
}
