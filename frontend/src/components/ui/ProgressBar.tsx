import { cn } from '@/lib/cn';

export interface ProgressBarProps {
  /** 0–100. Clamped, so a bad server value cannot draw outside the track. */
  value: number;
  label: string;
  /** Shows the numeric value next to the label. Off for compact rows. */
  showValue?: boolean;
  tone?: 'brand' | 'success' | 'warning';
  className?: string;
}

const tones = {
  brand: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
} as const;

/**
 * A determinate progress bar.
 *
 * The label is always rendered — progress conveyed by bar length alone fails
 * both the colour-independence and the screen-reader requirements, so the
 * percentage is available as text and through `aria-valuenow`.
 */
export function ProgressBar({
  value,
  label,
  showValue = true,
  tone = 'brand',
  className,
}: ProgressBarProps) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink">{label}</span>
        {showValue ? <span className="text-ink-muted tabular-nums">{percent}%</span> : null}
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-base', tones[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
