/**
 * Hezam.0 router — picks which specialist should answer a message.
 *
 * It is a fast, fully offline keyword/pattern scorer (English + Tagalog/Taglish),
 * so routing costs no model inference and no extra RAM on the phone.
 * This file has no runtime imports so it can be unit-tested with plain Node.
 */

export type SpecialistId = 'general' | 'code' | 'writing' | 'creative' | 'reasoning';

export interface RouteDecision {
  specialist: SpecialistId;
  /** Raw score per specialist. */
  scores: Record<SpecialistId, number>;
  /** 0..1 — share of the total score held by the winner. */
  confidence: number;
  /** Signals that matched, for showing "why" in the UI. */
  matched: string[];
  /** True when a short follow-up stayed with the previous specialist. */
  sticky: boolean;
}

interface Rule {
  specialist: Exclude<SpecialistId, 'general'>;
  weight: number;
  re: RegExp;
  label: string;
}

const w = (words: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, 'iu');

const RULES: Rule[] = [
  // ---------- code ----------
  { specialist: 'code', weight: 6, re: /```/, label: 'code block' },
  {
    specialist: 'code',
    weight: 4,
    re: /(=>|===|!==|&&|\|\||<\/[a-z]+>|\bdef \w+\(|\bfunction\s*\w*\(|\bconsole\.log|\bprint\(|#include|\bimport \w+|\bSELECT\b.+\bFROM\b|\bnpm (i|install|run)\b|\bpip install\b)/,
    label: 'code syntax',
  },
  {
    specialist: 'code',
    weight: 4,
    re: /(Traceback \(most recent|Exception in thread|\b\w*(Error|Exception):|undefined is not|segmentation fault|stack trace|null pointer)/i,
    label: 'error message',
  },
  {
    specialist: 'code',
    weight: 3,
    re: w(
      'code|coding|codes|program|programming|mag-?program|script|function|bug|debug|i-?debug|compile|compiler|algorithm|algoritmo|api|backend|frontend|database|regex|refactor|unit test|source code|repository|github|terminal|command line',
    ),
    label: 'coding',
  },
  {
    specialist: 'code',
    weight: 3,
    re: w(
      'python|javascript|typescript|java|kotlin|swift|dart|flutter|react|react native|node\\.?js|html|css|sql|mysql|postgres|php|laravel|c\\+\\+|c#|rust|golang|bash|linux|docker|json|android studio|arduino',
    ),
    label: 'programming language',
  },
  {
    specialist: 'code',
    weight: 2,
    re: /(gumawa|gawa|gawan|build|create|make|develop)\b.{0,30}\b(app|website|web ?site|web ?app|bot|calculator|laro|game)\b/i,
    label: 'build software',
  },

  // ---------- writing ----------
  {
    specialist: 'writing',
    weight: 3,
    re: w(
      'essay|sanaysay|liham|letter|email|e-mail|tula|poem|poetry|kwento|kuwento|story|nobela|article|artikulo|blog|caption|speech|talumpati|resume|résumé|cover letter|script ng|lyrics|kanta|report|thesis|abstract|bio|mensahe|announcement|press release|product description',
    ),
    label: 'writing piece',
  },
  {
    specialist: 'writing',
    weight: 2,
    re: w(
      'write|writing|rewrite|sulat|isulat|sumulat|isulat mo|magsulat|sulatan|igawa ng sulat|compose|draft|paraphrase|i-?paraphrase|proofread|i-?proofread|grammar|gramatika|spelling|translate|i-?translate|isalin|salin|summarize|i-?summarize|ibuod|buod|buurin|summary|ayusin ang (sulat|grammar|pangungusap)|pangungusap|talata|paragraph|tone',
    ),
    label: 'writing task',
  },

  // ---------- creative: art, ideas, brainstorming ----------
  {
    specialist: 'creative',
    weight: 3,
    re: w(
      'brainstorm|mag-?brainstorm|idea|ideas|ideya|mga ideya|art|artwork|sining|drawing|drowing|guhit|iguhit|painting|illustration|logo|design|disenyo|concept|konsepto|slogan|tagline|color palette|kulay|character design|moodboard|image prompt|art prompt|tattoo|poster|mural|comic|anime|aesthetic',
    ),
    label: 'art & ideas',
  },
  {
    specialist: 'creative',
    weight: 2,
    re: w(
      'creative|malikhain|imagine|isipin mo|mag-?isip ng|suggest|suggestion|mungkahi|pangalan (ng|para)|name ideas|business name|business idea|negosyo idea|content idea|theme|tema|gimmick|inspirasyon|inspiration|kakaiba|unique',
    ),
    label: 'ideation',
  },

  // ---------- reasoning: math, logic, analysis ----------
  { specialist: 'reasoning', weight: 4, re: /\d\s*[-+*/x×÷^=]\s*\d/, label: 'arithmetic' },
  {
    specialist: 'reasoning',
    weight: 3,
    re: w(
      'math|mathematics|matematika|solve|i-?solve|lutasin|compute|i-?compute|kalkula|kalkulahin|calculate|equation|algebra|geometry|calculus|trigonometry|derivative|integral|fraction|percent|percentage|porsyento|probability|statistics|logic|lohika|puzzle|riddle|bugtong|prove|proof|theorem',
    ),
    label: 'math & logic',
  },
  {
    specialist: 'reasoning',
    weight: 2,
    re: w(
      'step by step|step-by-step|hakbang|analyze|i-?analyze|suriin|analysis|compare|ikumpara|paghambingin|pros and cons|reason|reasoning|bakit kaya|magkano|ilan lahat|ilang (araw|oras|taon|piraso)|interest|tubo|budget|plano|strategy|estratehiya|decide|desisyon',
    ),
    label: 'analysis',
  },
];

const ORDER: SpecialistId[] = ['code', 'reasoning', 'writing', 'creative', 'general'];
const MIN_SCORE = 2;
const STICKY_MAX_LENGTH = 80;

export function classify(text: string, previous?: SpecialistId): RouteDecision {
  const scores: Record<SpecialistId, number> = {
    general: 0,
    code: 0,
    writing: 0,
    creative: 0,
    reasoning: 0,
  };
  const matchedBy: Record<SpecialistId, string[]> = {
    general: [],
    code: [],
    writing: [],
    creative: [],
    reasoning: [],
  };

  for (const rule of RULES) {
    if (rule.re.test(text)) {
      scores[rule.specialist] += rule.weight;
      matchedBy[rule.specialist].push(rule.label);
    }
  }

  let best: SpecialistId = 'general';
  for (const id of ORDER) {
    if (scores[id] > scores[best]) best = id;
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  if (scores[best] < MIN_SCORE) {
    // Nothing specific matched. A short follow-up ("ayusin mo pa", "isa pa")
    // most likely continues the previous topic, so keep the same specialist.
    const isFollowUp =
      previous !== undefined &&
      previous !== 'general' &&
      text.trim().length > 0 &&
      text.trim().length <= STICKY_MAX_LENGTH;
    return {
      specialist: isFollowUp ? previous : 'general',
      scores,
      confidence: 0,
      matched: isFollowUp ? ['follow-up'] : [],
      sticky: isFollowUp,
    };
  }

  return {
    specialist: best,
    scores,
    confidence: total > 0 ? scores[best] / total : 0,
    matched: matchedBy[best],
    sticky: false,
  };
}

export interface RoutableModel {
  id: string;
  /** Specialists this model can serve, best fit first. */
  roles: SpecialistId[];
}

export interface ModelPick<M extends RoutableModel> {
  model: M;
  /** True when the ideal specialist model is not installed and another one stands in. */
  fallback: boolean;
}

/**
 * Choose an installed model for a specialist.
 * Preference: a model whose primary role is the specialist, then one that lists it
 * as a secondary role, then a general model, then anything installed.
 */
export function pickModel<M extends RoutableModel>(
  specialist: SpecialistId,
  catalog: M[],
  installed: ReadonlySet<string>,
): ModelPick<M> | null {
  const available = catalog.filter((m) => installed.has(m.id));
  if (available.length === 0) return null;

  const rank = (m: M) => {
    const i = m.roles.indexOf(specialist);
    if (i === 0) return 0;
    if (i > 0) return i;
    const g = m.roles.indexOf('general');
    return g >= 0 ? 10 + g : 20;
  };

  const model = [...available].sort((a, b) => rank(a) - rank(b))[0];
  return { model, fallback: model.roles[0] !== specialist };
}
