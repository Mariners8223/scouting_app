import { WEB_APP_URL } from '@/config';
import type { SheetRow } from '@/form/sheet-row';
import type { FormSchema } from '@/form/types';

/** Calls to the Apps Script web app (apps-script/Code.gs), the app's only server. */

const TIMEOUT_MS = 20000;
const ATTEMPTS = 3;

/** Thrown when the request reached Google but the reply wasn't the script's; worth trying again. */
class BadReply extends Error {}

async function callOnce<T>(action: string, payload: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // text/plain avoids a CORS preflight, which Apps Script cannot answer.
    const response = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => undefined);
    // Google sometimes answers with an HTML error page for a moment.
    if (result === undefined) throw new BadReply('Google didn’t answer properly. Try again in a moment.');
    // Code.gs always answers with "ok"; JSON without it is another script (e.g. an older deployment at this URL).
    if (typeof result.ok !== 'boolean') {
      throw new Error(
        'The Google script at this address is an old version. Deploy the new Code.gs as a new version of the existing deployment.',
      );
    }
    if (!result.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    return result as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tries a few times when the connection drops or Google gives a one-off error page. Every action is
 * safe to repeat: a resent form is skipped by its key, and publishing replaces the same row.
 */
async function callScript<T>(action: string, payload: object): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await callOnce<T>(action, payload);
    } catch (e) {
      const retryable = e instanceof BadReply || e instanceof TypeError || (e instanceof Error && e.name === 'AbortError');
      if (!retryable || attempt === ATTEMPTS) throw e;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/**
 * Sends all pending forms in one request, since a cellular connection may only last a moment.
 * Returns the submission ids the spreadsheet confirmed (including ones it already had) and the ones it refused.
 */
export async function sendRows(rows: SheetRow[]) {
  const result = await callScript<{ saved?: string[]; errors?: { id: string; error: string }[] }>('submit', {
    submissions: rows,
  });
  return { saved: result.saved ?? [], errors: result.errors ?? [] };
}

/** The templates published for all phones, and the one they should scout with. */
export async function fetchPublished() {
  const result = await callScript<{ templates: FormSchema[]; inUseId: string | null }>('templates', {});
  return { templates: result.templates ?? [], inUseId: result.inUseId ?? undefined };
}

export async function publishTemplate(template: FormSchema, code: string, inUse: boolean) {
  await callScript('publish', { template, code, inUse });
}

export type SheetInfo = {
  /** False when the tab doesn't exist yet; the first form creates it. */
  exists: boolean;
  headers: string[];
  /** Named ranges on this tab: lowercase name -> column letter. */
  named: Record<string, string>;
  /** Lowercase names used on other tabs of the spreadsheet (e.g. a dashboard's input cell). */
  elsewhere: string[];
};

/** A tab's headers and named ranges, to show where each question's answer will go. */
export async function fetchSheetInfo(spreadsheetId: string | undefined, sheet: string, code: string) {
  return callScript<SheetInfo>('sheetInfo', { spreadsheetId, sheet, code });
}

/** Gives columns named ranges, e.g. { team: 'E' }; names already used on another tab are skipped. */
export async function nameColumns(
  spreadsheetId: string | undefined,
  sheet: string,
  columns: Record<string, string>,
  code: string,
) {
  return callScript<{ named: string[]; skipped: string[] }>('nameColumns', { spreadsheetId, sheet, columns, code });
}

export type FindTarget = { spreadsheetId?: string; sheet: string; keyName?: string; keyColumn?: string };

/** A saved form's row, looked up by key in each target until one has it. */
export async function findRow(key: string, targets: FindTarget[]) {
  return callScript<{
    found: boolean;
    target?: number;
    headers?: string[];
    values?: unknown[];
    named?: Record<string, unknown>;
  }>('find', { key, targets });
}
