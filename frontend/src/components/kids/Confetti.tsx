const COLOURS = [
  'var(--midas-color-play-5)',
  'var(--midas-color-play-1)',
  'var(--midas-color-accent)',
  'var(--midas-color-play-3)',
  'var(--midas-color-play-2)',
  'var(--midas-color-play-4)',
];

/**
 * A short burst of falling paper for finishing something. Place it inside a
 * `relative` container; it fills it and never blocks a tap. Hidden entirely for
 * anyone who asked for reduced motion (see styles/kids.css).
 */
export function Confetti({ pieces = 24 }: { pieces?: number }) {
  return (
    <div aria-hidden className="kid-confetti">
      {Array.from({ length: pieces }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: COLOURS[i % COLOURS.length],
            animationDelay: `${(i % 9) * 0.25}s`,
            animationDuration: `${2.2 + (i % 5) * 0.4}s`,
          }}
        />
      ))}
    </div>
  );
}
