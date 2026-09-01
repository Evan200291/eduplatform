import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Card, CardBody, text } from '@/components/ui';
import { cn } from '@/lib/cn';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the default panel. Receives a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Hook for the telemetry layer. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time crashes so one broken widget cannot blank the whole app.
 *
 * Deliberately kept dumb: it renders a recovery panel and nothing else. Request
 * failures are *not* crashes — those belong in `ErrorState`, which knows the
 * error codes. This is the last resort for genuine bugs.
 *
 * Place one around the router (so a crashed screen keeps the shell) and one
 * around any independently-failing region such as a dashboard chart.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <Card className="mx-auto my-8 max-w-lg">
        <CardBody className="space-y-3 text-center">
          <h2 className={cn(text.heading, 'text-xl')}>This part stopped working.</h2>
          <p className="text-sm text-ink-muted">
            Nothing you did caused it. Try again, or reload the page if it keeps happening.
          </p>
          {import.meta.env.DEV ? (
            <pre className="overflow-x-auto rounded-md bg-surface-sunken p-3 text-left text-xs text-danger-strong scrollbar-thin">
              {error.message}
            </pre>
          ) : null}
          <div className="flex justify-center gap-2 pt-1">
            <Button onClick={this.reset}>Try again</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }
}
