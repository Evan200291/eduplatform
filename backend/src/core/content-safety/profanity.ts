// ─────────────────────────────────────────────────────────────────────────────
// Baseline profanity / unsafe-language filter.
//
// Midas Learning Cloud is built for children, and nicknames are free text,
// unmoderated, and shown directly on leaderboards. This module is a basic
// denylist-based safety net applied at write time to catch the obvious cases
// (plain profanity, slurs, and simple evasion via leetspeak or repeated
// characters). It is deliberately NOT a production content-moderation system:
// no ML classifier, no multi-language coverage, no exhaustive slur curation.
// Scope is intentionally limited per the task that introduced it — treat this
// as a floor, not a complete solution.
// ─────────────────────────────────────────────────────────────────────────────

import { PROFANITY_DENYLIST } from './profanity-list';

/** Collapses runs of 2+ repeated characters down to one, e.g. "fuuuuck" -> "fuck". */
function collapseRepeats(value: string): string {
  return value.replace(/(.)\1+/g, '$1');
}

// The denylist itself is run through the same repeat-collapsing so that words
// with a genuine doubled letter (e.g. "asshole", "nigger") still match after
// a normalized token has had its own repeats collapsed — both sides land on
// the same collapsed form.
// Entries shorter than 3 characters after collapsing (e.g. "kkk" -> "k") are
// dropped: they are too generic to check as a standalone collapsed token
// without producing false positives on ordinary short tokens or initials.
const COLLAPSED_DENYLIST: ReadonlySet<string> = new Set(
  Array.from(PROFANITY_DENYLIST, collapseRepeats).filter((word) => word.length >= 3),
);

/** 0→o, 1→i, 3→e, 4→a, 5→s, @→a, $→s, plus a few other common substitutions. */
const LEETSPEAK_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/**
 * Normalizes text into a sequence of lowercase word tokens with diacritics
 * stripped, leetspeak substitutions applied, and runs of 2+ repeated
 * characters collapsed to a single character (so "fuuuuck" and "fuck" both
 * normalize the same way). This is intentionally aggressive about collapsing
 * doubled letters — it trades a few ordinary names normalizing to something
 * slightly different (e.g. "Bella" -> "bela") for reliably catching repeated-
 * character evasion, and only matters here because we only ever compare the
 * normalized form against the denylist, never display it.
 */
function normalizeToTokens(text: string): string[] {
  const lowered = text
    .toLowerCase()
    .normalize('NFD')
    // Strip combining diacritical marks (U+0300–U+036F) left behind by NFD
    // normalization, e.g. turning "é" into "e".
    .replace(/[̀-ͯ]/g, '');

  const substituted = lowered
    .split('')
    .map((char) => LEETSPEAK_MAP[char] ?? char)
    .join('');

  const collapsed = collapseRepeats(substituted);

  return collapsed
    .split(/[^a-z]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * Returns true if `text` contains language that fails the baseline denylist
 * check — plain profanity, common slurs, or simple evasions of them (leetspeak
 * substitutions, repeated characters). This is a pragmatic safety net for
 * child-facing free text (e.g. nicknames), not exhaustive moderation: it will
 * miss creative evasions and out-of-list terms, and callers should not treat
 * a `false` result as a guarantee the text is appropriate.
 */
export function containsUnsafeLanguage(text: string): boolean {
  if (!text) return false;

  const tokens = normalizeToTokens(text);
  if (tokens.length === 0) return false;

  // Whole-word match against the token stream (both sides repeat-collapsed).
  if (tokens.some((token) => COLLAPSED_DENYLIST.has(token))) return true;

  // Compound/concatenated check (e.g. "fuckyou" typed with no space, or a
  // banned word directly glued to extra letters/digits). Restricted to
  // denylist words of 4+ letters, and to tokens not much longer than the
  // word itself, specifically to avoid the classic false-positive trap of
  // short words like "ass" or "sex" matching inside ordinary words such as
  // "class", "assistant", "grass" or "Essex".
  return tokens.some((token) =>
    Array.from(COLLAPSED_DENYLIST).some(
      (word) => word.length >= 4 && token.length <= word.length + 6 && token.includes(word),
    ),
  );
}
