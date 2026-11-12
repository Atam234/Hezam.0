import type { RoutableModel, SpecialistId } from '../router/router';

export interface Specialist {
  id: SpecialistId;
  name: string;
  /** Short label used in chips and badges. */
  short: string;
  glyph: string;
  color: string;
  description: string;
  systemPrompt: string;
  temperature: number;
}

const LANGUAGE_RULE =
  'Always reply in the same language the user writes in (Tagalog, English, or Taglish). Use Markdown when it helps.';

export const SPECIALISTS: Record<SpecialistId, Specialist> = {
  general: {
    id: 'general',
    name: 'General Assistant',
    short: 'Chat',
    glyph: '◎',
    color: '#9CA3AF',
    description: 'Everyday questions and conversation',
    systemPrompt: `You are Hezam.0, a helpful, friendly AI assistant that runs fully on the user's phone. Give clear, accurate, concise answers. ${LANGUAGE_RULE}`,
    temperature: 0.7,
  },
  code: {
    id: 'code',
    name: 'Coding Expert',
    short: 'Code',
    glyph: '⌨',
    color: '#34D399',
    description: 'Programming, debugging, and code explanations',
    systemPrompt: `You are Hezam.0's coding specialist, an expert software engineer. Write correct, complete, runnable code in fenced code blocks with the language tag. Explain briefly what the code does and point out bugs or edge cases. ${LANGUAGE_RULE}`,
    temperature: 0.2,
  },
  writing: {
    id: 'writing',
    name: 'Writer',
    short: 'Write',
    glyph: '✎',
    color: '#60A5FA',
    description: 'Essays, letters, poems, stories, translation, and summaries',
    systemPrompt: `You are Hezam.0's writing specialist, a skilled writer and editor. Produce polished, well-structured text that matches the requested tone, length, and audience. When editing, keep the author's meaning. ${LANGUAGE_RULE}`,
    temperature: 0.8,
  },
  creative: {
    id: 'creative',
    name: 'Art & Ideas',
    short: 'Ideas',
    glyph: '✦',
    color: '#F472B6',
    description: 'Art concepts, brainstorming, and fresh ideas',
    systemPrompt: `You are Hezam.0's creative specialist: an art director and brainstorming partner. Offer several distinct, original ideas, not just one. For art requests, describe concept, composition, style, colors, and mood, and give a ready-to-use image prompt when useful. ${LANGUAGE_RULE}`,
    temperature: 0.95,
  },
  reasoning: {
    id: 'reasoning',
    name: 'Reasoning & Math',
    short: 'Reason',
    glyph: '∑',
    color: '#FBBF24',
    description: 'Math, logic, and in-depth analysis',
    systemPrompt: `You are Hezam.0's reasoning specialist. Work through problems carefully step by step, check the arithmetic, and finish with a clearly marked final answer. ${LANGUAGE_RULE}`,
    temperature: 0.4,
  },
};

export const SPECIALIST_ORDER: SpecialistId[] = ['general', 'code', 'writing', 'creative', 'reasoning'];

export interface ModelInfo extends RoutableModel {
  name: string;
  author: string;
  /** Hugging Face repo that hosts the GGUF file. */
  repo: string;
  file: string;
  sizeBytes: number;
  license: string;
  /** Rough RAM a phone should have to run it comfortably. */
  minRamGb: number;
  note: string;
}

/**
 * Open-weight GGUF models from Hugging Face, all Q4_K_M quantized so they fit on a phone.
 * `roles[0]` is the model's specialty; later entries are roles it can cover as a fallback.
 */
export const MODELS: ModelInfo[] = [
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen2.5 1.5B Instruct',
    author: 'Alibaba Qwen',
    repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sizeBytes: 1117320736,
    license: 'Apache-2.0',
    minRamGb: 4,
    roles: ['general', 'writing', 'reasoning', 'creative', 'code'],
    note: 'Multilingual all-rounder. A good first download.',
  },
  {
    id: 'qwen2.5-coder-1.5b',
    name: 'Qwen2.5-Coder 1.5B',
    author: 'Alibaba Qwen',
    repo: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF',
    file: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    sizeBytes: 1117320768,
    license: 'Apache-2.0',
    minRamGb: 4,
    roles: ['code', 'reasoning'],
    note: 'Trained for code generation and debugging.',
  },
  {
    id: 'gemma-2-2b',
    name: 'Gemma 2 2B',
    author: 'Google',
    repo: 'bartowski/gemma-2-2b-it-GGUF',
    file: 'gemma-2-2b-it-Q4_K_M.gguf',
    sizeBytes: 1708582752,
    license: 'Gemma Terms of Use',
    minRamGb: 6,
    roles: ['writing', 'general', 'creative'],
    note: 'Clean, natural writing.',
  },
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B',
    author: 'Meta',
    repo: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeBytes: 2019377696,
    license: 'Llama 3.2 Community License',
    minRamGb: 6,
    roles: ['creative', 'writing', 'general'],
    note: 'Imaginative, for ideas and art concepts.',
  },
  {
    id: 'deepseek-r1-1.5b',
    name: 'DeepSeek-R1 Distill 1.5B',
    author: 'DeepSeek',
    repo: 'bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF',
    file: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
    sizeBytes: 1117320800,
    license: 'MIT',
    minRamGb: 4,
    roles: ['reasoning'],
    note: 'Thinks through the problem before answering.',
  },
  {
    id: 'smollm2-360m',
    name: 'SmolLM2 360M',
    author: 'Hugging Face',
    repo: 'bartowski/SmolLM2-360M-Instruct-GGUF',
    file: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
    sizeBytes: 270590880,
    license: 'Apache-2.0',
    minRamGb: 2,
    roles: ['general'],
    note: 'Tiny and fast. Mostly English; for older phones.',
  },
];

export const modelUrl = (m: ModelInfo) =>
  `https://huggingface.co/${m.repo}/resolve/main/${m.file}?download=true`;

export const getModel = (id: string) => MODELS.find((m) => m.id === id);

export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}
