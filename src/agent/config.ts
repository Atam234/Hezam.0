import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type AgentBrain = 'api' | 'local';

export interface AgentConfig {
  brain: AgentBrain;
  /** OpenAI-compatible endpoint, without the trailing /chat/completions. */
  baseUrl: string;
  model: string;
  /** Let the agent create and overwrite files in the shared folder. */
  allowFileChanges: boolean;
}

export interface Preset {
  name: string;
  baseUrl: string;
  model: string;
}

/** All of these speak the OpenAI-style /chat/completions format. */
export const PRESETS: Preset[] = [
  { name: 'Claude', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
];

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  brain: 'api',
  baseUrl: PRESETS[0].baseUrl,
  model: PRESETS[0].model,
  allowFileChanges: false,
};

const KEY = 'hezam.agent.config.v1';
const SECRET = 'hezam.agent.apiKey';

export async function loadAgentConfig(): Promise<AgentConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_AGENT_CONFIG, ...(JSON.parse(raw) as Partial<AgentConfig>) } : DEFAULT_AGENT_CONFIG;
  } catch {
    return DEFAULT_AGENT_CONFIG;
  }
}

export async function saveAgentConfig(config: AgentConfig): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(config));
}

// The API key is kept in the device keystore, not in plain app storage.
let memoryKey = '';

export async function loadApiKey(): Promise<string> {
  if (Platform.OS === 'web') return memoryKey;
  return (await SecureStore.getItemAsync(SECRET).catch(() => null)) ?? '';
}

export async function saveApiKey(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    memoryKey = key;
    return;
  }
  if (key) await SecureStore.setItemAsync(SECRET, key);
  else await SecureStore.deleteItemAsync(SECRET);
}
