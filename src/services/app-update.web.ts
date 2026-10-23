const WAIT_MS = 20000;

/**
 * Asks the service worker to look for a new version of the app on the site.
 * Resolves true once a new version is downloaded and ready (it takes over on reload).
 */
export async function downloadAppUpdate(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  await registration.update();
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return false;
  if (worker.state === 'activated') return true;
  // The new version downloads every file before it activates; wait for that (or give up after a while).
  return new Promise((resolve) => {
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

/** Reloads into the new version. The form in progress is kept: it's saved as a draft on every change. */
export function restartApp() {
  window.location.reload();
}
