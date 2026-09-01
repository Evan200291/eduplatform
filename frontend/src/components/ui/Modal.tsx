import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconClose } from './icons';
import { IconButton } from './IconButton';
import { text } from './styles';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Buttons for the footer, in reading order (cancel first, confirm last). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Set false for destructive confirmations, where a stray click should not dismiss. */
  closeOnBackdropClick?: boolean;
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
} as const;

/**
 * A modal dialog built on the native `<dialog>` element.
 *
 * Native rather than hand-rolled on purpose: the browser gives us the focus
 * trap, Escape-to-close, the top layer and `aria-modal` for free. Every custom
 * implementation of those has to be re-tested against every screen reader; this
 * one does not.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdropClick = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  // Escape and the close button both fire the dialog's `cancel`/`close` events,
  // so parent state is kept in step from one place.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = (): void => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      onClick={(event) => {
        // A click that lands on the dialog element itself is on the backdrop —
        // its children stop propagation by covering the box.
        if (closeOnBackdropClick && event.target === dialogRef.current) onClose();
      }}
      className={cn(
        'w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-0 text-ink shadow-lg',
        'backdrop:bg-overlay',
        sizes[size],
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className={cn(text.heading, 'min-w-0 text-lg text-balance')}>{title}</h2>
        <IconButton label="Close" onClick={onClose} variant="ghost" size="sm">
          <IconClose aria-hidden className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-4 scrollbar-thin">{children}</div>

      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-sunken px-4 py-3">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
