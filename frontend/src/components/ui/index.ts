/**
 * The Midas UI kit.
 *
 * House rules for everything in this folder:
 *
 *  - **Tokens only.** Colours, spacing, radius, shadow and duration come from
 *    Tailwind classes that resolve to `--midas-*` variables. No hex values, no
 *    arbitrary pixel sizes, no inline styles except for genuinely dynamic values
 *    (a progress bar's width).
 *  - **Variants are data.** Each component keeps a `const variants = {...}` map at
 *    the top. Restyling is one edit in one obvious place.
 *  - **`className` wins.** Every component merges a caller's `className` last
 *    through `cn()`, so a screen can adjust layout without a new prop.
 *  - **Accessibility is not optional.** Labels are required where an element has
 *    no visible text, focus is always visible, state is never conveyed by colour
 *    alone, and interactive targets respect the touch-target token.
 *
 * Import from `@/components/ui` rather than the individual files.
 */

export { Alert, type AlertProps, type AlertTone } from './Alert';
export { Avatar, type AvatarProps } from './Avatar';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { Button, type ButtonProps, type ButtonVariant } from './Button';
export { ButtonLink, type ButtonLinkProps } from './ButtonLink';
export { buttonClasses, buttonVariants, type ButtonStyleOptions } from './button-styles';
export { Card, CardBody, CardFooter, CardHeader, type CardHeaderProps } from './Card';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { DataTable, type Column, type DataTableProps } from './DataTable';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Field, type FieldProps } from './Field';
export { IconButton, type IconButtonProps } from './IconButton';
export { Input, type InputProps } from './Input';
export { Modal, type ModalProps } from './Modal';
export { PageHeader, type PageHeaderProps } from './PageHeader';
export { Pagination, type PaginationProps } from './Pagination';
export { ProgressBar, type ProgressBarProps } from './ProgressBar';
export { Select, type SelectOption, type SelectProps } from './Select';
export { Skeleton, SkeletonText, type SkeletonProps } from './Skeleton';
export { Spinner, type SpinnerProps } from './Spinner';
export { Textarea, type TextareaProps } from './Textarea';
export * from './icons';
export { controlSize, disabled, focusRing, panel, text, transition, type Size } from './styles';
