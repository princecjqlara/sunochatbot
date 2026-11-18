/** Suno's saved brief keys are shared by forms, profiles and assignment gates. */
export const SONG_BRIEF_FIELDS = [
    ['Business Name', 'Business name'],
    ['Specialty/Products', 'Main products or services'],
    ['Tagline', 'Tagline or slogan'],
    ['English or Tagalog lyrics', 'Lyrics language'],
    ['Male or Female singer', 'Vocal preference'],
    ['Genre', 'Preferred mood/style'],
    ['Additional requests', 'Additional requests'],
] as const;

export const SUNO_BRIEF_KEYS = SONG_BRIEF_FIELDS.map(([, key]) => key);
// The customer form is seven fields; the saved Suno profile has twenty.
export const SUNO_DETAIL_FIELDS = ['Customer name', 'Business name', 'Business type', 'Main products or services',
    'Tagline or slogan', 'Song duration', 'Song concept or campaign idea', 'Existing lyrics or script',
    'Preferred mood/style', 'Lyrics language', 'Vocal preference', 'Song purpose', 'Target audience', 'Main message',
    'Business strengths', 'Signature product/service', 'Location or branch', 'Agreed package', 'Deadline or occasion date', 'Additional requests'];
type BusinessConfig = { instructions?: unknown; details_to_collect?: unknown; business_domain?: unknown };
const key = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string[]> = {
    'Business name': ['business', 'company name'],
    'Main products or services': ['specialty', 'specialty/products', 'products', 'products/services', 'product or service'],
    'Tagline or slogan': ['tagline', 'slogan'],
    'Lyrics language': ['language', 'lyrics language', 'english or tagalog lyrics'],
    'Vocal preference': ['singer', 'vocal', 'voice', 'male or female singer'],
    'Preferred mood/style': ['genre', 'music genre', 'music style', 'mood'],
    'Additional requests': ['additional instructions', 'requests'],
};
const canonical = new Map<string, string>(SONG_BRIEF_FIELDS.flatMap(([label, name]) =>
    [label, name, ...(aliases[name] || [])].map(alias => [key(alias), name] as const)));
SUNO_DETAIL_FIELDS.forEach(name => canonical.set(key(name), name));
export const SUNO_DETAIL_ALIASES = Object.fromEntries(canonical);
// The SQL generator imports the same patterns; assignment and display agree.
export const SUNO_EMPTY_ANSWER_PATTERN = '^(?:unknown|asked|not (?:provided|specified|stated|yet provided|yet specified)|n/?a|null|undefined|pending|tbd|to be (?:confirmed|determined)|not sure|unsure|hindi pa alam)[.!?\\s]*$|^[-_.?\\s]+$';
export const SUNO_LANGUAGE_PLACEHOLDER_PATTERN = '^english\\s*(?:/|or)\\s*tagalog(?:\\s+lyrics)?$';
export const SUNO_VOCAL_PLACEHOLDER_PATTERN = '^male\\s*(?:/|or)\\s*female(?:\\s+singer)?$';
export function sunoDetailKey(label: string): string | undefined { return canonical.get(key(label)); }

export function isSunoSongConfig(config?: BusinessConfig | null): boolean {
    if (config?.business_domain === 'song') return true;
    if (/^SONG_BRIEF_FORM:\s*\S+/im.test(String(config?.instructions || ''))) return true;
    const fields = Array.isArray(config?.details_to_collect) ? config!.details_to_collect as unknown[] : [];
    const music = new Set(['Lyrics language', 'Vocal preference', 'Preferred mood/style']);
    return new Set(fields.filter((field): field is string => typeof field === 'string')
        .map(field=>canonical.get(key(field)) || '').filter(field=>music.has(field))).size >= 2;
}

export function usesSunoConversationPolicy(config?: BusinessConfig | null): boolean {
    return isSunoSongConfig(config) || /^(?:PRIORITIZE_FILL_UP_FORM|SHORT_HUMAN_REPLIES):\s*true\s*$/im.test(String(config?.instructions || ''));
}

export function normalizeSongBrief(value: unknown): Record<string, string> {
    return Object.fromEntries(Object.entries(normalizeSunoDetails(value)).filter(([name]) => SUNO_BRIEF_KEYS.includes(name as typeof SUNO_BRIEF_KEYS[number])));
}

export function normalizeSunoDetails(value: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    // Canonical saved keys take priority, then deterministic alias order. An
    // empty canonical value still allows a meaningful alias to supply the answer.
    const entries=Object.entries(value).sort(([a],[b])=>Number(b===sunoDetailKey(b))-Number(a===sunoDetailKey(a)) || (a<b?-1:a>b?1:0));
    for (const [label, raw] of entries) {
        const name = canonical.get(key(label));
        if (!name || typeof raw !== 'string') continue;
        const text = raw.trim().slice(0, 500);
        if (!text || new RegExp(SUNO_EMPTY_ANSWER_PATTERN,'i').test(text)) continue;
        if (key(text) === key(label) || key(text) === key(name) || /^sample\s*:/i.test(text)) continue;
        if (name === 'Lyrics language' && new RegExp(SUNO_LANGUAGE_PLACEHOLDER_PATTERN,'i').test(text)) continue;
        if (name === 'Vocal preference' && new RegExp(SUNO_VOCAL_PLACEHOLDER_PATTERN,'i').test(text)) continue;
        if (!Object.prototype.hasOwnProperty.call(result,name)) result[name] = text;
    }
    return Object.fromEntries(SUNO_DETAIL_FIELDS.filter(name=>Object.prototype.hasOwnProperty.call(result,name)).map(name=>[name,result[name]]));
}

export function sunoAssignmentProgress(config: { details_to_collect?: unknown; details_completion_percent?: unknown }, value: unknown) {
    const details = normalizeSunoDetails(value);
    const configured = Array.isArray(config.details_to_collect) ? config.details_to_collect : SUNO_DETAIL_FIELDS;
    const fields = [...new Set(configured.filter((v): v is string => typeof v === 'string').map(sunoDetailKey).filter((v): v is string => !!v))];
    const percent = Number(config.details_completion_percent ?? 100);
    const required = Math.max(1, Math.ceil(fields.length * (Number.isFinite(percent) ? Math.min(100, Math.max(1, Math.round(percent))) : 100) / 100));
    const answered = fields.filter(field => details[field]);
    return { details, fields: answered, detail_count: answered.length, required, total: fields.length, eligible: fields.length > 0 && answered.length >= required };
}

export function songBriefProgress(value: unknown, minimum = 3) {
    const details = normalizeSongBrief(value);
    const fields = Object.keys(details).filter(name => name !== 'Additional requests');
    const required = Math.min(6, Math.max(1, Math.floor(minimum)));
    return { details, fields, detail_count: fields.length, required, eligible: fields.length >= required };
}
