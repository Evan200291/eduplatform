import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Field, Input } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { fieldErrorsOf, isValidationError } from '@/lib/form-errors';
import type { LoginCredentials } from '@/auth';
import { useLogin } from './use-login';

/**
 * Sign-in for young learners: a class code, and a PIN only if the school uses one.
 *
 * Everything here is sized for a child on a shared tablet — large inputs, a
 * numeric keypad for the PIN, no email, no password rules, and the school code
 * pre-filled from the URL so most learners type one thing and press the button.
 *
 * The PIN checkbox is the learner's own memory aid, not a security control: the
 * backend decides which method a code is valid for.
 */
export function StudentLoginForm({ defaultSchoolSlug }: { defaultSchoolSlug?: string }) {
  const login = useLogin();
  const [studentCode, setStudentCode] = useState('');
  const [pin, setPin] = useState('');
  const [usesPin, setUsesPin] = useState(false);
  const [schoolSlug, setSchoolSlug] = useState(defaultSchoolSlug ?? '');

  const errors = fieldErrorsOf(login.error);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedSlug = schoolSlug.trim().toLowerCase();
    const school = trimmedSlug ? { schoolSlug: trimmedSlug } : {};
    const code = studentCode.trim().toUpperCase();

    const credentials: LoginCredentials = usesPin
      ? { method: 'STUDENT_CODE_PIN', studentCode: code, pin, ...school }
      : { method: 'STUDENT_CODE', studentCode: code, ...school };

    login.mutate(credentials);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {login.error && !isValidationError(login.error) ? <ErrorState error={login.error} /> : null}

      <Field
        label="Your code"
        isRequired
        error={errors.studentCode}
        hint="Your teacher gives you this."
      >
        <Input
          value={studentCode}
          onChange={(event) => setStudentCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="text-lg tracking-heading"
        />
      </Field>

      {defaultSchoolSlug ? null : (
        <Field label="School code" error={errors.schoolSlug}>
          <Input
            value={schoolSlug}
            onChange={(event) => setSchoolSlug(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
      )}

      <Checkbox
        label="I also have a PIN"
        checked={usesPin}
        onChange={(event) => setUsesPin(event.target.checked)}
      />

      {usesPin ? (
        <Field label="PIN" isRequired error={errors.pin}>
          <Input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            minLength={4}
            maxLength={8}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            autoComplete="off"
            className="text-lg tracking-heading"
          />
        </Field>
      ) : null}

      <Button type="submit" size="lg" isLoading={login.isPending} fullWidth>
        Let&rsquo;s go
      </Button>
    </form>
  );
}
