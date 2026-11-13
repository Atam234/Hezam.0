/**
 * Google ML Kit on-device translation — the bridge between the user and the AI models.
 * Tagalog questions are translated to English for the model, and the model's English
 * answer is translated back to Tagalog. After a one-time language pack download it
 * works offline.
 */
import Native from '../../modules/hezam-translate';
import type { Lang } from '../router/language';
import { translateMarkdown } from './markdown';

/** False on iOS and web, where the native module is not built. */
export const available = Native !== null;

export type PackState = 'unavailable' | 'missing' | 'ready';

const PACKS: Lang[] = ['tl', 'en'];

export async function packState(): Promise<PackState> {
  if (!Native) return 'unavailable';
  try {
    for (const lang of PACKS) {
      if (!(await Native.isModelDownloaded(lang))) return 'missing';
    }
    return 'ready';
  } catch {
    return 'missing';
  }
}

/** Downloads the Tagalog and English packs if needed (needs internet the first time). */
export async function ensurePacks(): Promise<void> {
  if (!Native) throw new Error('Google translation is not available on this device');
  for (const lang of PACKS) {
    if (!(await Native.isModelDownloaded(lang))) await Native.downloadModel(lang);
  }
}

/** Translates Markdown text, keeping code blocks and inline code unchanged. */
export async function translate(text: string, from: Lang, to: Lang): Promise<string> {
  if (!Native) throw new Error('Google translation is not available on this device');
  const native = Native;
  return translateMarkdown(text, (chunk) => native.translate(chunk, from, to));
}
