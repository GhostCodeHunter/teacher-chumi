// ടീച്ചർ.Chumi service worker: works offline once installed or visited.
const VERSION = 'chumi-v3';
const SHELL = [
  './',
  "./assets/chumi-bird-sm.webp",
  "./assets/chumi-bird.webp",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/logo.svg",
  "./css/style.css",
  "./index.html",
  "./js/book-engine.js",
  "./js/main.js",
  "./js/pdfview.js",
  "./js/sample.js",
  "./js/studio.js",
  "./js/templates.js",
  "./js/thumbs.js",
  "./js/xlsx-reader.js",
  "./lib/jszip.min.js",
  "./lib/pdf-lib.min.js",
  "./lib/pdf.min.mjs",
  "./lib/pdf.worker.min.mjs",
  "./lib/standard_fonts/FoxitDingbats.pfb",
  "./lib/standard_fonts/FoxitFixed.pfb",
  "./lib/standard_fonts/FoxitFixedBold.pfb",
  "./lib/standard_fonts/FoxitFixedBoldItalic.pfb",
  "./lib/standard_fonts/FoxitFixedItalic.pfb",
  "./lib/standard_fonts/FoxitSerif.pfb",
  "./lib/standard_fonts/FoxitSerifBold.pfb",
  "./lib/standard_fonts/FoxitSerifBoldItalic.pfb",
  "./lib/standard_fonts/FoxitSerifItalic.pfb",
  "./lib/standard_fonts/FoxitSymbol.pfb",
  "./lib/standard_fonts/LICENSE_FOXIT",
  "./lib/standard_fonts/LICENSE_LIBERATION",
  "./lib/standard_fonts/LiberationSans-Bold.ttf",
  "./lib/standard_fonts/LiberationSans-BoldItalic.ttf",
  "./lib/standard_fonts/LiberationSans-Italic.ttf",
  "./lib/standard_fonts/LiberationSans-Regular.ttf",
  "./manifest.webmanifest",
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// stale-while-revalidate: open instantly from the cache, update it in the background
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: sameOrigin });
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => hit || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
      return hit || net;
    })
  );
});
