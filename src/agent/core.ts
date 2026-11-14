/**
 * The agent loop: the model picks one tool at a time, the app runs it and reports
 * the result, until the model gives a final answer. It uses a plain JSON protocol
 * instead of a provider's tool-calling API, so the same loop drives a remote API
 * and a small local model. No runtime imports, so it is unit-testable.
 */

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** Argument name -> short description. */
  args: Record<string, string>;
  /** Arguments that are whole numbers; all others are strings. */
  integerArgs?: string[];
}

export type ToolRunner = (args: Record<string, unknown>) => Promise<string>;

export interface Tool extends ToolSpec {
  run: ToolRunner;
}

export type AgentAction =
  | { kind: 'tool'; tool: string; args: Record<string, unknown>; thought?: string }
  | { kind: 'final'; text: string };

export interface AgentStep {
  tool: string;
  args: Record<string, unknown>;
  thought?: string;
  result: string;
  failed: boolean;
}

export function systemPrompt(tools: ToolSpec[]): string {
  const list = tools
    .map((t) => {
      const args = Object.entries(t.args)
        .map(([k, v]) => `"${k}": ${v}`)
        .join(', ');
      return `- ${t.name}: ${t.description} Args: {${args}}`;
    })
    .join('\n');
  return `You are Hezam.0's agent. You complete the user's task on their own phone by using tools, one at a time.

Tools:
${list}

Reply with exactly ONE JSON object and nothing else.
To use a tool: {"thought": "why, in a few words", "tool": "tool_name", "args": {...}}
When the task is done, or you cannot continue: {"final": "what you did or found, in the user's language"}

Rules:
- Use only the tools listed. Never invent a result: act, then read what came back.
- Before tapping or typing, call read_screen and use the element numbers from its latest result.
- Do only what the task asks. Never buy or pay for anything, send messages, make calls, or delete or overwrite files unless the task explicitly says so.
- If a tool fails twice, stop and explain in "final".`;
}

/** Finds the first complete top-level JSON object in a model reply. */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Reads the model's reply. Text with no usable JSON counts as a final answer. */
export function parseAction(reply: string): AgentAction {
  const cleaned = reply.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
  const json = firstJsonObject(cleaned);
  if (json) {
    try {
      const obj = JSON.parse(json) as Record<string, unknown>;
      if (typeof obj.tool === 'string' && obj.tool) {
        const args = obj.args && typeof obj.args === 'object' ? (obj.args as Record<string, unknown>) : {};
        return {
          kind: 'tool',
          tool: obj.tool,
          args,
          thought: typeof obj.thought === 'string' ? obj.thought : undefined,
        };
      }
      if (typeof obj.final === 'string') return { kind: 'final', text: obj.final };
    } catch {
      // fall through to plain text
    }
  }
  return { kind: 'final', text: cleaned };
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n…(cut, ${s.length - max} more characters)` : s);

export interface RunOptions {
  task: string;
  tools: Tool[];
  /** Sends the conversation to the model and returns its reply. `step` starts at 0. */
  llm: (messages: AgentMessage[], info: { step: number }) => Promise<string>;
  /**
   * The task is a command to act, so a reply with no tool call on the very first step is
   * the model talking instead of doing. It is asked again instead of being accepted.
   */
  mustActFirst?: boolean;
  onStep?: (step: AgentStep) => void;
  /** Returns true when the user pressed Stop. */
  cancelled?: () => boolean;
  maxSteps?: number;
  /** Longest tool result passed back to the model, in characters. */
  maxResultChars?: number;
  /** How many past tool exchanges to keep in the prompt (older ones are dropped). */
  keepExchanges?: number;
}

export interface RunResult {
  final: string;
  steps: number;
  stopped: 'done' | 'cancelled' | 'step-limit';
}

export async function runAgent(o: RunOptions): Promise<RunResult> {
  const maxSteps = o.maxSteps ?? 15;
  const maxResult = o.maxResultChars ?? 3000;
  const keep = o.keepExchanges ?? 6;
  const byName = new Map(o.tools.map((t) => [t.name, t]));
  const head: AgentMessage[] = [
    { role: 'system', content: systemPrompt(o.tools) },
    { role: 'user', content: `Task: ${o.task}` },
  ];
  const exchanges: AgentMessage[][] = [];

  for (let step = 0; step < maxSteps; step++) {
    if (o.cancelled?.()) return { final: 'Stopped.', steps: step, stopped: 'cancelled' };
    const prompt = [...head, ...exchanges.slice(-keep).flat()];
    let reply = await o.llm(prompt, { step });
    if (o.cancelled?.()) return { final: 'Stopped.', steps: step, stopped: 'cancelled' };

    let action = parseAction(reply);
    if (step === 0 && o.mustActFirst && action.kind === 'final') {
      // One firm retry: describing what it would do is not doing it.
      reply = await o.llm(
        [
          ...prompt,
          { role: 'assistant', content: reply },
          {
            role: 'user',
            content:
              'You answered with words but did nothing. Do the task now: reply with ONE JSON object that calls a tool, like {"tool": "...", "args": {...}}.',
          },
        ],
        { step },
      );
      if (o.cancelled?.()) return { final: 'Stopped.', steps: step, stopped: 'cancelled' };
      action = parseAction(reply);
    }
    if (action.kind === 'final') return { final: action.text, steps: step, stopped: 'done' };

    const tool = byName.get(action.tool);
    let result: string;
    let failed = false;
    if (!tool) {
      failed = true;
      result = `ERROR: there is no tool named "${action.tool}". Available: ${[...byName.keys()].join(', ')}.`;
    } else {
      try {
        result = await tool.run(action.args);
      } catch (e) {
        failed = true;
        result = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    o.onStep?.({ tool: action.tool, args: action.args, thought: action.thought, result, failed });
    exchanges.push([
      { role: 'assistant', content: JSON.stringify({ tool: action.tool, args: action.args }) },
      {
        role: 'user',
        content: `Result of ${action.tool}:\n${clip(result, maxResult)}\n\nReply with the next JSON object.`,
      },
    ]);
  }
  return {
    final: `Stopped after ${maxSteps} steps without finishing. Try a smaller task.`,
    steps: maxSteps,
    stopped: 'step-limit',
  };
}

/**
 * A JSON Schema for the model's reply. A local model run with this schema as its
 * output grammar cannot answer in prose: it must name a real tool with the right
 * arguments, or (when allowed) give a final answer.
 */
export function replySchema(tools: ToolSpec[], allowFinal: boolean): object {
  const calls = tools.map((t) => {
    const names = Object.keys(t.args);
    const properties: Record<string, object> = {};
    for (const name of names) {
      properties[name] = { type: t.integerArgs?.includes(name) ? 'integer' : 'string' };
    }
    return {
      type: 'object',
      properties: {
        tool: { const: t.name },
        args: { type: 'object', properties, required: names, additionalProperties: false },
      },
      required: ['tool', 'args'],
      additionalProperties: false,
    };
  });
  const final = {
    type: 'object',
    properties: { final: { type: 'string' } },
    required: ['final'],
    additionalProperties: false,
  };
  return { anyOf: allowFinal ? [...calls, final] : calls };
}
