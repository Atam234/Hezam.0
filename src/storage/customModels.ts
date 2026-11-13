import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ModelInfo } from '../models/catalog';
import type { SpecialistId } from '../router/router';

/** A GGUF model the user imported from their own files. */
export interface CustomModel {
  id: string;
  name: string;
  file: string;
  sizeBytes: number;
  /** The specialist the user says this model is good at. */
  role: SpecialistId;
}

const KEY = 'hezam.customModels.v1';

export async function loadCustomModels(): Promise<CustomModel[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CustomModel[]) : [];
  } catch {
    return [];
  }
}

export async function saveCustomModels(list: CustomModel[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export function toModelInfo(m: CustomModel): ModelInfo {
  return {
    id: m.id,
    name: m.name,
    author: 'Imported',
    repo: '',
    file: m.file,
    sizeBytes: m.sizeBytes,
    license: '',
    // A model needs roughly its file size plus working memory.
    minRamGb: Math.max(2, Math.ceil((m.sizeBytes / 1e9) * 1.5 + 1)),
    roles: m.role === 'general' ? ['general'] : [m.role, 'general'],
    note: 'Imported from your files.',
    custom: true,
  };
}
