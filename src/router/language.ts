/**
 * Offline language detection for Hezam.0 (Tagalog/Taglish vs English).
 * Used to decide which language the reply must be in and whether an answer
 * needs to go through the translator. No runtime imports, so it is unit-testable.
 */

export type Lang = 'tl' | 'en';
export type Detected = Lang | 'unknown';

export const LANGUAGE_NAME: Record<Lang, string> = { tl: 'Tagalog', en: 'English' };

const TAGALOG_WORDS = new Set(
  `ang ng mga sa ako ko mo ka ikaw kayo siya niya nila namin natin kami tayo sila akin iyo
  ito iyan iyon yan yun yung nito niyan dito diyan doon rito
  ano bakit paano saan kailan sino alin magkano ilan
  hindi oo opo po ho ba na pa lang lamang din rin naman kasi pero kung kapag pag dahil
  gusto ayaw kailangan pwede puwede meron mayroon wala walang may
  salamat kumusta kamusta maganda mabuti masama tama mali
  gawa gawan gawin gumawa paki sabihin tulungan tulong ibig sabihin
  talaga sige ngayon bukas kahapon mamaya nga daw raw tungkol lahat marami konti kaunti
  isa dalawa tatlo bawat iba ibang bago bagong mas pinaka sobra
  ay si ni kay nang upang habang hanggang muna ulit uli pala kaya siguro
  tanong sagot halimbawa paliwanag ipaliwanag isulat sumulat ibigay bigyan
  araw gabi umaga tanghali hapon taon buwan oras bahay tao bata guro kaibigan pamilya
  mahal pera trabaho negosyo pagkain tubig aking iyong ating kanyang kanilang
  ganito ganyan ganoon parang tulad gaya lalo medyo pati saka tapos`
    .split(/\s+/)
    .filter(Boolean),
);

const TAGALOG_AFFIX = /^(nag|mag|pag|naka|maka|pinaka|ipa|paki|nakaka|makaka|pina|ipina|napa|mapa|tag|taga|ika)[a-z]{3,}$|^(i|mag|nag|pag|na|ma|paki|ipa|naka|maka)-[a-z]+$|^[a-z]+-[a-z]+$/;

const ENGLISH_WORDS = new Set(
  `the is are was were be been am a an and or but of to in on for with from by as at it its this that
  these those i you he she we they my your his her our their me him them what why how where when who which
  can could would should will do does did not no yes have has had if then than so because about into
  please make write give tell show explain help need want use using there here more most very some any
  one two three first new also just only each other between after before`
    .split(/\s+/)
    .filter(Boolean),
);

/** Removes code so identifiers and keywords do not skew detection. */
export function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

function isTagalogToken(t: string): boolean {
  if (TAGALOG_WORDS.has(t)) return true;
  if (ENGLISH_WORDS.has(t)) return false;
  if (t.includes('-')) return TAGALOG_AFFIX.test(t);
  return TAGALOG_AFFIX.test(t) && t.length >= 7 ? !/(ing|tion|ment|ness|able|ize|ise)$/.test(t) : false;
}

export function detectLanguage(text: string): Detected {
  const tokens = stripCode(text)
    .toLowerCase()
    .replace(/[’']/g, '')
    .match(/[a-zñ]+(?:-[a-zñ]+)*/g);
  if (!tokens || tokens.length === 0) return 'unknown';

  let tl = 0;
  let en = 0;
  for (const t of tokens) {
    if (isTagalogToken(t)) tl++;
    else if (ENGLISH_WORDS.has(t)) en++;
  }
  const n = tokens.length;
  if (tl >= 2 && tl / n >= 0.18 && tl >= en * 0.5) return 'tl';
  if (n <= 3 && tl >= 1 && en === 0) return 'tl';
  if (en >= 1 && en / n >= 0.15) return 'en';
  if (tl >= 2 && tl > en) return 'tl';
  return 'unknown';
}

/**
 * An explicit request for the output language ("i-translate sa English",
 * "answer in Tagalog") overrides matching the user's own language.
 */
export function requestedLanguage(text: string): Lang | null {
  const m = text
    .toLowerCase()
    .match(/\b(?:sa|in|to|into|ng|gamit ang|using)\s+(?:wikang\s+)?(english|ingles|tagalog|filipino)\b/);
  if (!m) return null;
  return m[1] === 'english' || m[1] === 'ingles' ? 'en' : 'tl';
}

export type ReplyLanguageSetting = 'auto' | Lang;

/**
 * Language the reply should be written in.
 * `previous` is the language used earlier in the chat, for messages too short to judge.
 */
export function targetLanguage(text: string, setting: ReplyLanguageSetting, previous?: Lang): Lang {
  const asked = requestedLanguage(text);
  if (asked) return asked;
  if (setting !== 'auto') return setting;
  const detected = detectLanguage(text);
  if (detected !== 'unknown') return detected;
  return previous ?? 'en';
}

/** True when a finished answer is clearly in the other language and should be translated. */
export function needsTranslation(answer: string, target: Lang): boolean {
  const prose = stripCode(answer);
  if ((prose.match(/[a-zA-Zñ]+/g) ?? []).length < 6) return false; // code-only or too short to judge
  const detected = detectLanguage(prose);
  return detected !== 'unknown' && detected !== target;
}

export function languageInstruction(target: Lang): string {
  return target === 'tl'
    ? 'IMPORTANT: The user speaks Tagalog (Filipino). Write your ENTIRE reply in natural, conversational Tagalog. Keep code, commands, and technical terms unchanged. Do not answer in English. Sumagot sa wikang Tagalog.'
    : 'IMPORTANT: Write your entire reply in English.';
}

/** Short reminder appended to the latest user turn; small models obey the end of the prompt best. */
export function languageReminder(target: Lang): string {
  return target === 'tl' ? '(Sumagot sa Tagalog.)' : '(Reply in English.)';
}

export function translationPrompt(target: Lang): string {
  return `You are a professional translator. Translate the user's text into natural, fluent ${LANGUAGE_NAME[target]}${target === 'tl' ? ' (Filipino)' : ''}. Keep the Markdown formatting. Copy code blocks, inline code, numbers, names, and technical terms exactly as they are. Do not add comments or explanations. Output only the translation.`;
}
