import { WEB_APP_URL } from '@/config';

/** One form to append to a tab of the scouting spreadsheet. */
export type SheetRow = {
  /** Tab name in the spreadsheet; created if missing. */
  sheet: string;
  /** Preferred column order; columns the sheet already has are never moved. */
  columns: string[];
  row: Record<string, string>;
};

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
