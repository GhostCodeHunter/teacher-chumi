// Design library: plain, picture backgrounds and vector templates.
import { TEMPLATES } from './templates.js';

// safe = share of the picture (left, top, right, bottom) kept clear for the content
export const PICTURES = [
  { id: 'img:school-doodles', name: 'School Doodles', src: 'assets/designs/school-doodles.jpg', thumb: 'assets/designs/school-doodles-thumb.jpg', w: 1654, h: 2481, fill: '#FEFEFE', safe: { l: 0.09, t: 0.16, r: 0.09, b: 0.17 } },
  { id: 'img:pastel-bows', name: 'Pastel Bows', src: 'assets/designs/pastel-bows.jpg', thumb: 'assets/designs/pastel-bows-thumb.jpg', w: 1654, h: 2486, fill: '#FEFEFE', safe: { l: 0.1, t: 0.1, r: 0.1, b: 0.16 } },
  { id: 'img:leafy-garden', name: 'Leafy Garden', src: 'assets/designs/leafy-garden.jpg', thumb: 'assets/designs/leafy-garden-thumb.jpg', w: 1654, h: 2338, fill: '#FEFEFE', safe: { l: 0.09, t: 0.08, r: 0.09, b: 0.1 } },
  { id: 'img:classroom-fun', name: 'Classroom Fun', src: 'assets/designs/classroom-fun.jpg', thumb: 'assets/designs/classroom-fun-thumb.jpg', w: 1654, h: 2343, fill: '#FEF9F3', safe: { l: 0.08, t: 0.2, r: 0.08, b: 0.08 } },
  { id: 'img:sunny-kids', name: 'Sunny Kids', src: 'assets/designs/sunny-kids.jpg', thumb: 'assets/designs/sunny-kids-thumb.jpg', w: 1654, h: 2937, fill: '#FDFDFD', safe: { l: 0.08, t: 0.15, r: 0.08, b: 0.29 } },
].map(p => ({ ...p, fit: 'contain', type: 'image/jpeg', builtIn: true }));

export const TEMPLATE_DESIGNS = TEMPLATES.map(t => ({ id: 'tpl:' + t.id, name: t.name, note: t.note, tpl: t.id }));

export function allDesigns(userImages = []) {
  return [
    { id: 'none', name: 'Plain (no design)' },
    ...PICTURES,
    ...TEMPLATE_DESIGNS,
    ...userImages.filter(i => i.role === 'bg').map(i => ({ id: i.id, name: i.name, user: true, thumb: i.url })),
  ];
}

export function designName(id, userImages = []) {
  if (!id || id === 'none') return 'Plain';
  const d = allDesigns(userImages).find(x => x.id === id);
  return d ? d.name : 'Plain';
}

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function designOptionsHtml(userImages = [], selected = '', firstLabel = null) {
  const opt = (d) => `<option value="${esc(d.id)}"${d.id === selected ? ' selected' : ''}>${esc(d.name)}</option>`;
  const users = userImages.filter(i => i.role === 'bg');
  return (firstLabel !== null ? `<option value=""${selected === '' ? ' selected' : ''}>${esc(firstLabel)}</option>` : '')
    + `<option value="none"${selected === 'none' ? ' selected' : ''}>Plain (no design)</option>`
    + `<optgroup label="Pictures">${PICTURES.map(opt).join('')}</optgroup>`
    + `<optgroup label="Shapes and colours">${TEMPLATE_DESIGNS.map(opt).join('')}</optgroup>`
    + (users.length ? `<optgroup label="Your designs">${users.map(i => opt({ id: i.id, name: i.name })).join('')}</optgroup>` : '');
}

// load the picture files that the book actually uses
const cache = new Map();
export async function loadPictures(ids) {
  const out = [];
  for (const p of PICTURES) {
    if (!ids.has(p.id)) continue;
    if (!cache.has(p.id)) {
      cache.set(p.id, fetch(p.src).then(r => { if (!r.ok) throw new Error('Design picture could not be loaded: ' + p.name); return r.arrayBuffer(); }).then(b => new Uint8Array(b)));
    }
    try { out.push({ ...p, bytes: await cache.get(p.id) }); }
    catch (e) { cache.delete(p.id); throw e; }
  }
  return out;
}
