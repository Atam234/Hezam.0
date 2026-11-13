import assert from 'node:assert/strict';
import { test } from 'node:test';

import { completeSentences, speakable } from '../src/voice/speech.ts';

test('speakable drops code and Markdown symbols', () => {
  const md = '## Sagot\n\n**Tokyo** ang kabisera. Gamitin ang `print()`:\n\n```py\nprint(1)\n```\n- una\n- pangalawa';
  assert.equal(speakable(md), 'Sagot\nTokyo ang kabisera. Gamitin ang print():\nuna\npangalawa');
});

test('completeSentences returns only finished sentences', () => {
  const a = completeSentences('Hello there. How are', 0);
  assert.deepEqual(a, { sentences: 'Hello there.', nextLength: 12 });
  const b = completeSentences('Hello there. How are you? Fine', a.nextLength);
  assert.equal(b.sentences, 'How are you?');
  assert.equal('Hello there. How are you? Fine'.slice(b.nextLength), ' Fine');
});

test('completeSentences waits when nothing is finished', () => {
  assert.deepEqual(completeSentences('Still writing', 0), { sentences: '', nextLength: 0 });
});

test('a decimal number does not end a sentence', () => {
  assert.equal(completeSentences('Pi is 3.14 roughly', 0).sentences, '');
});
