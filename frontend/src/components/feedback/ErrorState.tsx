import { Alert, Button, IconRetry } from '@/components/ui';
import { errorCopy, errorReference } from './error-messages';

export interface ErrorStateProps {
  error: unknown;
  /** Wire this to a query's `refetch` to make the message actionable. */
  onRetry?: () => void;
  className?: string;
}

/**
 * The standard way to show a failed request.
 *
 * Screens never write their own error text: they hand the caught error here and
 * the copy comes from the code map, so the same failure reads identically
 * wherever it happens.
 */
export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  const { title, action } = errorCopy(error);
  const reference = errorReference(error);

  return (
    <Alert
      tone="danger"
      title={title}
      className={className}
      action={
        onRetry ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            leadingIcon={<IconRetry aria-hidden className="h-4 w-4" />}
          >
            Try again
          </Button>
        ) : undefined
      }
    >
      {action ? <p>{action}</p> : null}
      {reference ? (
        <p className="mt-1 text-xs text-ink-muted">
          Reference: <span className="font-mono">{reference}</span>
        </p>
      ) : null}
    </Alert>
  );
}
