import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional class names with later Tailwind utilities winning over earlier
 * ones. Every component takes a `className` prop and merges it through this, so
 * callers can always override a style without editing the component.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
