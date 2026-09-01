import { cn } from '@/lib/cn';
import { IconSpinner } from './icons';

const sizes = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
} as const;

export interface SpinnerProps {
  size?: keyof typeof sizes;
  /** Read out by screen readers; pass null inside an element that already says it. */
  label?: string | null;
  className?: string;
}

/**
 * The loading indicator. Uses `animate-spin`, which the reduced-motion rules in
 * global.css neutralise — it becomes a static glyph rather than disappearing, so
 * the "something is happening" signal survives the preference.
 */
export function Spinner({ size = 'md', label = 'Loading…', className }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      <IconSpinner aria-hidden className={cn('animate-spin', sizes[size])} />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
