/**
 * On-device inference through llama.rn (React Native binding of llama.cpp).
 * Only one model is kept in memory at a time: phones do not have the RAM
 * for several, so switching specialists swaps the loaded model.
 */
import { Platform } from 'react-native';
import { initLlama, type LlamaContext } from 'llama.rn';

import type { ChatTurn, GenerateOptions, GenerateResult } from './types';

const STOP_WORDS = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<end_of_turn>',
  '<|endoftext|>',
  '<｜end▁of▁sentence｜>',
];

let context: LlamaContext | null = null;
let loadedId: string | null = null;
let loadedContext = 0;

export const isDemo = false;
export const loadedModelId = () => loadedId;
export const isLoaded = (modelId: string, contextTokens: number) =>
  loadedId === modelId && loadedContext === contextTokens;

export async function ensureLoaded(
  modelId: string,
  path: string,
  contextTokens: number,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (context && loadedId === modelId && loadedContext === contextTokens) return;
  await unload();
  context = await initLlama(
    {
      model: path,
      n_ctx: contextTokens,
      // Metal on iOS. Android stays on CPU, which works on every device.
      n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
      use_mlock: false,
    },
    (p) => onProgress?.(p / 100),
  );
  loadedId = modelId;
  loadedContext = contextTokens;
}

export async function generate(
  messages: ChatTurn[],
  options: GenerateOptions,
  onText: (fullText: string) => void,
): Promise<GenerateResult> {
  if (!context) throw new Error('No model loaded');
  let text = '';
  const result = await context.completion(
    {
      messages,
      n_predict: options.maxTokens,
      temperature: options.temperature,
      top_p: 0.9,
      stop: STOP_WORDS,
    },
    (data) => {
      text += data.token;
      onText(text);
    },
  );
  return {
    text: result.text || text,
    tokensPerSecond: result.timings?.predicted_per_second,
  };
}

export async function stop(): Promise<void> {
  await context?.stopCompletion();
}

export async function unload(): Promise<void> {
  const old = context;
  context = null;
  loadedId = null;
  loadedContext = 0;
  await old?.release();
}
