import assert from 'node:assert/strict';
import { test } from 'node:test';

import { directCommand, isAction } from '../src/agent/intent.ts';

const direct: [string, string, Record<string, unknown>][] = [
  ['Buksan ang Chrome', 'open_app', { name: 'Chrome' }],
  ['buksan mo yung YouTube app', 'open_app', { name: 'YouTube' }],
  ['Pakibuksan ang camera po', 'open_app', { name: 'camera' }],
  ['open Play Store', 'open_app', { name: 'Play Store' }],
  ['Can you open Gmail please', 'open_app', { name: 'Gmail' }],
  ['i-open ang Settings', 'open_app', { name: 'Settings' }],
  ['go home', 'press_button', { button: 'home' }],
  ['bumalik', 'press_button', { button: 'back' }],
  ['mag-scroll pababa', 'scroll', { direction: 'down' }],
  ['scroll up', 'scroll', { direction: 'up' }],
  ['basahin mo ang screen', 'read_screen', {}],
  ['ilista ang mga files ko', 'list_files', { path: '' }],
  ['list my files', 'list_files', { path: '' }],
  ['basahin ang notes.txt', 'read_file', { path: 'notes.txt' }],
  ['ipakita ang mga apps ko', 'list_apps', {}],
  ['search cute cats on youtube', 'open_link', { url: 'https://www.youtube.com/results?search_query=cute%20cats' }],
  ['i-search ang adobo recipe sa google', 'open_link', { url: 'https://www.google.com/search?q=adobo%20recipe' }],
];
for (const [text, tool, args] of direct) {
  test(`direct: "${text}" -> ${tool}`, () => {
    assert.deepEqual(directCommand(text), { tool, args });
  });
}

test('multi-step commands are not treated as one direct step', () => {
  assert.equal(directCommand('buksan ang Chrome at i-search ang weather'), null);
  assert.equal(isAction('buksan ang Chrome at i-search ang weather'), true);
});

const actions = [
  'i-tap ang Login button sa screen',
  'i-type ang hello sa search box ng Chrome',
  'gumawa ng file na listahan.txt sa folder ko',
  'burahin ang file na old.txt',
  'i-send ang "kumusta" kay Ana sa Messenger app',
  'turn on wifi in settings',
];
for (const text of actions) {
  test(`action: "${text}"`, () => assert.equal(isAction(text), true));
}

const notActions = [
  'Ano ang capital ng Japan?',
  'Kumusta ka?',
  'Gawan mo ako ng tula tungkol sa ulan',
  'Write a Python script that opens a file',
  'Paano mag-open ng file sa Python?',
  'What is the best camera phone?',
  'Explain how wifi works',
  'Magkano ang 15 porsyento ng 2500?',
  'Isulat mo ako ng liham para sa guro ko',
];
for (const text of notActions) {
  test(`not an action: "${text}"`, () => assert.equal(isAction(text), false));
}
