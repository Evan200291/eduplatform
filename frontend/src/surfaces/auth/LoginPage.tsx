import { useState } from 'react';
import { Alert, focusRing, transition } from '@/components/ui';
import { AuthCard } from '@/components/layout';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/auth';
import { resolveSchoolSlug } from '@/theme';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { StaffLoginForm } from './StaffLoginForm';
import { StudentLoginForm } from './StudentLoginForm';

const MODES = [
  { id: 'student', label: 'I am a student' },
  { id: 'staff', label: 'Teacher or staff' },
] as const;

type Mode = (typeof MODES)[number]['id'];

const tab = {
  base: cn('flex-1 rounded-md px-3 py-2 text-sm min-h-touch', focusRing, transition),
  idle: 'text-ink-muted hover:bg-surface-sunken',
  active: 'bg-surface font-medium text-ink shadow-sm',
} as const;

/**
 * The single sign-in screen.
 *
 * The backend has one login endpoint discriminated on `method`; this presents it
 * as two audiences, because "which of four authentication methods do you use?" is
 * not a question anybody can answer. Students first — they are the majority of
 * sign-ins and the least able to navigate a wrong guess.
 *
 * There is no "forgot password" link, by design: credentials are reset by a
 * teacher or school admin, so a link here would only lead to a dead end.
 */
export function LoginPage() {
  useDocumentTitle('Sign in');
  const [mode, setMode] = useState<Mode>('student');
  const endedReason = useAuthStore((state) => state.endedReason);
  const schoolSlug = resolveSchoolSlug() ?? undefined;

  return (
    <AuthCard title="Sign in" description="Welcome back.">
      {endedReason === 'expired' ? (
        <Alert tone="info" title="You were signed out." className="mb-4">
          That happens after a while away. Sign in to pick up where you left off.
        </Alert>
      ) : null}

      <div role="tablist" aria-label="Sign-in type" className="mb-5 flex gap-1 rounded-md bg-surface-sunken p-1">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={mode === option.id}
            aria-controls={`login-panel-${option.id}`}
            id={`login-tab-${option.id}`}
            onClick={() => setMode(option.id)}
            className={cn(tab.base, mode === option.id ? tab.active : tab.idle)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`login-panel-${mode}`}
        aria-labelledby={`login-tab-${mode}`}
      >
        {mode === 'student' ? (
          <StudentLoginForm defaultSchoolSlug={schoolSlug} />
        ) : (
          <StaffLoginForm defaultSchoolSlug={schoolSlug} />
        )}
      </div>
    </AuthCard>
  );
}
