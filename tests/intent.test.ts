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
  'i-search ang bug sa code ko',
  'Sumulat ka ng kanta tungkol sa pag-ibig',
];
for (const text of notActions) {
  test(`not an action: "${text}"`, () => assert.equal(isAction(text), false));
}

// ---- typing, tapping, playing, and multi-step plans ----
const { planCommand, splitClauses } = await import('../src/agent/intent.ts');

const more: [string, string, Record<string, unknown>][] = [
  ['i-type ang hello world', 'type_here', { text: 'hello world' }],
  ['type "adobo recipe" sa search bar', 'search_here', { query: 'adobo recipe' }],
  ['pindutin ang Play', 'tap_text', { text: 'Play' }],
  ['i-tap ang Login button', 'tap_text', { text: 'Login' }],
  ['click Subscribe', 'tap_text', { text: 'Subscribe' }],
  ['mag-play ng Buwan ni juan karlos', 'play_media', { query: 'Buwan ni juan karlos', app: '' }],
  ['play lofi beats on youtube', 'play_media', { query: 'lofi beats', app: 'youtube' }],
  ['patugtugin ang OPM sa Spotify', 'play_media', { query: 'OPM', app: 'Spotify' }],
  ['play Guns and Roses', 'play_media', { query: 'Guns and Roses', app: '' }],
  ['i-search ang pinakamalapit na ospital', 'open_link', { url: 'https://www.google.com/search?q=pinakamalapit%20na%20ospital' }],
  ['press enter', 'press_enter', {}],
  ['bumalik', 'press_button', { button: 'back' }],
];
for (const [text, tool, args] of more) {
  test(`direct: "${text}" -> ${tool}`, () => {
    assert.deepEqual(directCommand(text), { tool, args });
  });
}

test('splits only where a command follows the connector', () => {
  assert.deepEqual(splitClauses('buksan ang Chrome at i-search ang weather'), ['buksan ang Chrome', 'i-search ang weather']);
  assert.deepEqual(splitClauses('play Guns and Roses'), ['play Guns and Roses']);
  assert.deepEqual(splitClauses('open YouTube, search cats, tapos pindutin ang Play'), [
    'open YouTube',
    'search cats',
    'pindutin ang Play',
  ]);
});

test('plans a search inside the app that was just opened', () => {
  assert.deepEqual(planCommand('buksan ang Chrome at i-search ang weather today'), [
    { tool: 'open_app', args: { name: 'Chrome' } },
    { tool: 'search_here', args: { query: 'weather today' } },
  ]);
});

test('plans a search inside a named app', () => {
  assert.deepEqual(planCommand('hanapin ang sapatos sa Shopee'), [
    { tool: 'open_app', args: { name: 'Shopee' } },
    { tool: 'search_here', args: { query: 'sapatos' } },
  ]);
});

test('plans a three-step command', () => {
  assert.deepEqual(planCommand('open Facebook, i-search ang Jollibee tapos i-tap ang Follow'), [
    { tool: 'open_app', args: { name: 'Facebook' } },
    { tool: 'search_here', args: { query: 'Jollibee' } },
    { tool: 'tap_text', args: { text: 'Follow' } },
  ]);
});

test('google and youtube searches stay one step', () => {
  assert.equal(planCommand('i-search ang adobo recipe sa google')?.length, 1);
  assert.equal(planCommand('search cute cats on youtube')?.[0].tool, 'open_link');
});

test('a part that is not understood hands the whole task to the model', () => {
  assert.equal(planCommand('buksan ang Chrome at sabihin mo kung ano ang nakita mo'), null);
});
