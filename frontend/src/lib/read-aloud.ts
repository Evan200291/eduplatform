/**
 * Read-aloud for learners who cannot yet read a prompt on their own.
 *
 * Uses the browser's built-in speech synthesis: nothing is sent anywhere and no
 * audio asset has to be produced per question, which is why it can cover every
 * prompt a teacher writes. Where the device has no voice the button is simply
 * not rendered (see `ReadAloudButton`), so a learner is never offered something
 * that will stay silent.
 */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Speaks `text` slowly and clearly; cancels anything already being read. */
export function speak(text: string, onEnd?: () => void): void {
  if (!canSpeak() || text.trim() === '') return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = document.documentElement.lang || 'en';
  utterance.rate = 0.85;
  utterance.pitch = 1.1;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  window.speechSynthesis.speak(utterance);
}
