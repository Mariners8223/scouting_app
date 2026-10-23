import * as Crypto from 'expo-crypto';

import { EDITOR_CODE_SHA256 } from '@/config';

/** Checks the editor code on the phone. Publishing is checked again by the Apps Script, which is the real lock. */
export async function isEditorCode(code: string) {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, code);
  return hash === EDITOR_CODE_SHA256;
}

/** Accepts a full Google Sheets link or a bare id, e.g. ".../spreadsheets/d/<id>/edit#gid=0". */
export function spreadsheetIdFrom(text: string) {
  const trimmed = text.trim();
  return trimmed.match(/\/d\/([\w-]{20,})/)?.[1] ?? trimmed;
}
