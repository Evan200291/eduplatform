import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { fieldErrorsOf, isValidationError } from '@/lib/form-errors';
import type { LoginCredentials } from '@/auth';
import { useLogin } from './use-login';

/**
 * Sign-in for staff and older students: an identifier plus a password.
 *
 * One field covers both backend methods. An identifier containing `@` is an
 * email, which is unique platform-wide; anything else is a username, which is
 * only unique inside a school and therefore needs the school code. Asking "are
 * you using an email or a username?" would be asking the user to know something
 * about our data model.
 */
export function StaffLoginForm({ defaultSchoolSlug }: { defaultSchoolSlug?: string }) {
  const login = useLogin();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [schoolSlug, setSchoolSlug] = useState(defaultSchoolSlug ?? '');

  const isEmail = identifier.includes('@');
  const errors = fieldErrorsOf(login.error);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

    // Email is unique platform-wide, so it never needs a school scope — and
    // must not silently inherit one. A `schoolSlug` left over from a previous
    // school-branded login (subdomain, `?school=`, or remembered localStorage)
    // would otherwise scope the lookup to that school and break sign-in for
    // any cross-tenant platform staff account, which by definition has no
    // `schoolId` to match against.
    const credentials: LoginCredentials = isEmail
      ? {
          method: 'EMAIL_PASSWORD',
          email: identifier.trim(),
          password,
        }
      : {
          method: 'USERNAME_PASSWORD',
          username: identifier.trim(),
          password,
          schoolSlug: schoolSlug.trim().toLowerCase(),
        };

    login.mutate(credentials);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {login.error && !isValidationError(login.error) ? <ErrorState error={login.error} /> : null}

      <Field
        label="Email or username"
        isRequired
        error={errors.email ?? errors.username}
        hint={isEmail ? undefined : 'Using a username? Add your school code below.'}
      >
        <Input
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="next"
        />
      </Field>

      {isEmail ? null : (
        <Field label="School code" isRequired error={errors.schoolSlug}>
          <Input
            value={schoolSlug}
            onChange={(event) => setSchoolSlug(event.target.value)}
            autoComplete="organization"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
      )}

      <Field label="Password" isRequired error={errors.password}>
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          enterKeyHint="go"
        />
      </Field>

      <Button type="submit" isLoading={login.isPending} fullWidth>
        Sign in
      </Button>
    </form>
  );
}
