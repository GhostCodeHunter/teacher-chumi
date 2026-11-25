// Install as an app on a laptop / PC (and phones), plus offline support.
const $$ = (s) => Array.from(document.querySelectorAll(s));
let deferred = null;

const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
const show = (on) => $$('[data-install]').forEach((b) => { b.hidden = !on; });

export function initInstall(toast) {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('offline mode not available', e)));
  }
  if (standalone()) return; // already running as the installed app
  // show the button everywhere; browsers that can't prompt get short instructions
  show(true);
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; show(true); });
  addEventListener('appinstalled', () => { deferred = null; show(false); toast && toast('Installed! Open ടീച്ചർ.Chumi from your apps.'); });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-install]');
    if (!b) return;
    if (deferred) {
      const ev = deferred; deferred = null;
      ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === 'accepted') show(false);
    } else {
      const d = document.getElementById('installHelp');
      if (d && d.showModal) d.showModal();
    }
  });
}
