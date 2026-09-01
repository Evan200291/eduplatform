import { useEffect, useState } from 'react';

/**
 * Tracks browser connectivity.
 *
 * `navigator.onLine` only knows whether an interface is up, so it can report
 * "online" on a captive-portal wifi that reaches nothing. Treat it as a hint for
 * messaging, never as a gate on whether to attempt a request — the request layer
 * already reports real reachability via `NETWORK_UNREACHABLE`.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
