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
          run: async (a) => {
            const index = int(a.index, 'index');
            await phone.typeText(index, str(a.text, 'text'));
            return thenScreen(`Typed into [${index}].`);
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
