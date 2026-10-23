import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/** Small JSON wrapper so the rest of the app never touches the storage library directly. */

export const KEYS = {
  templates: 'scouting/templates',
  activeTemplateId: 'scouting/activeTemplateId',
  submissions: 'scouting/submissions',
  draft: 'scouting/draft',
  /** The published "in use" template last applied, so a phone only switches once per change. */
  publishedInUseId: 'scouting/publishedInUseId',
} as const;

export async function loadJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    console.error(`Failed to read ${key}`, e);
    return null;
  }
}

export async function saveJson(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function remove(key: string) {
  await AsyncStorage.removeItem(key);
}

/** On web, asks the browser not to clear the saved forms when the phone runs low on space. */
export async function requestPersistentStorage() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch (e) {
    console.warn('Persistent storage was not granted', e);
  }
}
