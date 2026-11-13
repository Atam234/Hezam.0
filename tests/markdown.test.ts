import assert from 'node:assert/strict';
import { test } from 'node:test';

import { translateMarkdown } from '../src/translate/markdown.ts';

const upper = async (s: string) => s.toUpperCase();

test('translates prose and keeps code blocks untouched', async () => {
  const src = 'Here is the code:\n\n```python\nprint("hello world")\n```\n\nIt prints a greeting.';
  assert.equal(
    await translateMarkdown(src, upper),
    'HERE IS THE CODE:\n\n```python\nprint("hello world")\n```\n\nIT PRINTS A GREETING.',
  );
});

test('keeps list, heading and quote markers', async () => {
  const src = '## Steps\n- open the file\n  2. save it\n> note this';
  assert.equal(await translateMarkdown(src, upper), '## STEPS\n- OPEN THE FILE\n  2. SAVE IT\n> NOTE THIS');
});

test('keeps inline code exactly', async () => {
  assert.equal(
    await translateMarkdown('Use `print()` to show the output.', upper),
    'USE `print()` TO SHOW THE OUTPUT.',
  );
});

test('an unclosed code fence (cut-off answer) stays code', async () => {
  assert.equal(await translateMarkdown('Code:\n```js\nlet a = 1', upper), 'CODE:\n```js\nlet a = 1');
});

test('lines without words are not sent to the translator', async () => {
  let calls = 0;
  const counting = async (s: string) => (calls++, s);
  await translateMarkdown('1 + 1 = 2\n\n---\n', counting);
  assert.equal(calls, 0);
});

test('repairs emphasis markers padded by the translator', async () => {
  const padded = async (s: string) => s.replace('**Note**', '** Tandaan **');
  assert.equal(await translateMarkdown('**Note** read this', padded), '**Tandaan** read this');
});
