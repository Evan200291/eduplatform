import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Modal } from '@/components/ui';
import { authActions, useCan, useTenant } from '@/auth';
import {
  DEFAULT_IDLE_MINUTES,
  idlePhase,
  readLastActivity,
  writeLastActivity,
  type IdlePhase,
} from '@/auth/idle';
import { fetchCurrentSchoolSettings } from '@/tenancy/tenancy.api';
import { qk } from '@/query/keys';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
/** Writing on every keystroke is pointless; once every few seconds is plenty. */
const MARK_THROTTLE_MS = 5_000;

/**
 * Signs the user out after the school's inactivity limit (see `auth/idle.ts`).
 *
 * Staff read the limit from their school's settings. Learners do not hold
 * `school.settings.read`, so until the server exposes the value to them they
 * get the schema default of two hours.
 */
export function IdleSignOut() {
  const canRead = useCan('school.settings.read');
  const tenant = useTenant();
  const settings = useQuery({
    queryKey: qk.schoolSettings.current,
    queryFn: fetchCurrentSchoolSettings,
    enabled: canRead && Boolean(tenant?.schoolId),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const idleMs = (settings.data?.sessionIdleMinutes ?? DEFAULT_IDLE_MINUTES) * 60_000;

  const [phase, setPhase] = useState<IdlePhase>('active');
  const [secondsLeft, setSecondsLeft] = useState(60);
  const lastMark = useRef(0);
  const signingOut = useRef(false);

  const mark = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastMark.current < MARK_THROTTLE_MS) return;
    lastMark.current = now;
    writeLastActivity(now);
  }, []);

  useEffect(() => {
    mark(true);
    const onActivity = () => mark();
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [mark]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const last = readLastActivity(lastMark.current);
      const next = idlePhase(last, now, idleMs);
      if (next === 'expired') {
        if (!signingOut.current) {
          signingOut.current = true;
          void authActions.signOut('idle');
        }
        return;
      }
      setPhase(next);
      setSecondsLeft(Math.max(0, Math.ceil((last + idleMs - now) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, phase === 'warning' ? 1_000 : 5_000);
    return () => window.clearInterval(timer);
  }, [idleMs, phase]);

  const stay = () => {
    mark(true);
    setPhase('active');
  };

  return (
    <Modal
      isOpen={phase === 'warning'}
      onClose={stay}
      title="Are you still there?"
      footer={
        <>
          <Button variant="ghost" onClick={() => void authActions.signOut()}>
            Sign out now
          </Button>
          <Button onClick={stay}>Stay signed in</Button>
        </>
      }
    >
      <p className="leading-body text-ink" role="status">
        Nobody has used this screen for a while, so you will be signed out in {secondsLeft} second
        {secondsLeft === 1 ? '' : 's'} to keep your account safe. Anything you already handed in or saved stays saved.
      </p>
    </Modal>
  );
}
