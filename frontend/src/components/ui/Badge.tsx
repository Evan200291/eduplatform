import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A small status label.
 *
 * Every tone pairs a colour with a text label, never colour alone — an
 * accessibility requirement, and the reason `Badge` takes children rather than
 * rendering a bare dot.
 */
const tones = {
  neutral: 'bg-surface-sunken text-ink-muted border-line',
  info: 'bg-secondary-soft text-secondary-strong border-secondary-muted',
  success: 'bg-success-soft text-success-strong border-success-muted',
  warning: 'bg-warning-soft text-warning-strong border-warning-muted',
  danger: 'bg-danger-soft text-danger-strong border-danger-muted',
  brand: 'bg-primary-soft text-primary-strong border-primary-muted',
} as const;

/**
 * The same tones at full strength. A tinted badge is right in a dense admin
 * table, where a column of saturated pills would fight the data; it is too
 * quiet on a learner's screen, where the badge is often the thing they are
 * looking for. Same tone names either way, so a surface changes emphasis
 * without changing meaning.
 */
const solidTones = {
  neutral: 'bg-ink-muted text-surface border-transparent',
  info: 'bg-secondary text-secondary-contrast border-transparent',
  success: 'bg-success text-success-contrast border-transparent',
  warning: 'bg-warning text-warning-contrast border-transparent',
  danger: 'bg-danger text-danger-contrast border-transparent',
  brand: 'bg-primary text-primary-contrast border-transparent',
} as const;

export type BadgeTone = keyof typeof tones;

export interface BadgeProps {
  tone?: BadgeTone;
  /** `solid` fills the badge; `soft` (the default) tints it. */
  variant?: 'soft' | 'solid';
  children: ReactNode;
  /** Optional leading glyph. Purely decorative — the label carries the meaning. */
  icon?: ReactNode;
  className?: string;
}

export function Badge({
  tone = 'neutral',
  variant = 'soft',
  icon,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        variant === 'solid' ? solidTones[tone] : tones[tone],
        className,
      )}
    >
      {icon ? <span aria-hidden className="inline-flex">{icon}</span> : null}
      {children}
    </span>
  );
}
