/** Text helpers for Voice mode. Pure, so they are unit-testable. */

/** Turns a Markdown answer into plain text that sounds right when read aloud. */
export function speakable(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ') // code is shown on screen, not read out
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Splits off the complete sentences that follow `spokenLength` characters of `text`,
 * so speech can start while the rest of the answer is still being written.
 * The unfinished tail is left for a later call.
 */
export function completeSentences(text: string, spokenLength: number): { sentences: string; nextLength: number } {
  const rest = text.slice(spokenLength);
  let end = -1;
  const boundary = /[.!?…]["')\]]?(?=\s)|\n/g;
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(rest)) !== null) end = m.index + m[0].length;
  if (end <= 0) return { sentences: '', nextLength: spokenLength };
  return { sentences: rest.slice(0, end).trim(), nextLength: spokenLength + end };
}

export const speechLocale = (lang: 'tl' | 'en') => (lang === 'tl' ? 'fil-PH' : 'en-US');
