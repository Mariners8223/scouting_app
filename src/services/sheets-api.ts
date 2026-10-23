import { WEB_APP_URL } from '@/config';
import type { SheetRow } from '@/form/sheet-row';
import type { FormSchema } from '@/form/types';

/** Calls to the Apps Script web app (apps-script/Code.gs), the app's only server. */

const TIMEOUT_MS = 20000;

async function callScript<T>(action: string, payload: object): Promise<T> {
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
    // Code.gs always answers with "ok"; anything else is another script (e.g. an older deployment at this URL).
    if (typeof result?.ok !== 'boolean') {
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

/** The header row of a spreadsheet tab, for picking question columns. */
export async function fetchHeaders(spreadsheetId: string, sheet: string, code: string) {
  const result = await callScript<{ headers: string[] }>('headers', { spreadsheetId, sheet, code });
  return result.headers;
}

export type FindTarget = { spreadsheetId?: string; sheet: string; keyColumn?: string };

/** A saved form's row, looked up by key in each target until one has it. */
export async function findRow(key: string, targets: FindTarget[]) {
  return callScript<{ found: boolean; target?: number; headers?: string[]; values?: unknown[] }>('find', {
    key,
    targets,
  });
}
