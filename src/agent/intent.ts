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

  // Enter key.
  if (/^(?:i-?enter|press enter|pindutin (?:ang )?enter|enter)$/i.test(t)) return { tool: 'press_enter', args: {} };

  // "play Buwan by juan karlos", "magpatugtog ng OPM sa Spotify", "i-play ang lofi sa YouTube"
  m = t.match(/^(?:i-?play|mag-?play(?: ng)?|play|patugtugin|magpatugtog(?: ng)?|tugtugin|ipatugtog|i-?tugtog)\s+(?:mo\s+)?(?:ang\s+|yung\s+|ng\s+|the\s+)?(?:kantang\s+|kanta\s+(?:na\s+)?|song\s+|music\s+(?=\S))?(.+?)(?:\s+(?:sa|on|in|gamit ang|using)\s+(youtube music|youtube|spotify|yt music|apple music|[\w ]+? app))?$/i);
  if (m) {
    const app = (m[2] ?? '').replace(/\s+app$/i, '').trim();
    return { tool: 'play_media', args: { query: m[1].trim(), app } };
  }

  // "i-type ang hello", "type hello world sa search bar"
  m = t.match(/^(?:i-?type|mag-?type(?: ng)?|type)\s+(?:mo\s+)?(?:ang\s+|yung\s+|ng\s+)?["“']?(.+?)["”']?(\s+(?:sa|in|into|on)\s+(?:the\s+|ang\s+)?(?:search(?:\s?(?:bar|box|engine|field))?|hanapan))?$/i);
  if (m) {
    return m[2]
      ? { tool: 'search_here', args: { query: m[1].trim() } }
      : { tool: 'type_here', args: { text: m[1].trim() } };
  }

  // "search weather sa Shopee": open that app, then search inside it (see planCommand).
  // A search with no place named searches the web.
  // ("hanapin" alone is left to the chat: "hanapin ang mali sa sagot ko" is not a web search.)
  m = t.match(/^(?:i-?search|search(?: for)?|mag-?search(?: ng)?|i-?google|google)\s+(?:mo\s+)?(?:ang\s+|yung\s+|ng\s+|for\s+)?(.+)$/i);
  if (m && !/\s(?:sa|on|in)\s+\S+$/i.test(m[1])) {
    return { tool: 'open_link', args: { url: SEARCH_SITES.google(m[1].trim()) } };
  }

  // "pindutin ang Play", "i-tap ang Login button", "click Subscribe"
  m = t.match(/^(?:i-?tap|tap(?: on)?|pindutin|i-?pindot|i-?click|click(?: on)?|i-?press|press)\s+(?:mo\s+)?(?:ang\s+|yung\s+|the\s+)?["“']?(.+?)["”']?(?:\s+(?:na\s+)?button)?$/i);
  if (m && m[1].split(' ').length <= 6) return { tool: 'tap_text', args: { text: m[1].trim() } };

  // "open Chrome", "buksan mo ang YouTube app", "pakibuksan ang camera"
  m = t.match(/^(?:buksan|pakibuksan|i-?open|open|launch|i-?launch|start|simulan|patakbuhin)\s+(?:mo\s+)?(?:ang\s+|yung\s+|the\s+|my\s+)?(.+?)(?:\s+app)?$/i);
  if (m && m[1].split(' ').length <= 4 && !/\b(?:at|and|then|tapos|saka|pagkatapos)\b/i.test(m[1])) {
    return { tool: 'open_app', args: { name: m[1].trim() } };
  }
  return null;
}

const VERB_START =
  /^(?:paki)?(?:buksan|i-?open|open|launch|i-?search|search|mag-?search|hanapin|maghanap|look up|i-?type|mag-?type|type|i-?tap|tap|pindutin|i-?pindot|i-?click|click|i-?press|press|i-?play|mag-?play|play|patugtugin|magpatugtog|tugtugin|ipatugtog|i-?scroll|mag-?scroll|scroll|bumalik|balik|go |pumunta|i-?enter|enter|basahin|read|ilista|list)\b/i;

const CONNECTOR = /\s*(?:,\s*)?\b(?:at saka|tapos ay|pagkatapos ay|pagkatapos|tapos|saka|and then|then|and|at)\b\s*|\s*[,;]\s*/gi;

/**
 * Splits "buksan ang Chrome at i-search ang weather" into its commands. A connector only
 * splits when a command verb follows it, so "play Guns and Roses" stays in one piece.
 */
export function splitClauses(text: string): string[] {
  const t = strip(text);
  const clauses: string[] = [];
  let start = 0;
  for (const match of t.matchAll(CONNECTOR)) {
    const end = match.index + match[0].length;
    if (match.index > start && VERB_START.test(t.slice(end))) {
      clauses.push(t.slice(start, match.index));
      start = end;
    }
  }
  clauses.push(t.slice(start));
  return clauses.map((c) => c.trim()).filter(Boolean);
}

const SEARCH_IN = /^(?:i-?search|search(?: for)?|mag-?search(?: ng)?|hanapin|maghanap(?: ng)?|look up)\s+(?:mo\s+)?(?:ang\s+|yung\s+|ng\s+|for\s+)?(.+?)\s+(?:sa|on|in)\s+(?:the\s+|ang\s+)?(.+?)(?:\s+app)?$/i;
const SEARCH_ANY = /^(?:i-?search|search(?: for)?|mag-?search(?: ng)?|hanapin|maghanap(?: ng)?|look up)\s+(?:mo\s+)?(?:ang\s+|yung\s+|ng\s+|for\s+)?(.+)$/i;

/**
 * Turns a command, possibly with several parts, into the exact steps to run, with no
 * model involved. Returns null when any part is not understood (the agent's model then
 * takes over).
 */
export function planCommand(text: string): DirectCommand[] | null {
  const plan: DirectCommand[] = [];
  let insideApp = false;
  for (const clause of splitClauses(text)) {
    // Searching inside a named app: open it, then use its own search box.
    const within = clause.match(SEARCH_IN);
    if (within && !/^(?:google|youtube)$/i.test(within[2].trim())) {
      plan.push({ tool: 'open_app', args: { name: within[2].trim() } });
      plan.push({ tool: 'search_here', args: { query: within[1].trim() } });
      insideApp = true;
      continue;
    }
    // After "open X", a bare "search Y" means: search inside X.
    const any = clause.match(SEARCH_ANY);
    if (insideApp && any && !within) {
      plan.push({ tool: 'search_here', args: { query: any[1].trim() } });
      continue;
    }
    const step = directCommand(clause);
    if (!step) return null;
    plan.push(step);
    if (step.tool === 'open_app') insideApp = true;
  }
  return plan.length > 0 ? plan : null;
}

const ACTION_START =
  /^(?:buksan|pakibuksan|i-?open|open|launch|start|isara|close|i-?tap|tap|pindutin|i-?click|click|i-?type|type|i-?scroll|mag-?scroll|scroll|i-?search|hanapin|i-?send|send|ipadala|mag-?send|tawagan|call|i-?play|mag-?play|play|patugtugin|magpatugtog|i-?save|save|gumawa ng (?:file|folder|note)|create (?:a )?(?:file|folder|note)|burahin|i-?delete|delete|i-?rename|rename|ilista|list|basahin|read|kontrolin|control|i-?on|i-?off|turn (?:on|off)|go (?:to|back|home)|pumunta|bumalik|mag-?(?:message|text|chat)|i-?message|i-?text|i-?set|set (?:an? )?(?:alarm|timer)|mag-?alarm)\b/i;

const PHONE_NOUN =
  /\b(?:app|apps|file|files|folder|screen|phone|cellphone|telepono|settings|wifi|bluetooth|camera|gallery|chrome|youtube|facebook|messenger|tiktok|gmail|maps|play store|alarm|timer|notification|notifications|home screen|browser|google)\b/i;

const QUESTION_START = /^(?:ano|what|bakit|why|paano|how|sino|who|saan|where|kailan|when|alin|which|explain|ipaliwanag|define|is|are|does|do|can i|pwede ba|puwede ba)\b/i;

/** True when the message asks the assistant to act on the phone or its files. */
export function isAction(text: string): boolean {
  const t = strip(text);
  // "write a python script that opens a file" is a coding request, not a command.
  if (/\b(?:code|script|function|program|python|javascript|java|html|css|sql)\b/i.test(t)) return false;
  if (planCommand(text)) return true;
  if (QUESTION_START.test(t) && !/\b(?:sa screen|nasa screen|files? ko|folder ko)\b/i.test(t)) return false;
  return ACTION_START.test(t) && PHONE_NOUN.test(t);
}
