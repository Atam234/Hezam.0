/**
 * Recognises when a chat message is a command to DO something on the phone
 * (as opposed to a question to answer), in English and Tagalog.
 * Simple commands are mapped straight to a tool so they work instantly and
 * do not depend on a small local model choosing the right step.
 * No runtime imports, so it is unit-testable.
 */

export interface DirectCommand {
  tool: string;
  args: Record<string, unknown>;
}

const clean = (s: string) =>
  s
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ');

const POLITE = /^(?:please|pls|paki|pwede(?:ng)? mo(?:ng)? bang?|puwede(?:ng)? mo(?:ng)? bang?|can you|could you|kindly)\s+/i;
const TRAILING = /\s+(?:please|pls|po|nga|naman|para sa akin|for me)$/i;

function strip(text: string): string {
  let t = clean(text);
  for (let i = 0; i < 3; i++) t = t.replace(POLITE, '').replace(TRAILING, '');
  return t;
}

const SEARCH_SITES: Record<string, (q: string) => string> = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
};

/** A one-step command that needs no model at all, or null. */
export function directCommand(text: string): DirectCommand | null {
  const t = strip(text);

  // "search cats on youtube", "i-search ang adobo recipe sa google", "hanapin sa google ang ..."
  let m =
    t.match(/^(?:i-?search|search|mag-?search(?: ng)?|hanapin|maghanap(?: ng)?|look up|google)\s+(?:mo\s+)?(?:ang\s+|ng\s+|for\s+)?(.+?)\s+(?:sa|on|in)\s+(google|youtube)$/i) ??
    t.match(/^(?:i-?search|search|hanapin|maghanap)\s+(?:mo\s+)?(?:sa|on|in)\s+(google|youtube)\s+(?:ang\s+|ng\s+|for\s+)?(.+)$/i);
  if (m) {
    const [query, site] = /^(google|youtube)$/i.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    return { tool: 'open_link', args: { url: SEARCH_SITES[site.toLowerCase()](query) } };
  }

  // A bare link.
  m = t.match(/^(?:buksan|i-?open|open|go to|pumunta sa)\s+(?:mo\s+)?(?:ang\s+)?(https?:\/\/\S+)$/i);
  if (m) return { tool: 'open_link', args: { url: m[1] } };

  // System buttons.
  if (/^(?:go |pumunta sa |bumalik sa |balik sa |punta sa )?home(?: screen)?$/i.test(t)) {
    return { tool: 'press_button', args: { button: 'home' } };
  }
  if (/^(?:go back|back|bumalik|balik|i-?back)$/i.test(t)) return { tool: 'press_button', args: { button: 'back' } };
  if (/^(?:show |open |buksan (?:ang )?|ipakita (?:ang )?)?(?:the )?(?:recent apps|recents)$/i.test(t)) {
    return { tool: 'press_button', args: { button: 'recents' } };
  }
  if (/^(?:show |open |buksan (?:ang )?|ipakita (?:ang )?)?(?:the |mga )?notifications?$/i.test(t)) {
    return { tool: 'press_button', args: { button: 'notifications' } };
  }

  // Scrolling.
  m = t.match(/^(?:i-?scroll|mag-?scroll|scroll)\s+(?:pa)?(up|down|pataas|pababa|taas|baba)$/i);
  if (m) return { tool: 'scroll', args: { direction: /up|taas/i.test(m[1]) ? 'up' : 'down' } };

  // Reading the screen.
  if (/^(?:read (?:the |my )?screen|basahin (?:mo )?(?:ang |yung )?screen|ano (?:ang )?(?:nasa|nakikita sa) screen(?: ko)?)$/i.test(t)) {
    return { tool: 'read_screen', args: {} };
  }

  // Files.
  if (
    /^(?:list|show|ilista|ipakita|tingnan)\s+(?:mo\s+)?(?:ang\s+|the\s+|my\s+)?(?:mga\s+)?(?:files?|laman)(?:\s+(?:ko|sa folder(?: ko)?|in my folder|ng folder(?: ko)?))?$/i.test(t) ||
    /^(?:ano|what)(?:-ano)?\s+(?:ang\s+|are\s+)?(?:mga\s+|the\s+)?files?\s+(?:ko|sa folder(?: ko)?|in my folder)$/i.test(t)
  ) {
    return { tool: 'list_files', args: { path: '' } };
  }
  m = t.match(/^(?:read|basahin|buksan|open|ipakita|show)\s+(?:mo\s+)?(?:ang\s+|yung\s+|the\s+)?(?:file\s+(?:na\s+)?)?([\w\-./ ]+\.[a-z0-9]{1,6})$/i);
  if (m) return { tool: 'read_file', args: { path: m[1].trim() } };

  // Installed apps.
  if (/^(?:list|show|ilista|ipakita)\s+(?:mo\s+)?(?:ang\s+|the\s+|my\s+)?(?:mga\s+)?apps?(?:\s+ko)?$/i.test(t)) {
    return { tool: 'list_apps', args: {} };
  }

  // "open Chrome", "buksan mo ang YouTube app", "pakibuksan ang camera"
  m = t.match(/^(?:buksan|pakibuksan|i-?open|open|launch|i-?launch|start|simulan|patakbuhin)\s+(?:mo\s+)?(?:ang\s+|yung\s+|the\s+|my\s+)?(.+?)(?:\s+app)?$/i);
  if (m && m[1].split(' ').length <= 4 && !/\b(?:at|and|then|tapos|saka|pagkatapos)\b/i.test(m[1])) {
    return { tool: 'open_app', args: { name: m[1].trim() } };
  }
  return null;
}

const ACTION_START =
  /^(?:buksan|pakibuksan|i-?open|open|launch|start|isara|close|i-?tap|tap|pindutin|i-?click|click|i-?type|type|i-?scroll|mag-?scroll|scroll|i-?search|hanapin|i-?send|send|ipadala|mag-?send|tawagan|call|i-?play|play|i-?save|save|gumawa ng (?:file|folder|note)|create (?:a )?(?:file|folder|note)|burahin|i-?delete|delete|i-?rename|rename|ilista|list|basahin|read|kontrolin|control|i-?on|i-?off|turn (?:on|off)|go (?:to|back|home)|pumunta|bumalik|mag-?(?:message|text|chat)|i-?message|i-?text|i-?set|set (?:an? )?(?:alarm|timer)|mag-?alarm)\b/i;

const PHONE_NOUN =
  /\b(?:app|apps|file|files|folder|screen|phone|cellphone|telepono|settings|wifi|bluetooth|camera|gallery|chrome|youtube|facebook|messenger|tiktok|gmail|maps|play store|alarm|timer|notification|notifications|home screen|browser|google)\b/i;

const QUESTION_START = /^(?:ano|what|bakit|why|paano|how|sino|who|saan|where|kailan|when|alin|which|explain|ipaliwanag|define|is|are|does|do|can i|pwede ba|puwede ba)\b/i;

/** True when the message asks the assistant to act on the phone or its files. */
export function isAction(text: string): boolean {
  if (directCommand(text)) return true;
  const t = strip(text);
  if (QUESTION_START.test(t) && !/\b(?:sa screen|nasa screen|files? ko|folder ko)\b/i.test(t)) return false;
  // "write a python script that opens a file" is a coding request, not a command.
  if (/\b(?:code|script|function|program|python|javascript|java|html|css|sql)\b/i.test(t)) return false;
  return ACTION_START.test(t) && PHONE_NOUN.test(t);
}
