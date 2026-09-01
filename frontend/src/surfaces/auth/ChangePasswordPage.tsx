import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Field, Input } from '@/components/ui';
import { AuthCard } from '@/components/layout';
import { ErrorState } from '@/components/feedback';
import { authApi, useProfile } from '@/auth';
import { fieldErrorsOf, isValidationError } from '@/lib/form-errors';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { paths } from '@/routes/paths';
import { PasswordRules } from './PasswordRules';
import { isPasswordAcceptable } from './password-policy';

/**
 * Changing a password, and the forced version of it.
 *
 * A user whose account is flagged `mustChangePassword` — typically after an admin
 * reset — is routed here by `RequireAuth` and cannot navigate away, so this screen
 * explains why instead of looking like a dead end.
 *
 * The backend revokes the refresh cookie on success, which is correct and means
 * the only honest thing to do afterwards is send them to sign in again.
 */
export function ChangePasswordPage() {
  useDocumentTitle('Change password');
  const profile = useProfile();
  const navigate = useNavigate();
  const isForced = profile?.mustChangePassword ?? false;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const change = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => navigate(paths.login, { replace: true }),
  });

  const errors = fieldErrorsOf(change.error);
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  const isReused = newPassword.length > 0 && newPassword === currentPassword;
  const canSubmit =
    currentPassword.length > 0 && isPasswordAcceptable(newPassword) && !mismatch && !isReused;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) change.mutate();
  };

  return (
    <AuthCard
      title={isForced ? 'Choose a new password' : 'Change your password'}
      description={
        isForced
          ? 'Your password was reset, so you need a new one before you carry on.'
          : undefined
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {change.error && !isValidationError(change.error) ? (
          <ErrorState error={change.error} />
        ) : null}

        <Alert tone="info">You will be asked to sign in again with the new password.</Alert>

        <Field label="Current password" isRequired error={errors.currentPassword}>
          <Input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </Field>

        <Field
          label="New password"
          isRequired
          error={errors.newPassword ?? (isReused ? 'Pick something different from the old one.' : undefined)}
        >
          <Input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
          />
        </Field>

        <PasswordRules value={newPassword} />

        <Field
          label="Confirm new password"
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

        <Button type="submit" isLoading={change.isPending} disabled={!canSubmit} fullWidth>
          Save new password
        </Button>
      </form>
    </AuthCard>
  );
}
