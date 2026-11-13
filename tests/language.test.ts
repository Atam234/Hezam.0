import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  detectLanguage,
  needsTranslation,
  requestedLanguage,
  targetLanguage,
  type Detected,
} from '../src/router/language.ts';

const cases: [string, Detected][] = [
  ['Kumusta ka?', 'tl'],
  ['Paano mag-install ng Python sa Windows?', 'tl'],
  ['Gawan mo ako ng tula tungkol sa ulan', 'tl'],
  ['Ano ang capital ng Japan?', 'tl'],
  ['Pwede mo ba i-explain yung code na ito?', 'tl'],
  ['Bakit hindi gumagana ang function ko?', 'tl'],
  ['Salamat po', 'tl'],
  ['Magkano ang 15 porsyento ng 2500?', 'tl'],
  ['What is the capital of Japan?', 'en'],
  ['Write a Python script that renames many files', 'en'],
  ['Can you help me fix this bug in my code?', 'en'],
  ['How do I center a div in CSS?', 'en'],
  ['Explain step by step the probability of rolling two sixes', 'en'],
  ['ok', 'unknown'],
  ['```js\nconst a = 1\n```', 'unknown'],
  ['12345', 'unknown'],
];

for (const [text, expected] of cases) {
  test(`detects "${text.slice(0, 40).replace(/\n/g, ' ')}" -> ${expected}`, () => {
    assert.equal(detectLanguage(text), expected);
  });
}

test('explicit output language wins over the message language', () => {
  assert.equal(requestedLanguage('I-translate mo ito sa English: Magandang umaga po'), 'en');
  assert.equal(targetLanguage('I-translate mo ito sa English: Magandang umaga po', 'auto'), 'en');
  assert.equal(targetLanguage('Explain recursion in Tagalog', 'auto'), 'tl');
  assert.equal(targetLanguage('Explain recursion in Tagalog', 'en'), 'tl');
});

test('auto follows the user, forced settings override', () => {
  assert.equal(targetLanguage('Ano ang recursion?', 'auto'), 'tl');
  assert.equal(targetLanguage('What is recursion?', 'auto'), 'en');
  assert.equal(targetLanguage('What is recursion?', 'tl'), 'tl');
  assert.equal(targetLanguage('Ano ang recursion?', 'en'), 'en');
});

test('unclear messages keep the language of the chat', () => {
  assert.equal(targetLanguage('ok', 'auto', 'tl'), 'tl');
  assert.equal(targetLanguage('ok', 'auto'), 'en');
});

test('an English answer to a Tagalog chat needs translation', () => {
  const english =
    'Recursion is when a function calls itself. It is used to solve problems that can be broken into smaller parts.';
  assert.equal(needsTranslation(english, 'tl'), true);
  assert.equal(needsTranslation(english, 'en'), false);
});

test('a Tagalog answer with code does not need translation', () => {
  const tagalog =
    'Ang recursion ay kapag ang isang function ay tumatawag sa sarili niya. Narito ang halimbawa:\n```python\ndef f(n):\n    return 1 if n == 0 else n * f(n - 1)\n```';
  assert.equal(needsTranslation(tagalog, 'tl'), false);
  assert.equal(needsTranslation(tagalog, 'en'), true);
});

test('code-only answers are left alone', () => {
  assert.equal(needsTranslation('```js\nconsole.log("the answer is here for you")\n```', 'tl'), false);
});
