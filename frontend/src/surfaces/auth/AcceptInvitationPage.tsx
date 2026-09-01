import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Field, Input } from '@/components/ui';
import { AuthCard } from '@/components/layout';
import { ErrorState } from '@/components/feedback';
import { authApi, homeSurfaceFor } from '@/auth';
import { useAuthStore } from '@/auth';
import { fieldErrorsOf, isValidationError } from '@/lib/form-errors';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { SURFACE_HOME } from '@/routes/paths';
import { PasswordRules } from './PasswordRules';
import { isPasswordAcceptable } from './password-policy';

/**
 * Where an invited user becomes a real one.
 *
 * The token arrives in the link (`?token=…`) and is never shown or editable — a
 * user who lands here without one is told to use their email link rather than
 * being handed a field they cannot fill in.
 *
 * Accepting signs them straight in, because making someone set a password and
 * then immediately type it again is friction with no security benefit.
 */
export function AcceptInvitationPage() {
  useDocumentTitle('Accept your invitation');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const accept = useMutation({
    mutationFn: () => authApi.acceptInvitation({ token, password }),
    onSuccess: (result) => {
      useAuthStore.setState({ status: 'unknown' });
      void useAuthStore.getState().bootstrap();
      navigate(SURFACE_HOME[homeSurfaceFor(result.user)], { replace: true });
    },
  });

  const errors = fieldErrorsOf(accept.error);
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = isPasswordAcceptable(password) && !mismatch;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) accept.mutate();
  };

  if (!token) {
    return (
      <AuthCard title="This link is incomplete">
        <Alert tone="warning" title="We could not read your invitation.">
          Open the link in your invitation email again, or ask the person who invited you to send a
          new one.
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set your password" description="One step and your account is ready.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {accept.error && !isValidationError(accept.error) ? (
          <ErrorState error={accept.error} />
        ) : null}

        <Field label="New password" isRequired error={errors.password}>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </Field>

        <PasswordRules value={password} />

        <Field
          label="Confirm password"
          isRequired
          error={mismatch ? 'These two do not match.' : undefined}
        >
          <Input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </Field>

        <Button type="submit" isLoading={accept.isPending} disabled={!canSubmit} fullWidth>
          Create my account
        </Button>
      </form>
    </AuthCard>
  );
}
