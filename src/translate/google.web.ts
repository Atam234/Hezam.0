/** Web preview stand-in for the Google ML Kit bridge: marks text instead of translating it. */
import type { Lang } from '../router/language';
import { translateMarkdown } from './markdown';

export const available = true;
export type PackState = 'unavailable' | 'missing' | 'ready';

let ready = false;

export async function packState(): Promise<PackState> {
  return ready ? 'ready' : 'missing';
}

export async function ensurePacks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 300));
  ready = true;
}

export async function translate(text: string, _from: Lang, to: Lang): Promise<string> {
  return translateMarkdown(text, async (chunk) => `[${to}] ${chunk}`);
}
