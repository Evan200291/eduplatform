import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { focusRing, text, type LucideIcon } from '@/components/ui';
import { playAccent } from '../play-accents';

export interface TileProps {
  to: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  /**
   * Position in the tile grid. Only picks which decorative colour the tile
   * wears — nothing about a tile's meaning is carried by it.
   */
  accentIndex?: number;
  className?: string;
}

/**
 * A large, obvious destination for the student surface.
 *
 * Each tile is tinted with its own colour from the decorative rotation so the
 * grid reads as five distinct places rather than five copies of one card — the
 * fastest way for a child to re-find "the green one" between visits. Sized well
 * above the touch-target token and given a description, because a learner
 * scanning a home page reads the picture and the sentence, not the label alone.
 * Renders as an anchor so it behaves like the link it is.
 */
export function Tile({ to, label, description, icon: Icon, accentIndex = 0, className }: TileProps) {
  const accent = playAccent(accentIndex);

  return (
    <Link
      to={to}
      className={cn(
        'group flex min-h-touch flex-col gap-3 rounded-lg border-2 p-4 shadow-sm',
        accent.surface,
        accent.borderSoft,
        'hover:-translate-y-1 hover:shadow-md',
        accent.hoverBorder,
        // Token-driven, so it collapses to 0ms for a learner who asked for
        // reduced motion.
        'transition-[transform,box-shadow,border-color] duration-base ease-standard',
        focusRing,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex h-12 w-12 items-center justify-center rounded-full shadow-sm',
          accent.chip,
        )}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className={cn(text.heading, 'text-lg')}>{label}</span>
      {description ? <span className="text-sm leading-body text-ink">{description}</span> : null}
    </Link>
  );
}
