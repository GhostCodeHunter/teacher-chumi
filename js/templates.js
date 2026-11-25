// ടീച്ചർ.Chumi — page templates (vector art drawn with pdf-lib)
// Each template: { id, name, note, inset (mm of extra content padding), page(ctx), cover(ctx) }
// ctx = { page, w, h, m:{l,r,t,b}, c:{accent, accent2, ink, soft, softer, white}, rgb, deg, index }

const MM = 72 / 25.4;

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function starPath(cx, cy, r, points = 5) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (Math.PI / points) * i - Math.PI / 2;
    d += (i ? 'L' : 'M') + (cx + rad * Math.cos(a)).toFixed(2) + ' ' + (cy + rad * Math.sin(a)).toFixed(2) + ' ';
  }
  return d + 'Z';
}

// draw an SVG path in top-left coordinates
function svg(ctx, d, opts) { ctx.page.drawSvgPath(d, { x: 0, y: ctx.h, ...opts }); }


export function roundRect(x, y, w, h, r) {
  // top-left coordinates (y down)
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
}

function wavyLine(x0, x1, y, amp, len) {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += len) d += ` q${len / 4} ${-amp} ${len / 2} 0 t${len / 2} 0`;
  return d;
}

function balloon(ctx, x, y, r, color) {
  // x,y = top-left coords centre of balloon
  svg(ctx, `M${x} ${y - r * 1.2} C${x + r * 1.1} ${y - r * 1.2} ${x + r * 1.05} ${y + r * 0.5} ${x} ${y + r * 1.05} C${x - r * 1.05} ${y + r * 0.5} ${x - r * 1.1} ${y - r * 1.2} ${x} ${y - r * 1.2} Z`, { color, opacity: 0.85 });
  svg(ctx, `M${x - r * 0.18} ${y + r * 1.22} L${x + r * 0.18} ${y + r * 1.22} L${x} ${y + r * 1.02} Z`, { color, opacity: 0.85 });
  svg(ctx, `M${x} ${y + r * 1.22} q${r * 0.3} ${r * 0.6} 0 ${r * 1.2} t0 ${r * 1.2}`, { borderColor: ctx.c.ink, borderWidth: 0.6, borderOpacity: 0.45 });
  svg(ctx, `M${x - r * 0.45} ${y - r * 0.55} q${r * 0.1} ${-r * 0.35} ${r * 0.4} ${-r * 0.42}`, { borderColor: ctx.c.white, borderWidth: Math.max(1, r * 0.12), borderOpacity: 0.7 });
}

function cloud(ctx, x, y, s, opacity = 1) {
  svg(ctx, `M${x} ${y} a${s * 0.5} ${s * 0.5} 0 0 1 ${s * 0.5} ${-s * 0.45} a${s * 0.6} ${s * 0.6} 0 0 1 ${s * 1.05} ${-s * 0.1} a${s * 0.45} ${s * 0.45} 0 0 1 ${s * 0.55} ${s * 0.55} Z`, { color: ctx.c.white, opacity, borderColor: ctx.c.sky, borderWidth: 1, borderOpacity: 0.5 * opacity });
}

const KIDS = [
  {
    id: 'rainbow', name: 'Rainbow Fun', note: 'Rainbow stripes and a happy cover', inset: 2, kids: true,
    page(ctx) {
      const { page, w, h, m, c } = ctx;
      const band = Math.max(3.5, m.t * 0.07);
      c.pal.forEach((col, i) => page.drawRectangle({ x: 0, y: h - band * (i + 1), width: w, height: band, color: col }));
      const seg = (w - m.l - m.r) / c.pal.length;
      c.pal.forEach((col, i) => page.drawRectangle({ x: m.l + seg * i, y: m.b * 0.38, width: seg, height: 2.4, color: col }));
    },
    cover(ctx) {
      const { w, h, c } = ctx;
      const cx = w / 2, cy = h * 0.96, R = Math.min(w * 0.62, h * 0.4), band = R * 0.089;
      c.pal.forEach((col, i) => {
        const r = R - i * band;
        svg(ctx, `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`, { color: col });
      });
      const inner = R - 5 * band;
      svg(ctx, `M${cx - inner} ${cy} A${inner} ${inner} 0 0 1 ${cx + inner} ${cy} Z`, { color: c.paper });
      cloud(ctx, cx - R - R * 0.03, cy, R * 0.32);
      cloud(ctx, cx + R - R * 0.32, cy, R * 0.32);
      c.pal.forEach((col, i) => ctx.page.drawRectangle({ x: 0, y: (h * 0.05 / c.pal.length) * i, width: w, height: h * 0.05 / c.pal.length, color: col }));
    },
  },
  {
    id: 'balloons', name: 'Party Balloons', note: 'Balloons float in the corners', inset: 0, kids: true,
    page(ctx) {
      const { w, h, m, c, index } = ctx;
      const k = Math.min(m.l, m.r, m.t) * 0.36;
      const flip = index % 2;
      const x = flip ? m.l * 0.5 : w - m.r * 0.5;
      balloon(ctx, x, m.t * 0.55 + k, k, c.pal[index % c.pal.length]);
      balloon(ctx, x + (flip ? k * 1.3 : -k * 1.3), m.t * 0.55 + k * 1.9, k * 0.8, c.pal[(index + 2) % c.pal.length]);
      const r = seeded(11 + index);
      for (let i = 0; i < 9; i++) {
        const px = m.l + r() * (w - m.l - m.r), py = h - m.b * (0.2 + r() * 0.35);
        ctx.page.drawCircle({ x: px, y: h - py, size: 1.4 + r() * 1.6, color: c.pal[i % c.pal.length], opacity: 0.7 });
      }
    },
    cover(ctx) {
      const { w, h, c } = ctx;
      const s = Math.min(w, h * 0.7) / 595;
      [[0.18, 0.14, 46], [0.32, 0.09, 36], [0.78, 0.12, 50], [0.65, 0.07, 32], [0.9, 0.24, 28], [0.08, 0.27, 26]]
        .forEach(([fx, fy, r], i) => balloon(ctx, w * fx, h * fy + r * s, r * s, c.pal[i % c.pal.length]));
      const r = seeded(3);
      for (let i = 0; i < 40; i++) {
        const x = r() * w, y = h * (0.82 + r() * 0.16);
        ctx.page.drawRectangle({ x, y: h - y, width: 3 + r() * 4, height: 2 + r() * 3, color: c.pal[i % c.pal.length], rotate: ctx.deg(r() * 90), opacity: 0.85 });
      }
    },
  },
  {
    id: 'crayon', name: 'Crayon Border', note: 'Wavy hand-drawn colour border', inset: 4, kids: true,
    page(ctx) {
      const { w, h, m, c } = ctx;
      const o = Math.min(m.l, m.r, m.t, m.b) * 0.42;
      const draw = (col, off, wid) => {
        svg(ctx, wavyLine(o, w - o, o + off, 2.2, 22), { borderColor: col, borderWidth: wid, borderOpacity: 0.85 });
        svg(ctx, wavyLine(o, w - o, h - o - off, 2.2, 22), { borderColor: col, borderWidth: wid, borderOpacity: 0.85 });
      };
      draw(c.pal[0], 0, 2.4);
      draw(c.pal[3], 4, 1.2);
      ctx.page.drawLine({ start: { x: o, y: o + 4 }, end: { x: o, y: h - o - 4 }, thickness: 2.4, color: c.pal[2], opacity: 0.85 });
      ctx.page.drawLine({ start: { x: w - o, y: o + 4 }, end: { x: w - o, y: h - o - 4 }, thickness: 2.4, color: c.pal[1], opacity: 0.85 });
    },
    cover(ctx) {
      this.page(ctx);
      const { w, h, c } = ctx;
      const r = seeded(9);
      for (let i = 0; i < 6; i++) {
        const y = h * 0.8 + i * 9;
        svg(ctx, wavyLine(w * 0.15, w * 0.85, y, 3 + r() * 2, 30), { borderColor: c.pal[i % c.pal.length], borderWidth: 4, borderOpacity: 0.75 });
      }
    },
  },
  {
    id: 'clouds', name: 'Sky & Clouds', note: 'Sky blue top with fluffy clouds', inset: 0, kids: true,
    page(ctx) {
      const { page, w, h, m, c, index } = ctx;
      page.drawRectangle({ x: 0, y: h - m.t * 0.62, width: w, height: m.t * 0.62, color: c.sky, opacity: 0.18 });
      const s = m.t * 0.42;
      cloud(ctx, (index % 2 ? w * 0.08 : w * 0.7), m.t * 0.48, s);
      cloud(ctx, (index % 2 ? w * 0.74 : w * 0.14), m.t * 0.38, s * 0.7);
      svg(ctx, `M0 ${h} V${h - m.b * 0.3} Q${w * 0.25} ${h - m.b * 0.5} ${w * 0.5} ${h - m.b * 0.3} T${w} ${h - m.b * 0.3} V${h} Z`, { color: c.mint, opacity: 0.35 });
    },
    cover(ctx) {
      const { page, w, h, c } = ctx;
      page.drawRectangle({ x: 0, y: h * 0.45, width: w, height: h * 0.55, color: c.sky, opacity: 0.22 });
      page.drawCircle({ x: w * 0.82, y: h * 0.86, size: w * 0.08, color: c.sun });
      [[0.1, 0.12, 0.22], [0.55, 0.2, 0.16], [0.2, 0.34, 0.12], [0.7, 0.38, 0.1]].forEach(([fx, fy, fs]) => cloud(ctx, w * fx, h * fy, w * fs));
      svg(ctx, `M0 ${h} V${h * 0.86} Q${w * 0.3} ${h * 0.8} ${w * 0.6} ${h * 0.87} T${w} ${h * 0.84} V${h} Z`, { color: c.mint, opacity: 0.7 });
      svg(ctx, `M0 ${h} V${h * 0.92} Q${w * 0.4} ${h * 0.86} ${w} ${h * 0.93} V${h} Z`, { color: c.mint });
    },
  },
];

export const TEMPLATES = [
  ...KIDS,
  {
    id: 'clean', name: 'Clean', note: 'Plain page, nothing extra', inset: 0,
    page() {},
    cover(ctx) {
      const { page, w, h, c } = ctx;
      page.drawRectangle({ x: w / 2 - w * 0.06, y: h * 0.72, width: w * 0.12, height: 4, color: c.accent });
      page.drawRectangle({ x: w / 2 - w * 0.06, y: h * 0.12, width: w * 0.12, height: 4, color: c.accent2 });
    },
  },
  {
    id: 'classic', name: 'Classic Frame', note: 'Double border, like a printed book', inset: 4,
    page(ctx) {
      const { page, w, h, m, c } = ctx;
      const o = Math.min(m.l, m.r, m.t, m.b) * 0.45;
      page.drawRectangle({ x: o, y: o, width: w - 2 * o, height: h - 2 * o, borderColor: c.ink, borderWidth: 1.1, borderOpacity: 0.85 });
      const i = o + 3.2;
      page.drawRectangle({ x: i, y: i, width: w - 2 * i, height: h - 2 * i, borderColor: c.accent, borderWidth: 0.6 });
      for (const [x, y] of [[o, o], [w - o, o], [o, h - o], [w - o, h - o]]) {
        page.drawRectangle({ x: x - 3, y: y - 3, width: 6, height: 6, color: c.accent });
      }
    },
    cover(ctx) {
      this.page(ctx);
      const { page, w, h, c } = ctx;
      page.drawLine({ start: { x: w * 0.3, y: h * 0.42 }, end: { x: w * 0.7, y: h * 0.42 }, thickness: 0.8, color: c.accent });
      page.drawCircle({ x: w / 2, y: h * 0.42, size: 3, color: c.accent });
    },
  },
  {
    id: 'abacus', name: 'Abacus Beads', note: 'Bead rows on top and bottom', inset: 3,
    page(ctx) {
      const { page, w, h, m, c } = ctx;
      const row = (y) => {
        const x0 = m.l, x1 = w - m.r;
        page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 0.8, color: c.ink, opacity: 0.35 });
        const n = Math.max(8, Math.round((x1 - x0) / 26));
        const step = (x1 - x0) / n;
        for (let i = 0; i < n; i++) {
          const col = i % 5 === 4 ? c.ink : (i % 2 ? c.accent2 : c.accent);
          page.drawEllipse({ x: x0 + step * (i + 0.5), y, xScale: 4.6, yScale: 3.4, color: col, opacity: 0.9 });
        }
      };
      row(h - m.t * 0.42);
      row(m.b * 0.42);
    },
    cover(ctx) {
      const { page, w, h, c } = ctx;
      const fx = w * 0.18, fw = w * 0.64, fy = h * 0.16, fh = h * 0.2;
      page.drawRectangle({ x: fx, y: fy, width: fw, height: fh, borderColor: c.ink, borderWidth: 3, opacity: 0 });
      page.drawLine({ start: { x: fx, y: fy + fh * 0.68 }, end: { x: fx + fw, y: fy + fh * 0.68 }, thickness: 2, color: c.ink });
      const rods = 9;
      const r = seeded(7);
      for (let i = 0; i < rods; i++) {
        const x = fx + (fw / (rods + 1)) * (i + 1);
        page.drawLine({ start: { x, y: fy + 2 }, end: { x, y: fy + fh - 2 }, thickness: 1, color: c.ink, opacity: 0.5 });
        const up = r() > 0.5;
        page.drawEllipse({ x, y: up ? fy + fh * 0.76 : fy + fh * 0.88, xScale: 9, yScale: 5.5, color: c.accent });
        const k = Math.floor(r() * 5);
        for (let b = 0; b < 4; b++) {
          const yy = b < k ? fy + fh * 0.6 - b * 12 : fy + 8 + (3 - b) * 12;
          page.drawEllipse({ x, y: yy, xScale: 9, yScale: 5.5, color: c.accent2 });
        }
      }
      this.page({ ...ctx, m: { l: ctx.w * 0.1, r: ctx.w * 0.1, t: ctx.m.t, b: ctx.m.b } });
    },
  },
  {
    id: 'bloom', name: 'Soft Bloom', note: 'Soft colour circles in two corners', inset: 0,
    page(ctx) {
      const { page, w, h, c } = ctx;
      const k = Math.min(w, h);
      page.drawCircle({ x: w + k * 0.02, y: h + k * 0.02, size: k * 0.16, color: c.accent, opacity: 0.13 });
      page.drawCircle({ x: w - k * 0.1, y: h + k * 0.01, size: k * 0.07, color: c.accent2, opacity: 0.16 });
      page.drawCircle({ x: -k * 0.02, y: -k * 0.02, size: k * 0.14, color: c.accent2, opacity: 0.12 });
      page.drawCircle({ x: k * 0.11, y: -k * 0.01, size: k * 0.05, color: c.accent, opacity: 0.16 });
    },
    cover(ctx) {
      const { page, w, h, c } = ctx;
      const k = Math.min(w, h);
      page.drawCircle({ x: w * 0.95, y: h * 0.92, size: k * 0.42, color: c.accent, opacity: 0.14 });
      page.drawCircle({ x: w * 0.72, y: h * 1.0, size: k * 0.18, color: c.accent2, opacity: 0.2 });
      page.drawCircle({ x: w * 0.05, y: h * 0.06, size: k * 0.36, color: c.accent2, opacity: 0.13 });
      page.drawCircle({ x: w * 0.3, y: h * 0.02, size: k * 0.12, color: c.accent, opacity: 0.2 });
    },
  },
  {
    id: 'ribbon', name: 'Ribbon Band', note: 'Colour band on top, thin line below', inset: 2,
    page(ctx) {
      const { page, w, h, m, c } = ctx;
      const bh = Math.max(6, m.t * 0.22);
      page.drawRectangle({ x: 0, y: h - bh, width: w, height: bh, color: c.accent });
      page.drawRectangle({ x: 0, y: h - bh - 2.5, width: w, height: 1.2, color: c.accent2 });
      page.drawRectangle({ x: m.l, y: m.b * 0.35, width: w - m.l - m.r, height: 1.4, color: c.accent });
    },
    cover(ctx) {
      const { w, h, c } = ctx;
      svg(ctx, `M0 ${h * 0.18} L${w} ${h * 0.05} L${w} ${h * 0.17} L0 ${h * 0.3} Z`, { color: c.accent });
      svg(ctx, `M0 ${h * 0.32} L${w} ${h * 0.19} L${w} ${h * 0.205} L0 ${h * 0.335} Z`, { color: c.accent2 });
      ctx.page.drawRectangle({ x: 0, y: 0, width: w, height: h * 0.05, color: c.ink });
    },
  },
  {
    id: 'notebook', name: 'Notebook', note: 'Faint ruled lines and a margin line', inset: 3,
    page(ctx) {
      const { page, w, h, m, c } = ctx;
      for (let y = h - m.t * 0.9; y > m.b * 0.6; y -= 18) {
        page.drawLine({ start: { x: 0, y }, end: { x: w, y }, thickness: 0.4, color: c.rule, opacity: 0.55 });
      }
      const mx = m.l * 0.6;
      page.drawLine({ start: { x: mx, y: 0 }, end: { x: mx, y: h }, thickness: 0.8, color: c.accent, opacity: 0.6 });
      for (const f of [0.2, 0.5, 0.8]) page.drawCircle({ x: mx * 0.42, y: h * f, size: 3.2, color: c.ink, opacity: 0.12 });
    },
    cover(ctx) {
      this.page(ctx);
      const { page, w, h, c } = ctx;
      page.drawRectangle({ x: w * 0.2, y: h * 0.5, width: w * 0.6, height: h * 0.24, color: c.white, borderColor: c.ink, borderWidth: 1.2, opacity: 0.95 });
    },
  },
  {
    id: 'stars', name: 'Little Stars', note: 'Tiny stars around the edges, for kids', inset: 0,
    page(ctx) {
      const { w, h, m, c, index } = ctx;
      const r = seeded(31 + index * 7);
      const spots = [];
      for (let i = 0; i < 7; i++) {
        const side = i % 4;
        if (side === 0) spots.push([m.l + r() * (w - m.l - m.r), m.t * (0.25 + r() * 0.3)]);
        if (side === 1) spots.push([m.l + r() * (w - m.l - m.r), h - m.b * (0.25 + r() * 0.3)]);
        if (side === 2) spots.push([m.l * (0.25 + r() * 0.4), m.t + r() * (h - m.t - m.b)]);
        if (side === 3) spots.push([w - m.r * (0.25 + r() * 0.4), m.t + r() * (h - m.t - m.b)]);
      }
      spots.forEach(([x, y], i) => svg(ctx, starPath(x, y, 3 + r() * 3.5), { color: i % 2 ? c.accent : c.accent2, opacity: 0.55 }));
    },
    cover(ctx) {
      const { w, h, c } = ctx;
      const r = seeded(5);
      for (let i = 0; i < 26; i++) {
        const x = r() * w, y = r() * h;
        if (x > w * 0.12 && x < w * 0.88 && y > h * 0.3 && y < h * 0.75) continue;
        svg(ctx, starPath(x, y, 4 + r() * 12), { color: i % 3 ? c.accent : c.accent2, opacity: 0.35 + r() * 0.4 });
      }
    },
  },
];

export const templateById = (id) => TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
export const insetPt = (t) => (t.inset || 0) * MM;
