/**
 * Translates Markdown prose while leaving code untouched.
 * Pure (the actual translator is passed in), so it is unit-testable.
 */

export type TranslateFn = (text: string) => Promise<string>;

const HAS_LETTERS = /\p{L}{2,}/u;
/** Leading whitespace plus a list/heading/quote marker: "  - ", "## ", "1. ", "> ". */
const LINE_PREFIX = /^(\s*(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+|>\s*)?)(.*)$/s;

async function translateInline(text: string, translate: TranslateFn): Promise<string> {
  // Inline code spans are kept exactly; only the prose around them is translated.
  const parts = text.split(/(`[^`\n]+`)/g);
  const out: string[] = [];
  for (const part of parts) {
    if (part.startsWith('`') || !HAS_LETTERS.test(part)) {
      out.push(part);
      continue;
    }
    const lead = part.match(/^\s*/)![0];
    const trail = part.match(/\s*$/)![0];
    const translated = (await translate(part.trim())).trim();
    out.push(lead + translated + trail);
  }
  return tidyEmphasis(out.join(''));
}

/** Machine translation tends to pad emphasis markers ("** text **"), which breaks Markdown. */
function tidyEmphasis(text: string): string {
  return text.replace(/\*\*\s+([^*\n]+?)\s+\*\*/g, '**$1**').replace(/\*\*\s+([^*\n]+?)\*\*/g, '**$1**');
}

export async function translateMarkdown(source: string, translate: TranslateFn): Promise<string> {
  const lines = source.split('\n');
  const out: string[] = [];
  let inCode = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      out.push(line);
      continue;
    }
    if (inCode || !HAS_LETTERS.test(line)) {
      out.push(line);
      continue;
    }
    const [, prefix, body] = line.match(LINE_PREFIX)!;
    out.push(prefix + (await translateInline(body, translate)));
  }
  return out.join('\n');
}
