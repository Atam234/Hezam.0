export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  temperature: number;
  maxTokens: number;
}

export interface GenerateResult {
  text: string;
  tokensPerSecond?: number;
}

/** Splits DeepSeek-style `<think>…</think>` reasoning from the visible answer. */
export function splitThinking(raw: string): { answer: string; thinking: boolean } {
  const open = raw.indexOf('<think>');
  if (open === -1) return { answer: raw, thinking: false };
  const close = raw.indexOf('</think>', open);
  if (close === -1) return { answer: raw.slice(0, open).trim(), thinking: true };
  return {
    answer: (raw.slice(0, open) + raw.slice(close + '</think>'.length)).trim(),
    thinking: false,
  };
}
