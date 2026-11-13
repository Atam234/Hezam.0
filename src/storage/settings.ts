import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ReplyLanguageSetting } from '../router/language';

export interface Settings {
  /** Language of replies: follow the user, or always one language. */
  replyLanguage: ReplyLanguageSetting;
  /** Translate an answer that came out in the wrong language. */
  autoTranslate: boolean;
  /** Longest reply the model may write, in tokens. */
  maxTokens: number;
  /** Model context window, in tokens. Larger remembers more but needs more RAM. */
  contextTokens: number;
}

export const MAX_TOKEN_OPTIONS = [256, 512, 1024, 2048, 4096];
export const CONTEXT_OPTIONS = [2048, 4096, 8192];

export const DEFAULT_SETTINGS: Settings = {
  replyLanguage: 'auto',
  autoTranslate: true,
  maxTokens: 1024,
  contextTokens: 4096,
};

const KEY = 'hezam.settings.v1';

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

/** A reply can never use more than half the context, or there is no room left for the question. */
export function effectiveMaxTokens(s: Settings): number {
  return Math.min(s.maxTokens, Math.floor(s.contextTokens / 2));
}

/** Rough character budget for chat history: what is left of the context, at ~3 characters per token. */
export function historyCharBudget(s: Settings): number {
  return Math.max(1500, (s.contextTokens - effectiveMaxTokens(s) - 400) * 3);
}
