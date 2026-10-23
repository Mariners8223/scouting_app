import { WEB_APP_URL } from '@/config';
import type { SheetRow } from '@/form/sheet-row';

const TIMEOUT_MS = 20000;

/**
 * Sends all pending forms in one request, since a cellular connection may only last a moment.
 * Returns the submission ids the spreadsheet confirmed (including ones it already had).
 */
export async function sendRows(rows: SheetRow[]): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // text/plain avoids a CORS preflight, which Apps Script cannot answer.
    const response = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submit', submissions: rows }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!result?.ok) throw new Error(result?.error ?? `HTTP ${response.status}`);
    return result.saved ?? [];
  } finally {
    clearTimeout(timer);
  }
}
