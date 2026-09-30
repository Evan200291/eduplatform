import { cn } from '@/lib/cn';
import type { BuddyMood } from './buddy-mood';

export interface BuddyProps {
  mood?: BuddyMood;
  /** Rendered width and height, in px. */
  size?: number;
  /** A gentle idle bob. Off where the buddy sits beside text the learner is reading. */
  bob?: boolean;
  className?: string;
}

const BODY = 'var(--midas-color-primary)';
const EDGE = 'var(--midas-color-primary-strong)';
const BELLY = 'var(--midas-color-primary-soft)';
const INK = '#2b3a55';
const BEAK = '#ff9600';

/**
 * Pip, the Midas buddy: one SVG, five moods, no bitmap assets.
 *
 * Coloured from the school's primary token, so a rebrand recolours the buddy
 * with everything else. Purely decorative — the adjacent text always carries the
 * meaning — so it is hidden from assistive technology; pass a visible label
 * next to it rather than relying on the mood.
 *
 * Same drawing as the prototype in docs/design/kids/mascot.js.
 */
export function Buddy({ mood = 'happy', size = 120, bob = true, className }: BuddyProps) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={cn('kid-buddy shrink-0', bob && 'kid-buddy--bob', className)}
    >
      <ellipse cx="100" cy="188" rx="52" ry="8" fill="rgba(43,58,85,.12)" />

      {mood === 'cheer' ? (
        <>
          <path d="M40 128 Q22 96 34 76" stroke={BODY} strokeWidth="16" strokeLinecap="round" fill="none" />
          <path d="M160 128 Q178 96 166 76" stroke={BODY} strokeWidth="16" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <ellipse cx="38" cy="140" rx="12" ry="20" fill={EDGE} transform="rotate(18 38 140)" />
          <ellipse cx="162" cy="140" rx="12" ry="20" fill={EDGE} transform="rotate(-18 162 140)" />
        </>
      )}

      <path
        d="M100 26 C150 26 176 66 176 118 C176 166 144 186 100 186 C56 186 24 166 24 118 C24 66 50 26 100 26Z"
        fill={BODY}
      />
      <path d="M62 30 L54 6 L82 24Z M138 30 L146 6 L118 24Z" fill={BODY} />
      <ellipse cx="100" cy="146" rx="46" ry="36" fill={BELLY} />
      <ellipse cx="58" cy="118" rx="11" ry="7" fill="#ff8fa3" opacity=".55" />
      <ellipse cx="142" cy="118" rx="11" ry="7" fill="#ff8fa3" opacity=".55" />

      <Eyes mood={mood} />
      <path d="M91 104 L109 104 L100 116Z" fill={BEAK} />
      <Mouth mood={mood} />

      <ellipse cx="78" cy="184" rx="16" ry="7" fill={BEAK} />
      <ellipse cx="122" cy="184" rx="16" ry="7" fill={BEAK} />

      <Extras mood={mood} />
    </svg>
  );
}

function Eyes({ mood }: { mood: BuddyMood }) {
  switch (mood) {
    case 'cheer':
      return (
        <>
          <path d="M63 92 Q78 72 93 92" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
          <path d="M107 92 Q122 72 137 92" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        </>
      );
    case 'sleepy':
      return (
        <>
          <path d="M63 92 Q78 102 93 92" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
          <path d="M107 92 Q122 102 137 92" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        </>
      );
    case 'think':
      return (
        <>
          <ellipse cx="78" cy="88" rx="15" ry="18" fill="#fff" />
          <ellipse cx="122" cy="88" rx="15" ry="18" fill="#fff" />
          <circle cx="86" cy="84" r="8" fill={INK} />
          <circle cx="130" cy="84" r="8" fill={INK} />
          <circle cx="89" cy="80" r="3" fill="#fff" />
          <circle cx="133" cy="80" r="3" fill="#fff" />
          <path d="M64 66 Q78 58 92 68" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        </>
      );
    case 'oops':
      return (
        <>
          <ellipse cx="78" cy="90" rx="15" ry="18" fill="#fff" />
          <ellipse cx="122" cy="90" rx="15" ry="18" fill="#fff" />
          <circle cx="78" cy="96" r="8" fill={INK} />
          <circle cx="122" cy="96" r="8" fill={INK} />
          <circle cx="81" cy="92" r="3" fill="#fff" />
          <circle cx="125" cy="92" r="3" fill="#fff" />
          <path d="M62 72 L92 66 M108 66 L138 72" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        </>
      );
    default:
      return (
        <>
          <g className="kid-blink">
            <ellipse cx="78" cy="88" rx="15" ry="18" fill="#fff" />
            <ellipse cx="122" cy="88" rx="15" ry="18" fill="#fff" />
          </g>
          <circle cx="80" cy="91" r="8" fill={INK} />
          <circle cx="120" cy="91" r="8" fill={INK} />
          <circle cx="83" cy="87" r="3" fill="#fff" />
          <circle cx="123" cy="87" r="3" fill="#fff" />
        </>
      );
  }
}

function Mouth({ mood }: { mood: BuddyMood }) {
  switch (mood) {
    case 'cheer':
      return (
        <>
          <path d="M84 118 Q100 146 116 118 Z" fill="#c2410c" />
          <path d="M90 128 Q100 138 110 128" fill="#ff8fa3" />
        </>
      );
    case 'think':
      return <path d="M92 128 Q100 124 108 128" fill="none" stroke="#c2410c" strokeWidth="5" strokeLinecap="round" />;
    case 'sleepy':
      return <ellipse cx="100" cy="128" rx="6" ry="5" fill="#c2410c" />;
    case 'oops':
      return <path d="M90 132 Q100 122 110 132" fill="none" stroke="#c2410c" strokeWidth="5" strokeLinecap="round" />;
    default:
      return (
        <>
          <path d="M88 122 Q100 136 112 122 Z" fill="#c2410c" />
          <path d="M92 126 Q100 132 108 126" fill="#ff8fa3" />
        </>
      );
  }
}

function Extras({ mood }: { mood: BuddyMood }) {
  if (mood === 'cheer') {
    return (
      <g fill="#ffc800">
        <path d="M28 40 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" />
        <path d="M168 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" />
      </g>
    );
  }
  if (mood === 'sleepy') {
    return (
      <g fill="#1cb0f6" fontFamily="Nunito, sans-serif" fontWeight="900">
        <text x="150" y="48" fontSize="22">
          z
        </text>
        <text x="166" y="30" fontSize="28">
          Z
        </text>
      </g>
    );
  }
  return null;
}
