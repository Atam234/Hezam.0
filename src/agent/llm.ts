import * as engine from '../engine/engine';
import type { AgentMessage } from './core';
import type { AgentConfig } from './config';

/** Calls an OpenAI-compatible chat completions endpoint with the user's own API key. */
export async function callApi(config: AgentConfig, apiKey: string, messages: AgentMessage[]): Promise<string> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: config.model, messages, temperature: 0.2, max_tokens: 800 }),
    });
  } catch {
    throw new Error('Could not reach the API. Check your internet connection and the API address.');
  }
  const body = await response.text();
  if (!response.ok) {
    let detail = body.slice(0, 200);
    try {
      const parsed = JSON.parse(body);
      detail = parsed?.error?.message ?? parsed?.message ?? detail;
    } catch {
      // not JSON; keep the raw text
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`The API rejected the key (${response.status}). ${detail}`);
    }
    throw new Error(`API error ${response.status}: ${detail}`);
  }
  const content = JSON.parse(body)?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('The API returned no text.');
  return content;
}

/**
 * Runs the agent step on the model already loaded in the local engine.
 * `schema` becomes the output grammar, so the reply is always a valid tool call or final answer.
 */
export async function callLocal(messages: AgentMessage[], schema: object): Promise<string> {
  const result = await engine.generate(messages, { temperature: 0.2, maxTokens: 400, jsonSchema: schema }, () => {});
  return result.text;
}
