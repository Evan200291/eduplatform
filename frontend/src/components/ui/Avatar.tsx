import { cn } from '@/lib/cn';

export interface AvatarProps {
  name: string | undefined | null;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
} as const;

/** First letters of the first and last words — safe for one-word, empty or missing names. */
function initials(name: string | undefined | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * A user's picture, or their initials when there is none.
 *
 * `aria-hidden` because an avatar always sits next to the name it represents;
 * announcing it again would just repeat the name.
 */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const shared = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
    sizes[size],
    className,
  );

  if (src) {
    return <img src={src} alt="" aria-hidden className={cn(shared, 'object-cover')} />;
  }

  return (
    <span aria-hidden className={cn(shared, 'bg-primary-soft font-medium text-primary-strong')}>
      {initials(name)}
    </span>
  );
}
