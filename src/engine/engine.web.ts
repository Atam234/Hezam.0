/**
 * Web preview engine. The real engine (engine.ts) needs native llama.cpp,
 * which a browser cannot load, so this streams a canned reply that only
 * demonstrates the routing and the interface. No AI runs here.
 */
import type { ChatTurn, GenerateOptions, GenerateResult } from './types';

export const CONTEXT_TOKENS = 4096;
export const isDemo = true;

let loadedId: string | null = null;
let stopped = false;

export const loadedModelId = () => loadedId;

export async function ensureLoaded(
  modelId: string,
  _path: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (loadedId === modelId) return;
  for (let i = 1; i <= 5; i++) {
    await new Promise((r) => setTimeout(r, 60));
    onProgress?.(i / 5);
  }
  loadedId = modelId;
}

export async function generate(
  messages: ChatTurn[],
  _options: GenerateOptions,
  onText: (fullText: string) => void,
): Promise<GenerateResult> {
  stopped = false;
  const question = messages[messages.length - 1]?.content ?? '';
  const isCode = /coding specialist/.test(messages[0]?.content ?? '');
  const reply = isCode
    ? `**Demo mode (web preview).** In the real app, the coding model answers here offline.\n\n\`\`\`python\ndef greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Hezam"))\n\`\`\`\n\n- You asked: *${question.slice(0, 80)}*`
    : `**Demo mode (web preview).** No AI runs in the browser. Install the app on a phone for real answers from a local model.\n\nYou asked: *${question.slice(0, 80)}*`;

  let text = '';
  for (const word of reply.split(/(?<=\s)/)) {
    if (stopped) break;
    await new Promise((r) => setTimeout(r, 15));
    text += word;
    onText(text);
  }
  return { text, tokensPerSecond: 42 };
}

export async function stop(): Promise<void> {
  stopped = true;
}

export async function unload(): Promise<void> {
  loadedId = null;
}
