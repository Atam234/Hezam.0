/**
 * Web preview engine. The real engine (engine.ts) needs native llama.cpp,
 * which a browser cannot load, so this streams a canned reply that only
 * demonstrates the routing and the interface. No AI runs here.
 */
import type { ChatTurn, GenerateOptions, GenerateResult } from './types';

export const isDemo = true;

let loadedId: string | null = null;
let loadedContext = 0;
let stopped = false;

export const loadedModelId = () => loadedId;
export const isLoaded = (modelId: string, contextTokens: number) =>
  loadedId === modelId && loadedContext === contextTokens;

export async function ensureLoaded(
  modelId: string,
  _path: string,
  contextTokens: number,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (loadedId === modelId && loadedContext === contextTokens) return;
  for (let i = 1; i <= 5; i++) {
    await new Promise((r) => setTimeout(r, 60));
    onProgress?.(i / 5);
  }
  loadedId = modelId;
  loadedContext = contextTokens;
}

export async function generate(
  messages: ChatTurn[],
  _options: GenerateOptions,
  onText: (fullText: string) => void,
): Promise<GenerateResult> {
  stopped = false;
  const question = messages[messages.length - 1]?.content ?? '';
  const system = messages[0]?.content ?? '';
  if (/Hezam\.0's agent/.test(system)) {
    // Demo agent: list the folder once, then report it.
    const seen = messages.find((m) => m.content.startsWith('Result of list_files'));
    const demo = seen
      ? JSON.stringify({ final: `Demo: I found these files:\n${seen.content.split('\n').slice(1, -2).join('\n')}` })
      : JSON.stringify({ thought: 'look in the folder', tool: 'list_files', args: { path: '' } });
    onText(demo);
    return { text: demo, tokensPerSecond: 42 };
  }
  const isCode = /coding specialist/.test(system);
  if (/professional translator/.test(system)) {
    const fake = `*(Demo translation into ${/Tagalog/.test(system) ? 'Tagalog' : 'English'})*\n\n${question}`;
    onText(fake);
    return { text: fake, tokensPerSecond: 42 };
  }
  const reply = isCode
    ? `**Demo mode (web preview).** In the real app, the coding model answers here offline.\n\n\`\`\`python\ndef greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Hezam"))\n\`\`\``
    : `**Demo mode (web preview).** No AI runs in the browser. Install the app on a phone for real answers from a local model.`;

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
  loadedContext = 0;
  loadedId = null;
}
