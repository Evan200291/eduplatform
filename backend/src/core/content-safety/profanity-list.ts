// ─────────────────────────────────────────────────────────────────────────────
// Denylist data for the baseline profanity/unsafe-language filter.
// Deliberately a plain word list, not a moderation model: a few hundred common
// English profanities and slurs, lowercase, no punctuation. See profanity.ts
// for the normalization and matching logic that uses this list, and for the
// scope note explaining why this is intentionally not exhaustive.
// ─────────────────────────────────────────────────────────────────────────────

export const PROFANITY_DENYLIST: ReadonlySet<string> = new Set([
  // Common profanity
  'fuck', 'fucker', 'fucking', 'fucked', 'motherfucker', 'fuckface', 'fuckwit',
  'shit', 'shitty', 'shithead', 'bullshit', 'shitface',
  'bitch', 'bitches', 'bitchy',
  'ass', 'asshole', 'asswipe', 'jackass', 'dumbass',
  'bastard', 'bastards',
  'damn', 'goddamn', 'goddamn',
  'crap', 'crappy',
  'piss', 'pissed', 'pissoff',
  'dick', 'dickhead', 'dickface',
  'cock', 'cocksucker',
  'cunt', 'cunts',
  'pussy', 'pussies',
  'twat',
  'wanker', 'wank',
  'bollocks',
  'bloody',
  'arse', 'arsehole',
  'douche', 'douchebag',
  'prick',
  'slut', 'slutty',
  'whore', 'whores',
  'skank', 'skanky',
  'hoe', 'hoes',
  'jerkoff', 'jackoff',
  'bugger',
  'shag',
  'twerp',

  // Slurs (racial, ethnic, homophobic, transphobic, ableist) — kept as bare
  // tokens deliberately; no euphemism list is provided.
  'nigger', 'nigga', 'niggers', 'niggas',
  'chink', 'chinks',
  'gook', 'gooks',
  'spic', 'spics',
  'wetback', 'wetbacks',
  'kike', 'kikes',
  'raghead', 'ragheads',
  'towelhead',
  'gyppo', 'gypo',
  'coon', 'coons',
  'beaner', 'beaners',
  'paki',
  'faggot', 'fag', 'fags', 'faggots',
  'dyke', 'dykes',
  'tranny', 'trannies',
  'retard', 'retarded', 'retards',
  'spaz', 'spastic',
  'cripple', 'crippled',
  'midget',
  'mongoloid',

  // Sexual/vulgar terms
  'sex', 'porn', 'porno', 'pornography',
  'boobs', 'boob', 'tits', 'titties',
  'penis', 'vagina', 'anal', 'anus',
  'orgasm', 'masturbate', 'masturbation',
  'blowjob', 'handjob', 'rimjob',
  'cum', 'cumming',
  'horny',
  'nude', 'nudes', 'naked',
  'sextoy', 'dildo',
  'incest', 'pedo', 'pedophile', 'rape', 'rapist',

  // Drug/violence-adjacent terms often abused in usernames
  'cocaine', 'heroin', 'meth', 'crackhead', 'druggie',
  'kill', 'killer', 'murder', 'murderer', 'suicide',
  'nazi', 'hitler', 'kkk', 'isis',
  'terrorist', 'terrorism',

  // Common leetspeak/typosquatted variants worth listing explicitly (in
  // addition to the runtime leetspeak normalization in profanity.ts)
  'sh1t', 'fuk', 'fuq', 'phuck', 'azz', 'byotch', 'b1tch',
]);
