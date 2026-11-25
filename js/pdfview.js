// PDF.js wrapper: load bytes, render pages to canvas
let lib = null;
let libPromise = null;

export function loadLib() {
  if (!libPromise) {
    libPromise = import('../lib/pdf.min.mjs').then(m => {
      m.GlobalWorkerOptions.workerSrc = new URL('../lib/pdf.worker.min.mjs', import.meta.url).href;
      lib = m;
      return m;
    });
  }
  return libPromise;
}

export async function openPdf(bytes) {
  const m = await loadLib();
  const task = m.getDocument({
    data: bytes.slice(),
    standardFontDataUrl: new URL('../lib/standard_fonts/', import.meta.url).href,
    isEvalSupported: false,
  });
  return task.promise;
}

export async function renderPage(pdf, num, canvas, cssWidth) {
  const page = await pdf.getPage(num);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = (cssWidth / base.width) * dpr;
  const vp = page.getViewport({ scale });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp });
  canvas._task = task;
  await task.promise;
  canvas._task = null;
  return { w: base.width, h: base.height };
}

export function cancelRender(canvas) {
  if (canvas && canvas._task) { try { canvas._task.cancel(); } catch { /* ignore */ } canvas._task = null; }
}

export function closePdf(pdf) {
  if (!pdf) return;
  try { if (pdf.loadingTask && pdf.loadingTask.destroy) pdf.loadingTask.destroy(); else if (pdf.destroy) pdf.destroy(); } catch { /* ignore */ }
}
