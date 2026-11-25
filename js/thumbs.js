// Real template previews: build a tiny book with the engine and draw one page.
import { buildBook } from './book-engine.js';
import { openPdf, renderPage, closePdf } from './pdfview.js';

const n = (v) => ({ t: 'n', v, fmt: 'num', dec: null });
const s = (v) => ({ t: 's', v });
const MINI = {
  sheets: [{
    name: 'Exercise 1',
    rows: [
      [s('Q1'), s('Q2'), s('Q3'), s('Q4')],
      [n(4), n(8), n(2), n(6)], [n(3), n(-5), n(7), n(1)], [n(-2), n(4), n(-6), n(-3)], [n(5), n(2), n(1), n(9)],
      [s('___'), s('___'), s('___'), s('___')],
      [],
      [s('Q5'), s('Q6'), s('Q7'), s('Q8')],
      [n(7), n(3), n(9), n(5)], [n(-4), n(6), n(-8), n(2)], [n(6), n(-1), n(4), n(-3)],
      [s('___'), s('___'), s('___'), s('___')],
    ],
    merges: [],
  }],
  chapters: [{ sheet: 0, title: 'Exercise 1', include: true }],
};

let queue = Promise.resolve();

export function drawThumb(canvas, templateId, settings, kind = 'content', cssWidth = 150) {
  queue = queue.then(async () => {
    const opts = {
      ...settings, template: templateId, cover: kind === 'cover', toc: false,
      pageSize: 'A4', orientation: 'portrait', bgId: null, wmType: 'none', baseSize: 'auto', margin: 'auto', mirror: false,
      title: kind === 'cover' ? (settings.title || 'My Maths Book') : settings.title,
    };
    try {
      const res = await buildBook(MINI, opts, []);
      const pdf = await openPdf(res.bytes);
      await renderPage(pdf, 1, canvas, cssWidth);
      closePdf(pdf);
      canvas.dataset.ok = '1';
    } catch (e) {
      console.warn('thumb', templateId, e);
    }
  });
  return queue;
}
