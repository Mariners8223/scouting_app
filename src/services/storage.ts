import AsyncStorage from '@react-native-async-storage/async-storage';

/** Small JSON wrapper so the rest of the app never touches the storage library directly. */

export const KEYS = {
  templates: 'scouting/templates',
  activeTemplateId: 'scouting/activeTemplateId',
  submissions: 'scouting/submissions',
  draft: 'scouting/draft',
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
