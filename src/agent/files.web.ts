/** Web preview stand-in: a tiny in-memory folder so the agent screen can be demonstrated. */
export const supported = true;
export const MAX_READ_CHARS = 6000;

let granted = false;
const files = new Map<string, string>([
  ['notes.txt', 'Buy rice\nCall Ana on Friday'],
  ['todo.md', '- finish report\n- pay electric bill'],
]);

export async function grantedFolder() {
  return granted ? { uri: 'demo://folder', name: 'Download (demo)' } : null;
}
export async function chooseFolder() {
  granted = true;
  return grantedFolder();
}
export async function forgetFolder() {
  granted = false;
}
export async function listFiles(_path: string) {
  return [...files.entries()].map(([n, c]) => `${n} (${c.length} bytes)`).join('\n') || '(empty folder)';
}
export async function readFile(path: string) {
  const c = files.get(path.replace(/^\/+/, ''));
  if (c === undefined) throw new Error(`"${path}" was not found.`);
  return c;
}
export async function exists(path: string) {
  return files.has(path.replace(/^\/+/, ''));
}
export async function writeFile(path: string, content: string) {
  files.set(path.replace(/^\/+/, ''), content);
  return `Saved ${path} (${content.length} characters).`;
}
export async function deleteFile(path: string) {
  if (!files.delete(path.replace(/^\/+/, ''))) throw new Error(`"${path}" was not found.`);
  return `Deleted ${path}.`;
}
