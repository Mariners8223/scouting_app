import { BUILD_ID } from '@/content/build-id';

const WAIT_MS = 20000;

/** The build id the site has now (version.json is never cached by the service worker). */
async function siteBuildId() {
  const url = new URL('version.json', document.baseURI);
  url.searchParams.set('t', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store' });
  return ((await response.json()) as { build?: string }).build;
}

/** Waits until the service worker has stored every file of the new version, so a reload opens it even offline. */
async function newVersionStored(registration: ServiceWorkerRegistration) {
  await registration.update();
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return true; // already installed and active (skipWaiting)
  if (worker.state === 'activated') return true;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), WAIT_MS);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        clearTimeout(timer);
        resolve(true);
      } else if (worker.state === 'redundant') {
        clearTimeout(timer);
        resolve(false);
      }
    });
  });
}

/**
 * Looks for a newer version of the app on the site. Resolves true once it is downloaded and ready
 * (it takes over on restart). Compares build ids, so it also catches a version the service worker
 * already installed in the background while this page kept running the old one.
 */
export async function downloadAppUpdate(): Promise<boolean> {
  if (BUILD_ID === 'dev' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const latest = await siteBuildId();
  if (!latest || latest === BUILD_ID) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return true; // no offline copy to update; a reload loads the new version
  return newVersionStored(registration);
}

/** Reloads into the new version. The form in progress is kept: it's saved as a draft on every change. */
export function restartApp() {
  window.location.reload();
}
