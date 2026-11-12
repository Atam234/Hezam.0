/**
 * Web preview stand-in. Browsers cannot run the native llama.cpp engine,
 * so "downloads" here are simulated and nothing is fetched.
 */
import type { ModelInfo } from '../models/catalog';

const KEY = 'hezam.demo.installed';
const cancelled = new Set<string>();

function read(): string[] {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable; demo state just won't persist
  }
}

export const modelPath = (m: ModelInfo) => `demo://${m.file}`;

export async function listInstalled(): Promise<string[]> {
  return read();
}

export async function freeSpaceBytes(): Promise<number> {
  return 0;
}

export async function downloadModel(
  m: ModelInfo,
  onProgress: (fraction: number) => void,
): Promise<boolean> {
  cancelled.delete(m.id);
  for (let i = 1; i <= 20; i++) {
    await new Promise((r) => setTimeout(r, 60));
    if (cancelled.has(m.id)) return false;
    onProgress(i / 20);
  }
  write([...new Set([...read(), m.id])]);
  return true;
}

export async function cancelDownload(m: ModelInfo): Promise<void> {
  cancelled.add(m.id);
}

export async function deleteModel(m: ModelInfo): Promise<void> {
  write(read().filter((id) => id !== m.id));
}
