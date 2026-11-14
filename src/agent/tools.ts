import { Alert, Platform } from 'react-native';

import { HezamPhone } from '../../modules/hezam-translate';
import type { Tool } from './core';
import * as files from './files';

/** False where the native phone module is not built (iOS, web). */
export const phoneSupported = HezamPhone !== null;

export async function phoneControlEnabled(): Promise<boolean> {
  return HezamPhone ? HezamPhone.isControlEnabled().catch(() => false) : false;
}

export async function openAccessibilitySettings(): Promise<void> {
  await HezamPhone?.openAccessibilitySettings();
}

/** Asks the user to approve a risky action. Resolves false if they decline. */
function confirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Allow', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

const str = (v: unknown, name: string): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  throw new Error(`"${name}" is required.`);
};
const int = (v: unknown, name: string): number => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  if (!Number.isInteger(n)) throw new Error(`"${name}" must be a whole number.`);
  return n;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Phone = NonNullable<typeof HezamPhone>;

/** Types a query into the open app's search box and submits it, opening the box first if needed. */
async function searchHere(phone: Phone, query: string): Promise<string> {
  let outcome = await phone.typeAuto(query, true);
  if (outcome === 'no-input') {
    // No text box yet: most apps show one after tapping their search icon.
    if (!(await phone.tapSearch())) throw new Error('This screen has no search box or search button.');
    await sleep(1200);
    outcome = await phone.typeAuto(query, true);
    if (outcome === 'no-input') throw new Error('The search box did not open.');
  }
  if (outcome === 'submitted') return `Searched for "${query}".`;
  // Older Android cannot press Enter for an app; a visible search button often can.
  await sleep(400);
  const tapped = await phone.tapText('search').catch(() => '');
  return tapped
    ? `Typed "${query}" and tapped search.`
    : `Typed "${query}" in the search box, but could not press Enter. Tap the search button on the keyboard.`;
}

const YOUTUBE_SEARCH = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

/** Plays through YouTube: open the results, then start the first one. */
async function playOnYouTube(phone: Phone, query: string, canTap: boolean): Promise<string> {
  await phone.openUrl(YOUTUBE_SEARCH(query));
  if (!canTap) {
    return `Opened YouTube results for "${query}". Turn on phone control in Agent so I can also press play for you.`;
  }
  // Results take a moment to load; try a few times before giving up.
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(1800);
    const played = await phone.tapFirstResult(query).catch(() => '');
    if (played) return `Playing on YouTube: ${played}`;
  }
  return `Opened YouTube results for "${query}", but could not tap the first result.`;
}

async function playMedia(phone: Phone, query: string, app: string, canTap: boolean): Promise<string> {
  const wanted = app.trim().toLowerCase();
  if (wanted === 'youtube' || wanted === 'yt') return playOnYouTube(phone, query, canTap);
  try {
    await phone.playFromSearch(query, wanted === 'yt music' ? 'YouTube Music' : app.trim());
    return `Asked ${app.trim() || 'your music app'} to play "${query}".`;
  } catch (e) {
    // A named app that cannot do it is an error; with no app named, fall back to YouTube.
    if (wanted) throw e;
    return playOnYouTube(phone, query, canTap);
  }
}

export interface ToolAccess {
  /** A folder has been shared with the agent. */
  files: boolean;
  /** The user allowed creating and overwriting files. */
  fileChanges: boolean;
  /** The accessibility service is on. */
  phoneControl: boolean;
}

export function buildTools(access: ToolAccess): Tool[] {
  const tools: Tool[] = [];

  if (access.files) {
    tools.push(
      {
        name: 'list_files',
        description: 'List the files and folders inside a folder of the shared folder.',
        args: { path: 'folder path relative to the shared folder, "" for the top' },
        run: (a) => files.listFiles(typeof a.path === 'string' ? a.path : ''),
      },
      {
        name: 'read_file',
        description: 'Read a text file.',
        args: { path: 'file path relative to the shared folder' },
        run: (a) => files.readFile(str(a.path, 'path')),
      },
    );
    if (access.fileChanges) {
      tools.push(
        {
          name: 'write_file',
          description: 'Create a text file, or replace the contents of an existing one.',
          args: { path: 'file path relative to the shared folder', content: 'the full text to save' },
          run: async (a) => {
            const path = str(a.path, 'path');
            const content = str(a.content, 'content');
            if (await files.exists(path)) {
              const ok = await confirm('Replace this file?', `The agent wants to overwrite "${path}".`);
              if (!ok) throw new Error('The user did not allow overwriting this file.');
            }
            return files.writeFile(path, content);
          },
        },
        {
          name: 'delete_file',
          description: 'Delete a file. The user is asked to confirm.',
          args: { path: 'file path relative to the shared folder' },
          run: async (a) => {
            const path = str(a.path, 'path');
            const ok = await confirm('Delete this file?', `The agent wants to delete "${path}". This cannot be undone.`);
            if (!ok) throw new Error('The user did not allow deleting this file.');
            return files.deleteFile(path);
          },
        },
      );
    }
  }

  const phone = HezamPhone;
  if (phone) {
    /** After an action, give the screen a moment to change and report what it shows now. */
    const thenScreen = async (done: string) => {
      if (!access.phoneControl) return done;
      await sleep(1100);
      const screen = await phone.readScreen().catch(() => '(screen could not be read)');
      return `${done}\nScreen now:\n${screen}`;
    };

    tools.push(
      {
        name: 'open_app',
        description: 'Open an installed app by its name.',
        args: { name: 'app name, e.g. "Chrome"' },
        run: async (a) => thenScreen(`Opened ${await phone.openApp(str(a.name, 'name'))}.`),
      },
      {
        name: 'list_apps',
        description: 'List the names of the installed apps.',
        args: {},
        run: async () => (await phone.listApps()).join(', '),
      },
      {
        name: 'open_link',
        description: 'Open a web link in the browser.',
        args: { url: 'full link starting with https://' },
        run: async (a) => {
          const url = str(a.url, 'url');
          if (!/^https?:\/\//i.test(url)) throw new Error('Only http and https links can be opened.');
          await phone.openUrl(url);
          return thenScreen(`Opened ${url}.`);
        },
      },
    );

    tools.push({
      name: 'play_media',
      description: 'Find and play a song, artist or video. Uses a music app, or YouTube when asked or when no music app can.',
      args: { query: 'song, artist or video to play', app: 'app to use, e.g. "YouTube" or "Spotify"; "" for any' },
      run: async (a) => playMedia(phone, str(a.query, 'query'), typeof a.app === 'string' ? a.app : '', access.phoneControl),
    });

    if (access.phoneControl) {
      tools.push(
        {
          name: 'read_screen',
          description: 'Read what is on the screen now, as a numbered list of elements.',
          args: {},
          run: () => phone.readScreen(),
        },
        {
          name: 'tap',
          description: 'Tap an element from the latest screen list.',
          args: { index: 'element number' },
          integerArgs: ['index'],
          run: async (a) => {
            const index = int(a.index, 'index');
            await phone.tap(index);
            return thenScreen(`Tapped [${index}].`);
          },
        },
        {
          name: 'type_text',
          description: 'Type text into an editable element from the latest screen list.',
          args: { index: 'element number', text: 'text to type' },
          integerArgs: ['index'],
          run: async (a) => {
            const index = int(a.index, 'index');
            await phone.typeText(index, str(a.text, 'text'));
            return thenScreen(`Typed into [${index}].`);
          },
        },
        {
          name: 'tap_text',
          description: 'Tap the button or item on screen that shows the given words. Easier than tap when you know the label.',
          args: { text: 'words shown on the button or item, e.g. "Play"' },
          run: async (a) => thenScreen(`Tapped "${await phone.tapText(str(a.text, 'text'))}".`),
        },
        {
          name: 'type_here',
          description: 'Type text into the text box that is focused, or the first text box on screen.',
          args: { text: 'text to type' },
          run: async (a) => {
            const outcome = await phone.typeAuto(str(a.text, 'text'), false);
            if (outcome === 'no-input') throw new Error('There is no text box on this screen. Tap one first.');
            return thenScreen('Typed the text.');
          },
        },
        {
          name: 'search_here',
          description: "Search inside the app that is open now: finds its search box, types the query and presses Enter.",
          args: { query: 'what to search for' },
          run: async (a) => thenScreen(await searchHere(phone, str(a.query, 'query'))),
        },
        {
          name: 'press_enter',
          description: 'Press Enter / Search on the keyboard for the focused text box.',
          args: {},
          run: async () => {
            if (!(await phone.pressEnter())) throw new Error('Enter could not be pressed here. Tap the search or send button instead.');
            return thenScreen('Pressed Enter.');
          },
        },
        {
          name: 'scroll',
          description: 'Scroll the screen.',
          args: { direction: '"down" or "up"' },
          run: async (a) => {
            const direction = a.direction === 'up' ? 'up' : 'down';
            await phone.scroll(direction);
            return thenScreen(`Scrolled ${direction}.`);
          },
        },
        {
          name: 'press_button',
          description: 'Press a system button.',
          args: { button: '"back", "home", "recents" or "notifications"' },
          run: async (a) => {
            const button = str(a.button, 'button');
            await phone.pressButton(button);
            return thenScreen(`Pressed ${button}.`);
          },
        },
      );
    }
  }
  return tools;
}
