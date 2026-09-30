export type BuddyMood = 'happy' | 'cheer' | 'think' | 'sleepy' | 'oops';

/**
 * Maps the free-text mood the companion endpoint returns onto one of Pip's five
 * faces. Deliberately forgiving: the server owns that vocabulary, and an unknown
 * word should fall back to a smile rather than break the screen.
 */
export function buddyMoodFor(mood: string | null | undefined): BuddyMood {
  const m = (mood ?? '').toLowerCase();
  if (/(sleep|tired|rest|nap|quiet)/.test(m)) return 'sleepy';
  if (/(cheer|excit|joy|proud|celebrat|thrill)/.test(m)) return 'cheer';
  if (/(think|curious|puzzl|wonder)/.test(m)) return 'think';
  if (/(sad|worr|oops|upset|lonely|hungry)/.test(m)) return 'oops';
  return 'happy';
}
