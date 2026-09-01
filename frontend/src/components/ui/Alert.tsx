import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconError, IconInfo, IconSuccess, IconWarning } from './icons';

/**
 * An inline message about the page or a form.
 *
 * `role="alert"` is set only for the error tone: it interrupts a screen reader
 * mid-sentence, which is right for "we could not save your work" and wrong for
 * "here is a tip".
 */
const tones = {
  info: {
    container: 'bg-secondary-soft border-secondary-muted text-ink',
    Icon: IconInfo,
    iconClass: 'text-secondary-strong',
  },
  success: {
    container: 'bg-success-soft border-success-muted text-ink',
    Icon: IconSuccess,
    iconClass: 'text-success-strong',
  },
  warning: {
    container: 'bg-warning-soft border-warning-muted text-ink',
    Icon: IconWarning,
    iconClass: 'text-warning-strong',
  },
  danger: {
    container: 'bg-danger-soft border-danger-muted text-ink',
    Icon: IconError,
    iconClass: 'text-danger-strong',
  },
} as const;

export type AlertTone = keyof typeof tones;

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Recovery action. Every error the user can act on should offer one. */
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const { container, Icon, iconClass } = tones[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border p-4', container, className)}
    >
      <Icon aria-hidden className={cn('mt-1 h-5 w-5 shrink-0', iconClass)} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn('text-sm', title && 'mt-1')}>{children}</div> : null}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
