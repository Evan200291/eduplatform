import { IconCheck, IconClose } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  PASSWORD_MIN_LENGTH,
  isPasswordAcceptable,
  passwordCharactersRemaining,
} from './password-policy';

/**
 * Live feedback while typing a new password.
 *
 * Stated as a met/unmet checklist rather than a strength meter: "medium" tells a
 * user nothing they can act on, whereas "4 more characters" does. The advice line
 * is advice — it is not checked, here or on the server. The rule itself lives in
 * `password-policy.ts`, where the forms read it too.
 */
export function PasswordRules({ value }: { value: string }) {
  const met = isPasswordAcceptable(value);
  const remaining = passwordCharactersRemaining(value);

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className={cn('flex items-center gap-2', met ? 'text-success-strong' : 'text-ink-muted')}>
        {met ? (
          <IconCheck aria-hidden className="h-4 w-4" />
        ) : (
          <IconClose aria-hidden className="h-4 w-4" />
        )}
        <span>
          At least {PASSWORD_MIN_LENGTH} characters
          {remaining > 0 ? ` — ${remaining} to go` : ''}
        </span>
      </p>
      <p className="text-ink-muted">
        A few unrelated words are easier to remember and harder to guess than one word with symbols.
      </p>
    </div>
  );
}
