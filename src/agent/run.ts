/**
 * Runs one task for the user, from either the chat or the Agent screen:
 * a simple command is executed directly, anything else goes through the agent loop
 * with the configured brain (AI API or local model).
 */
import { detectLanguage } from '../router/language';
import * as google from '../translate/google';
import type { AgentConfig } from './config';
import { replySchema, runAgent, type AgentStep, type Tool } from './core';
import * as files from './files';
import { planCommand } from './intent';
import { callApi, callLocal } from './llm';
import { buildTools, phoneControlEnabled } from './tools';

export interface TaskOptions {
  task: string;
  config: AgentConfig;
  apiKey: string;
  /** Loads a local model and resolves with its name. */
  prepareLocal: () => Promise<string>;
  onStep?: (step: AgentStep) => void;
  onStatus?: (status: string) => void;
  cancelled?: () => boolean;
  /** The task is a command, so the model must act rather than only reply. */
  mustAct?: boolean;
}

export interface TaskResult {
  final: string;
  steps: AgentStep[];
  /** Which brain did the work; 'direct' means no model was needed. */
  brain: 'direct' | 'api' | 'local';
  /** True when the task ended because something the agent needs is switched off. */
  needsSetup?: boolean;
}

/** Thrown when the agent has nothing it is allowed to use yet. */
export class SetupNeeded extends Error {}

const SETUP_HINT = 'Open Agent (the button above the message box) to share a folder or turn on phone control.';

async function availableTools(config: AgentConfig): Promise<Tool[]> {
  return buildTools({
    files: (await files.grantedFolder().catch(() => null)) !== null,
    fileChanges: config.allowFileChanges,
    phoneControl: await phoneControlEnabled(),
  });
}

function firstLine(result: string): string {
  return result.split('\nScreen now:')[0].trim();
}

export async function runTask(o: TaskOptions): Promise<TaskResult> {
  const steps: AgentStep[] = [];
  const record = (step: AgentStep) => {
    steps.push(step);
    o.onStep?.(step);
  };
  const tools = await availableTools(o.config);

  // 1. Commands the app understands outright ("open Chrome and search weather", "play Buwan")
  //    are run step by step with no model involved, so they cannot be talked around.
  const plan = planCommand(o.task);
  if (plan) {
    o.onStatus?.('Working…');
    let last = '';
    for (const [index, step] of plan.entries()) {
      if (o.cancelled?.()) return { final: 'Stopped.', steps, brain: 'direct' };
      const tool = tools.find((t) => t.name === step.tool);
      if (!tool) {
        const what = /file/.test(step.tool) ? 'No folder is shared with the agent yet.' : 'Phone control is off.';
        const done = index > 0 ? `Did ${index} of ${plan.length} steps. ` : '';
        return { final: `${done}${what} ${SETUP_HINT}`, steps, brain: 'direct', needsSetup: true };
      }
      try {
        last = await tool.run(step.args);
        record({ tool: step.tool, args: step.args, result: last, failed: false });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        record({ tool: step.tool, args: step.args, result: `ERROR: ${message}`, failed: true });
        return { final: message, steps, brain: 'direct', needsSetup: /is off|No folder/i.test(message) };
      }
      // Give the screen time to settle before the next step acts on it.
      if (index < plan.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    const lastTool = plan[plan.length - 1].tool;
    const informative = ['list_files', 'read_file', 'list_apps', 'read_screen'].includes(lastTool);
    return { final: informative ? last : firstLine(last), steps, brain: 'direct' };
  }

  if (tools.length === 0) throw new SetupNeeded(`The agent has no access yet. ${SETUP_HINT}`);

  // 2. Everything else: the agent loop.
  const local = o.config.brain === 'local' || !o.apiKey.trim();
  let task = o.task;
  let translateBack = false;
  if (local) {
    o.onStatus?.('Loading the local model…');
    const name = await o.prepareLocal();
    o.onStatus?.(`Working with ${name}…`);
    // Small models follow English instructions far better than Tagalog ones.
    if (google.available && detectLanguage(task) === 'tl' && (await google.packState()) === 'ready') {
      task = await google.translate(task, 'tl', 'en').catch(() => task);
      translateBack = task !== o.task;
    }
  } else {
    o.onStatus?.(`Working with ${o.config.model}…`);
  }

  const result = await runAgent({
    task,
    tools,
    llm: local
      ? (messages, { step }) => callLocal(messages, replySchema(tools, !(o.mustAct && step === 0)))
      : (messages) => callApi(o.config, o.apiKey.trim(), messages),
    mustActFirst: o.mustAct,
    onStep: record,
    cancelled: o.cancelled,
    // A small local model has a short context: keep its prompt tight.
    maxSteps: local ? 8 : 15,
    maxResultChars: local ? 1500 : 3000,
    keepExchanges: local ? 2 : 6,
  });

  let final = result.final;
  if (translateBack && final) final = await google.translate(final, 'en', 'tl').catch(() => final);
  return { final, steps, brain: local ? 'local' : 'api' };
}
