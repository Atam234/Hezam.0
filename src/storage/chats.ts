import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SpecialistId } from '../router/router';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** User messages: the English version given to the model when the translator bridge is on. */
  modelText?: string;
  /** Assistant messages: who answered and why. */
  specialist?: SpecialistId;
  modelId?: string;
  matched?: string[];
  fallback?: boolean;
  manual?: boolean;
  tokensPerSecond?: number;
  /** Set when the answer went through the translator. */
  translatedTo?: 'tl' | 'en';
  translatorId?: string;
  /** The untranslated answer, kept so the user can compare. */
  original?: string;
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}

const KEY = 'hezam.conversations.v1';
const MAX_CONVERSATIONS = 50;

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}

export async function saveConversations(list: Conversation[]): Promise<void> {
  const trimmed = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
  await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
}

export function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 42 ? `${oneLine.slice(0, 42)}…` : oneLine || 'New chat';
}
