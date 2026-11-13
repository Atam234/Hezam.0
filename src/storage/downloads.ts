import * as FileSystem from 'expo-file-system/legacy';

import * as DocumentPicker from 'expo-document-picker';

import { HezamFiles } from '../../modules/hezam-translate';
import { allModels, modelUrl, type ModelInfo } from '../models/catalog';

const DIR = `${FileSystem.documentDirectory}models/`;

export const modelPath = (m: ModelInfo) => `${DIR}${m.file}`;
const partPath = (m: ModelInfo) => `${modelPath(m)}.part`;

const active = new Map<string, FileSystem.DownloadResumable>();

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

/** IDs of models whose GGUF file is fully downloaded. */
export async function listInstalled(): Promise<string[]> {
  await ensureDir();
  const found: string[] = [];
  for (const m of allModels()) {
    const info = await FileSystem.getInfoAsync(modelPath(m));
    if (info.exists) found.push(m.id);
  }
  return found;
}

export async function freeSpaceBytes(): Promise<number> {
  return FileSystem.getFreeDiskStorageAsync();
}

/**
 * Download a model from Hugging Face. Resolves true when finished,
 * false when cancelled. Writes to a .part file so a half-finished
 * download is never mistaken for an installed model.
 */
export async function downloadModel(
  m: ModelInfo,
  onProgress: (fraction: number) => void,
): Promise<boolean> {
  await ensureDir();
  await FileSystem.deleteAsync(partPath(m), { idempotent: true });

  const task = FileSystem.createDownloadResumable(modelUrl(m), partPath(m), {}, (p) => {
    const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : m.sizeBytes;
    onProgress(Math.min(1, p.totalBytesWritten / total));
  });
  active.set(m.id, task);

  try {
    const result = await task.downloadAsync();
    if (!active.has(m.id) || !result) return false; // cancelled
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Hugging Face returned HTTP ${result.status}`);
    }
    await FileSystem.moveAsync({ from: partPath(m), to: modelPath(m) });
    return true;
  } catch (e) {
    if (!active.has(m.id)) return false; // cancelled mid-flight
    throw e;
  } finally {
    active.delete(m.id);
    await FileSystem.deleteAsync(partPath(m), { idempotent: true });
  }
}

export async function cancelDownload(m: ModelInfo): Promise<void> {
  const task = active.get(m.id);
  if (!task) return;
  active.delete(m.id);
  try {
    await task.pauseAsync();
  } catch {
    // already finished or never started
  }
}

export async function deleteModel(m: ModelInfo): Promise<void> {
  await FileSystem.deleteAsync(modelPath(m), { idempotent: true });
}

export interface ImportedFile {
  name: string;
  file: string;
  sizeBytes: number;
}

/**
 * Lets the user pick a .gguf model from their own storage and copies it into the app.
 * Resolves null when the picker is cancelled. The app keeps its own copy, so the
 * original file can be moved or deleted afterwards.
 */
export async function importModel(id: string): Promise<ImportedFile | null> {
  // On Android the picker must NOT copy the file itself: it does that on the UI thread,
  // which freezes and kills the app for a multi-gigabyte model. Our native module
  // streams the file on a background thread instead.
  const native = HezamFiles;
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: !native });
  if (picked.canceled) return null;
  const asset = picked.assets[0];

  if (!/\.gguf$/i.test(asset.name)) {
    if (!native) await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => {});
    throw new Error(`"${asset.name}" is not a .gguf model file.`);
  }
  if (asset.size) {
    const free = await FileSystem.getFreeDiskStorageAsync().catch(() => 0);
    if (free > 0 && asset.size > free) {
      if (!native) await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => {});
      throw new Error('Not enough free storage to copy this model into the app.');
    }
  }

  await ensureDir();
  const file = `custom-${id}.gguf`;
  const target = `${DIR}${file}`;
  let sizeBytes = asset.size ?? 0;
  if (native) {
    sizeBytes = await native.importGguf(asset.uri, target);
  } else {
    await FileSystem.moveAsync({ from: asset.uri, to: target });
  }
  return { name: asset.name.replace(/\.gguf$/i, ''), file, sizeBytes };
}
