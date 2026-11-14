/**
 * File access for the agent, through Android's Storage Access Framework.
 * The user picks one folder; the agent can only see inside that folder.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const SAF = FileSystem.StorageAccessFramework;
const KEY = 'hezam.agent.folder.v1';
const MAX_LIST = 80;
export const MAX_READ_CHARS = 6000;

export const supported = true;

/** "primary:Download/notes/a.txt" style ids are the last path segment of a SAF URI. */
const documentId = (uri: string) => decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1));
const nameOf = (uri: string) => documentId(uri).split('/').pop() || documentId(uri);

export async function grantedFolder(): Promise<{ uri: string; name: string } | null> {
  const uri = await AsyncStorage.getItem(KEY);
  if (!uri) return null;
  try {
    await SAF.readDirectoryAsync(uri); // permission can be revoked from Android settings
    return { uri, name: documentId(uri).replace(/^primary:/, '') || 'Internal storage' };
  } catch {
    await AsyncStorage.removeItem(KEY);
    return null;
  }
}

export async function chooseFolder(): Promise<{ uri: string; name: string } | null> {
  const result = await SAF.requestDirectoryPermissionsAsync();
  if (!result.granted) return null;
  await AsyncStorage.setItem(KEY, result.directoryUri);
  return grantedFolder();
}

export async function forgetFolder(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

const segments = (path: string) =>
  path
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && s !== '.');

async function root(): Promise<string> {
  const folder = await grantedFolder();
  if (!folder) throw new Error('No folder has been shared with the agent yet.');
  return folder.uri;
}

/** Walks from the granted folder to `path`, one directory listing per segment. */
async function resolve(path: string): Promise<string> {
  let current = await root();
  for (const part of segments(path)) {
    if (part === '..') throw new Error('Paths cannot leave the shared folder.');
    const children = await SAF.readDirectoryAsync(current);
    const next = children.find((c) => nameOf(c) === part);
    if (!next) throw new Error(`"${part}" was not found.`);
    current = next;
  }
  return current;
}

export async function listFiles(path: string): Promise<string> {
  const dir = await resolve(path);
  const children = await SAF.readDirectoryAsync(dir);
  if (children.length === 0) return '(empty folder)';
  const lines: string[] = [];
  for (const child of children.slice(0, MAX_LIST)) {
    const info = await FileSystem.getInfoAsync(child).catch(() => null);
    if (info?.exists && info.isDirectory) lines.push(`[folder] ${nameOf(child)}/`);
    else lines.push(`${nameOf(child)}${info?.exists ? ` (${info.size} bytes)` : ''}`);
  }
  if (children.length > MAX_LIST) lines.push(`…and ${children.length - MAX_LIST} more`);
  return lines.join('\n');
}

export async function readFile(path: string): Promise<string> {
  const uri = await resolve(path);
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && info.isDirectory) throw new Error('That is a folder. Use list_files.');
  if (info.exists && info.size > 2_000_000) throw new Error('That file is too large to read as text.');
  const text = await FileSystem.readAsStringAsync(uri);
  return text.length > MAX_READ_CHARS
    ? `${text.slice(0, MAX_READ_CHARS)}\n…(file continues, ${text.length - MAX_READ_CHARS} more characters)`
    : text;
}

const MIME: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  html: 'text/html',
  py: 'text/x-python',
  js: 'text/javascript',
};

export async function exists(path: string): Promise<boolean> {
  try {
    await resolve(path);
    return true;
  } catch {
    return false;
  }
}

export async function writeFile(path: string, content: string): Promise<string> {
  const parts = segments(path);
  const fileName = parts.pop();
  if (!fileName) throw new Error('A file name is required.');
  const dir = await resolve(parts.join('/'));
  const children = await SAF.readDirectoryAsync(dir);
  let target = children.find((c) => nameOf(c) === fileName);
  if (!target) {
    const dot = fileName.lastIndexOf('.');
    const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
    // SAF appends the extension for known types, so pass the bare name in that case.
    const mime = MIME[ext] ?? 'application/octet-stream';
    target = await SAF.createFileAsync(dir, MIME[ext] ? fileName.slice(0, dot) : fileName, mime);
  }
  await FileSystem.writeAsStringAsync(target, content);
  return `Saved ${fileName} (${content.length} characters).`;
}

export async function deleteFile(path: string): Promise<string> {
  if (segments(path).length === 0) throw new Error('The shared folder itself cannot be deleted.');
  const uri = await resolve(path);
  await FileSystem.deleteAsync(uri);
  return `Deleted ${path}.`;
}
