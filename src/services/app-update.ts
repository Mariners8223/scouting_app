/**
 * Native builds get new versions from the store / EAS, so there is nothing to check here.
 * The web version (app-update.web.ts) asks the service worker for a new version of the PWA.
 */
export async function downloadAppUpdate(): Promise<boolean> {
  return false;
}

export function restartApp() {}
