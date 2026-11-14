import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAction, runAgent, type AgentStep, type Tool } from '../src/agent/core.ts';

test('parses a tool call', () => {
  assert.deepEqual(parseAction('{"thought":"look","tool":"list_files","args":{"path":""}}'), {
    kind: 'tool',
    tool: 'list_files',
    args: { path: '' },
    thought: 'look',
  });
});

test('parses JSON wrapped in prose, code fences and thinking', () => {
  const reply = '<think>hmm {not json</think>Sure:\n```json\n{"tool":"tap","args":{"index":3}}\n```';
  assert.deepEqual(parseAction(reply), { kind: 'tool', tool: 'tap', args: { index: 3 }, thought: undefined });
});

test('braces inside strings do not confuse the parser', () => {
  const a = parseAction('{"tool":"write_file","args":{"path":"a.json","content":"{\\"x\\": \\"}\\"}"}}');
  assert.equal(a.kind, 'tool');
  assert.equal(a.kind === 'tool' && a.args.content, '{"x": "}"}');
});

test('parses a final answer, and treats plain text as final', () => {
  assert.deepEqual(parseAction('{"final":"Tapos na."}'), { kind: 'final', text: 'Tapos na.' });
  assert.deepEqual(parseAction('I am done.'), { kind: 'final', text: 'I am done.' });
});

const echo: Tool = {
  name: 'echo',
  description: 'Echo.',
  args: { text: 'string' },
  run: async (a) => `echo:${String(a.text)}`,
};
const boom: Tool = { name: 'boom', description: 'Fails.', args: {}, run: async () => { throw new Error('nope'); } };

function scripted(replies: string[]) {
  let i = 0;
  const seen: number[] = [];
  return {
    seen,
    llm: async (messages: { content: string }[]) => {
      seen.push(messages.length);
      return replies[Math.min(i++, replies.length - 1)];
    },
  };
}

test('runs tools then returns the final answer', async () => {
  const s = scripted(['{"tool":"echo","args":{"text":"hi"}}', '{"final":"done"}']);
  const steps: AgentStep[] = [];
  const r = await runAgent({ task: 't', tools: [echo], llm: s.llm, onStep: (x) => steps.push(x) });
  assert.deepEqual(r, { final: 'done', steps: 1, stopped: 'done' });
  assert.equal(steps[0].result, 'echo:hi');
  assert.deepEqual(s.seen, [2, 4]); // second call sees the tool exchange
});

test('tool errors and unknown tools are reported back, not thrown', async () => {
  const s = scripted(['{"tool":"boom","args":{}}', '{"tool":"missing","args":{}}', '{"final":"gave up"}']);
  const steps: AgentStep[] = [];
  const r = await runAgent({ task: 't', tools: [boom], llm: s.llm, onStep: (x) => steps.push(x) });
  assert.equal(r.final, 'gave up');
  assert.deepEqual(steps.map((x) => x.failed), [true, true]);
  assert.match(steps[0].result, /ERROR: nope/);
  assert.match(steps[1].result, /no tool named "missing"/);
});

test('stops at the step limit', async () => {
  const s = scripted(['{"tool":"echo","args":{"text":"x"}}']);
  const r = await runAgent({ task: 't', tools: [echo], llm: s.llm, maxSteps: 3 });
  assert.equal(r.stopped, 'step-limit');
  assert.equal(r.steps, 3);
});

test('stops when cancelled', async () => {
  let n = 0;
  const s = scripted(['{"tool":"echo","args":{"text":"x"}}']);
  const r = await runAgent({ task: 't', tools: [echo], llm: s.llm, cancelled: () => ++n > 2 });
  assert.equal(r.stopped, 'cancelled');
});

test('old exchanges are dropped from the prompt', async () => {
  const s = scripted(['{"tool":"echo","args":{"text":"x"}}']);
  await runAgent({ task: 't', tools: [echo], llm: s.llm, maxSteps: 5, keepExchanges: 2 });
  assert.deepEqual(s.seen, [2, 4, 6, 6, 6]);
});

test('a talk-only first reply is retried when the task is a command', async () => {
  const s = scripted(['Sure, I will open Chrome for you!', '{"tool":"echo","args":{"text":"go"}}', '{"final":"ok"}']);
  const steps: AgentStep[] = [];
  const r = await runAgent({ task: 't', tools: [echo], llm: s.llm, mustActFirst: true, onStep: (x) => steps.push(x) });
  assert.equal(steps.length, 1);
  assert.equal(r.final, 'ok');
});

test('reply schema lists each tool with typed arguments', async () => {
  const { replySchema } = await import('../src/agent/core.ts');
  const tap = { name: 'tap', description: '', args: { index: 'n' }, integerArgs: ['index'] };
  const schema = replySchema([echo, tap], false) as { anyOf: any[] };
  assert.equal(schema.anyOf.length, 2);
  assert.deepEqual(schema.anyOf[1].properties.tool, { const: 'tap' });
  assert.deepEqual(schema.anyOf[1].properties.args.properties, { index: { type: 'integer' } });
  assert.equal((replySchema([echo], true) as { anyOf: any[] }).anyOf.length, 2);
});
