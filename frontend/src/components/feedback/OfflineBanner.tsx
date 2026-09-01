import { IconOffline } from '@/components/ui';
import { useOnlineStatus } from '@/hooks/use-online-status';

/**
 * A persistent bar shown while the browser reports no connection.
 *
 * Sits above the app chrome and is a live region, so the state change is
 * announced without stealing focus from whatever the user was doing.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  return (
    <div aria-live="polite" role="status">
      {isOnline ? null : (
        <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-sm text-ink">
          <IconOffline aria-hidden className="h-4 w-4 shrink-0 text-warning-strong" />
          <span>You are offline. Your work will not save until the connection is back.</span>
        </div>
      )}
    </div>
  );
}
