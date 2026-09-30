import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSpeak, speak } from './read-aloud';

describe('read-aloud', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is unavailable when the device has no speech synthesis', () => {
    expect(canSpeak()).toBe(false);
  });

  it('does nothing, and does not throw, when unavailable', () => {
    expect(() => speak('Which shape shows a half?')).not.toThrow();
  });

  it('cancels what is playing, then speaks slowly, when available', () => {
    const speakSpy = vi.fn();
    const cancel = vi.fn();
    class Utterance {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    vi.stubGlobal('speechSynthesis', { speak: speakSpy, cancel });
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = { speak: speakSpy, cancel };

    speak('Hello');

    expect(cancel).toHaveBeenCalledOnce();
    const spoken = speakSpy.mock.calls[0][0] as Utterance;
    expect(spoken.text).toBe('Hello');
    expect(spoken.rate).toBeLessThan(1);
  });

  it('ignores blank text', () => {
    const speakSpy = vi.fn();
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = { speak: speakSpy, cancel: vi.fn() };
    vi.stubGlobal('SpeechSynthesisUtterance', class {});
    speak('   ');
    expect(speakSpy).not.toHaveBeenCalled();
  });
});
