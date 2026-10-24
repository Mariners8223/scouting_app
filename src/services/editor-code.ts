import * as Crypto from 'expo-crypto';

import { EDITOR_CODE_SHA256 } from '@/config';

/** Checks the editor code on the phone. Publishing is checked again by the Apps Script, which is the real lock. */
export async function isEditorCode(code: string) {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, code);
  return hash === EDITOR_CODE_SHA256;
}
