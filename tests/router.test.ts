import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classify, pickModel, type SpecialistId } from '../src/router/router.ts';

const cases: [string, SpecialistId][] = [
  ['Gumawa ka ng Python script na magbabasa ng CSV file', 'code'],
  ['Bakit may error: TypeError: undefined is not a function', 'code'],
  ['```js\nconst a = 1\n```\nano mali dito?', 'code'],
  ['How do I center a div in CSS?', 'code'],
  ['Sumulat ka ng function sa JavaScript na nagso-sort ng array', 'code'],
  ['Isulat mo ako ng liham para sa aking guro', 'writing'],
  ['Write a cover letter for a marketing job', 'writing'],
  ['Gawan mo ako ng tula tungkol sa ulan', 'writing'],
  ['I-translate mo ito sa English: Magandang umaga po', 'writing'],
  ['Ibuod mo ang talata na ito', 'writing'],
  ['Mag-brainstorm tayo ng mga ideya para sa negosyo', 'creative'],
  ['Bigyan mo ako ng concept para sa logo ng coffee shop', 'creative'],
  ['Give me art ideas for a cyberpunk poster', 'creative'],
  ['Ano magandang pangalan para sa aking banda?', 'creative'],
  ['Solve 24 * 17 + 3', 'reasoning'],
  ['Magkano ang 15 porsyento ng 2500?', 'reasoning'],
  ['Explain step by step the probability of rolling two sixes', 'reasoning'],
  ['Kumusta ka?', 'general'],
  ['What is the capital of Japan?', 'general'],
  ['Sino si Jose Rizal?', 'general'],
];

for (const [text, expected] of cases) {
  test(`routes "${text.slice(0, 40).replace(/\n/g, ' ')}" -> ${expected}`, () => {
    assert.equal(classify(text).specialist, expected);
  });
}

test('short follow-up stays with the previous specialist', () => {
  const d = classify('ayusin mo pa', 'code');
  assert.equal(d.specialist, 'code');
  assert.equal(d.sticky, true);
});

test('a short fresh question does not stick', () => {
  assert.equal(classify('What is the capital of Japan?', 'code').specialist, 'general');
  assert.equal(classify('Sino si Jose Rizal?', 'writing').specialist, 'general');
  assert.equal(classify('bakit ganyan?', 'code').specialist, 'code');
});

test('a clear new topic overrides the previous specialist', () => {
  assert.equal(classify('Gawan mo ako ng tula', 'code').specialist, 'writing');
});

test('long unrelated message does not stick', () => {
  const text =
    'Ano ang pinakamalaking isla sa Pilipinas at gaano karami ang mga taong nakatira doon sa kasalukuyan ngayon?';
  assert.equal(classify(text, 'code').specialist, 'general');
});

const catalog = [
  { id: 'gen', roles: ['general', 'writing'] as SpecialistId[] },
  { id: 'coder', roles: ['code'] as SpecialistId[] },
  { id: 'writer', roles: ['writing', 'general'] as SpecialistId[] },
];

test('pickModel prefers the dedicated specialist', () => {
  const pick = pickModel('code', catalog, new Set(['gen', 'coder']));
  assert.deepEqual([pick?.model.id, pick?.fallback], ['coder', false]);
});

test('pickModel falls back to a general model when the specialist is missing', () => {
  const pick = pickModel('code', catalog, new Set(['gen', 'writer']));
  assert.deepEqual([pick?.model.id, pick?.fallback], ['gen', true]);
});

test('pickModel prefers a secondary role over a plain general model', () => {
  const pick = pickModel('writing', catalog, new Set(['gen', 'coder']));
  assert.deepEqual([pick?.model.id, pick?.fallback], ['gen', true]);
});

test('pickModel uses whatever is installed as a last resort', () => {
  const pick = pickModel('writing', catalog, new Set(['coder']));
  assert.deepEqual([pick?.model.id, pick?.fallback], ['coder', true]);
});

test('pickModel returns null when nothing is installed', () => {
  assert.equal(pickModel('general', catalog, new Set()), null);
});
