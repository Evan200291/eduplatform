import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { canSpeak, speak, stopSpeaking } from '@/lib/read-aloud';

export interface ReadAloudButtonProps {
  /** Exactly what should be spoken — usually the prompt, without markup. */
  text: string;
  label?: string;
  className?: string;
}

/**
 * A round speaker button that reads `text` aloud.
 *
 * Renders nothing when the device cannot speak, so it never promises sound it
 * cannot deliver. Tapping again while it is reading stops it. It stops on
 * unmount too, so moving to the next question never leaves the last one talking.
 */
export function ReadAloudButton({ text, label = 'Read this out loud', className }: ReadAloudButtonProps) {
  const [isSpeaking, setSpeaking] = useState(false);
  const available = canSpeak();

  useEffect(() => () => stopSpeaking(), []);

  if (!available) return null;

  const toggle = () => {
    if (isSpeaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(text, () => setSpeaking(false));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isSpeaking ? 'Stop reading' : label}
      aria-pressed={isSpeaking}
      className={cn('kid-speak', className)}
    >
      <span aria-hidden className="text-xl leading-none">
        {isSpeaking ? '■' : '🔊'}
      </span>
    </button>
  );
}
