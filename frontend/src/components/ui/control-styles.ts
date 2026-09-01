import { cn } from '@/lib/cn';
import { disabled, focusRing, transition } from './styles';

/**
 * Shared appearance for text inputs, selects and textareas, so a school's
 * radius and border tokens land on all three identically.
 */
export const controlBase = cn(
  'w-full rounded-md border bg-surface text-ink',
  'placeholder:text-ink-muted',
  // The contact shadow is what makes a field read as an inset well rather than a
  // flat outlined box, and it is the same one the cards use, so controls and
  // containers share a light source.
  'shadow-sm',
  transition,
  focusRing,
  disabled,
);

export const controlPadding = 'px-3 py-2 min-h-touch';

/**
 * Invalid controls get a border *and* an icon-free colour change plus aria-invalid.
 *
 * The hover tint lives here rather than in `controlBase` so it cannot override an
 * invalid field's red border — an error must not quietly disappear under the
 * pointer.
 */
export function controlBorder(isInvalid: boolean): string {
  return isInvalid ? 'border-danger' : 'border-line-strong hover:border-primary-muted';
}
