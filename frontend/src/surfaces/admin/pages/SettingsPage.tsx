import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  IconSafety,
  IconSettings,
  Input,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime } from '@/lib/format';
import {
  fetchCurrentSchoolSettings,
  fetchSchoolSettings,
  updateCurrentSchoolSettings,
  updateSchoolSettings,
} from '@/tenancy/tenancy.api';
import {
  fetchRetentionOptions,
  fetchRetentionPolicies,
  pauseRetentionPolicy,
  resumeRetentionPolicy,
  runRetentionPolicyNow,
  upsertRetentionPolicy,
} from '@/privacy/privacy.api';
import type { RetentionAction, RetentionClassOption, RetentionPolicyRow } from '@/privacy/privacy.types';
import type { SchoolSettings } from '@/tenancy/tenancy.types';
import { AGE_MODE_LABELS } from '@/theme/age-mode';
import { AGE_MODES, type AgeMode } from '@/types/enums';
import type { PathMode } from '@/learning/learning.types';

const RETENTION_ACTION_LABEL: Record<RetentionAction, string> = {
  DELETE: 'Delete',
  ANONYMIZE: 'Anonymise',
  ARCHIVE: 'Archive',
};

/** PRD v2.5: the teacher is always the decision maker on a recommendation. */
const TEACHER_DECIDES = { recommendationApprovalRequired: true, recommendationAutoApproveHours: null } as const;

const PATH_MODES: PathMode[] =['GRADE_BASED', 'SUBJECT_BASED', 'TOPIC_BASED', 'HYBRID'];
const PATH_MODE_LABELS: Record<PathMode, string> = {
  GRADE_BASED: 'Grade-based',
  SUBJECT_BASED: 'Subject-based',
  TOPIC_BASED: 'Topic-based',
  HYBRID: 'Hybrid',
};

/** School settings: the policies that shape how learning, gamification and sign-in behave. */
export function SettingsPage() {
  useDocumentTitle('Settings');
  const canRead = useCan('school.settings.read');
  const canWrite = useCan('school.settings.write');
  const canReadRetention = useCan('retention.read');
  const canWriteRetention = useCan('retention.write');

  const query = useQuery({
    queryKey: qk.schoolSettings.current,
    queryFn: fetchCurrentSchoolSettings,
    enabled: canRead,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Your school's details, policies and data retention." />

      {canRead ? (
        <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
          {query.data ? <SettingsForm settings={query.data} canWrite={canWrite} /> : null}
        </QueryBoundary>
      ) : (
        <Card>
          <CardBody className="flex items-center gap-3">
            <IconSettings aria-hidden className="h-5 w-5 text-ink-muted" />
            <p className="text-sm text-ink-muted">You do not have access to school settings.</p>
          </CardBody>
        </Card>
      )}

      {canReadRetention ? <RetentionSection canWrite={canWriteRetention} /> : null}
    </div>
  );
}

/**
 * One school's settings as platform staff see them from the school's own page,
 * without switching into that school first. Same form, different routes.
 */
export function SchoolSettingsCard({ schoolId, canWrite }: { schoolId: string; canWrite: boolean }) {
  const query = useQuery({
    queryKey: qk.schoolSettings.detail(schoolId),
    queryFn: () => fetchSchoolSettings(schoolId),
  });
  return (
    <Card>
      <CardHeader title="Settings" description="This school's policies. Changes are audited against your name." />
      <CardBody>
        <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
          {query.data ? <SettingsForm settings={query.data} canWrite={canWrite} schoolId={schoolId} /> : null}
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}

function SettingsForm({
  settings,
  canWrite,
  schoolId,
}: {
  settings: SchoolSettings;
  canWrite: boolean;
  /** Set when editing a school other than the one signed in to. */
  schoolId?: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(settings);

  useEffect(() => setForm(settings), [settings]);

  const save = useMutation({
    mutationFn: (input: Partial<SchoolSettings>) =>
      schoolId ? updateSchoolSettings(schoolId, input) : updateCurrentSchoolSettings(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(schoolId ? qk.schoolSettings.detail(schoolId) : qk.schoolSettings.current, updated);
    },
  });

  const patch = (partial: Partial<SchoolSettings>) => setForm((prev) => ({ ...prev, ...partial }));
  const autoApproves = !settings.recommendationApprovalRequired || settings.recommendationAutoApproveHours !== null;

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ ...form, ...TEACHER_DECIDES });
      }}
    >
      {save.error ? <ErrorState error={save.error} /> : null}
      {save.isSuccess ? <Badge tone="success">Saved</Badge> : null}

      {autoApproves ? (
        <Alert tone="warning" title="Recommendations can be applied without a teacher">
          <p>
            {settings.recommendationApprovalRequired
              ? `A recommendation nobody decides on is applied automatically after ${settings.recommendationAutoApproveHours} hours.`
              : 'Recommendations are applied to learning paths straight away, without a teacher seeing them.'}{' '}
            PRD v2.5 says a teacher always decides.
          </p>
          {canWrite ? (
            <Button
              size="sm"
              className="mt-2"
              isLoading={save.isPending}
              onClick={() => save.mutate(TEACHER_DECIDES)}
            >
              Require a teacher&apos;s decision
            </Button>
          ) : null}
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Gamification" description="Points, badges, streaks and the leaderboard." />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Checkbox
            label="Points enabled"
            checked={form.pointsEnabled}
            disabled={!canWrite}
            onChange={(event) => patch({ pointsEnabled: event.target.checked })}
          />
          <Checkbox
            label="Badges enabled"
            checked={form.badgesEnabled}
            disabled={!canWrite}
            onChange={(event) => patch({ badgesEnabled: event.target.checked })}
          />
          <Checkbox
            label="Streaks enabled"
            checked={form.streaksEnabled}
            disabled={!canWrite}
            onChange={(event) => patch({ streaksEnabled: event.target.checked })}
          />
          <Checkbox
            label="Companion enabled"
            checked={form.companionEnabled}
            disabled={!canWrite}
            onChange={(event) => patch({ companionEnabled: event.target.checked })}
          />
          <Checkbox
            label="Missions enabled"
            checked={form.missionsEnabled}
            disabled={!canWrite}
            onChange={(event) => patch({ missionsEnabled: event.target.checked })}
          />
          <Checkbox
            label="Leaderboard enabled"
            checked={form.leaderboardEnabled}
            disabled={!canWrite}
            onChange={(event) => patch({ leaderboardEnabled: event.target.checked })}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Assessment" description="Screening and ongoing check policy." />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Checkbox
            label="Screening enabled"
            checked={form.screeningEnabled}
            disabled={!canWrite}
            onChange={(event) => patch({ screeningEnabled: event.target.checked })}
          />
          <Field label="Ongoing check frequency (days)">
            <Input
              type="number"
              min={1}
              disabled={!canWrite}
              value={form.ongoingCheckFrequencyDays}
              onChange={(event) => patch({ ongoingCheckFrequencyDays: Number(event.target.value) })}
            />
          </Field>
          {/*
            PRD v2.5: recommendations never auto-approve; a teacher always
            decides. The switch that allowed otherwise is gone, and saving
            this form always writes the teacher-decides values back.
          */}
          <p className="text-sm text-ink-muted sm:col-span-2">
            Learning-path recommendations always wait for a teacher to approve, change or reject them. Nothing is
            applied to a learner&apos;s path automatically.
          </p>
          <Checkbox
            label="Students may self-reassess"
            checked={form.allowStudentSelfReassess}
            disabled={!canWrite}
            onChange={(event) => patch({ allowStudentSelfReassess: event.target.checked })}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Assessment engine"
          description="Learning-path modes, evidence-confidence thresholds, retry limits by age and question selection."
        />
        <CardBody className="flex flex-col gap-5">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Allowed learning-path modes</p>
            <p className="mb-2 text-xs text-ink-muted">
              Leave every mode unchecked (or all checked) to permit all of them — this is the default.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PATH_MODES.map((mode) => {
                const current = form.allowedPathModes ?? [];
                const checked = current.length === 0 || current.includes(mode);
                return (
                  <Checkbox
                    key={mode}
                    label={PATH_MODE_LABELS[mode]}
                    checked={checked}
                    disabled={!canWrite}
                    onChange={(event) => {
                      const all = current.length === 0 ? [...PATH_MODES] : current;
                      const next = event.target.checked
                        ? [...new Set([...all, mode])]
                        : all.filter((value) => value !== mode);
                      // All four checked is equivalent to "unrestricted" (null).
                      patch({ allowedPathModes: next.length === PATH_MODES.length ? null : next });
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Moderate-confidence threshold (items considered)">
              <Input
                type="number"
                min={1}
                disabled={!canWrite}
                value={form.confidenceThresholdModerate}
                onChange={(event) => patch({ confidenceThresholdModerate: Number(event.target.value) })}
              />
            </Field>
            <Field label="High-confidence threshold (items considered)">
              <Input
                type="number"
                min={1}
                disabled={!canWrite}
                value={form.confidenceThresholdHigh}
                onChange={(event) => patch({ confidenceThresholdHigh: Number(event.target.value) })}
              />
            </Field>
          </div>

          <Checkbox
            label="Shuffle items by default on new assessments"
            checked={form.defaultShuffleItems}
            disabled={!canWrite}
            onChange={(event) => patch({ defaultShuffleItems: event.target.checked })}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Attempt limit by age (overrides an assessment's flat limit)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {AGE_MODES.map((mode: AgeMode) => {
                const map = form.attemptLimitByAgeMode ?? {};
                const raw = map[mode];
                return (
                  <Field key={mode} label={AGE_MODE_LABELS[mode]}>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Default"
                      disabled={!canWrite}
                      value={raw ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        const nextMap = { ...(form.attemptLimitByAgeMode ?? {}) };
                        if (value === '') {
                          delete nextMap[mode];
                        } else {
                          nextMap[mode] = Number(value);
                        }
                        patch({ attemptLimitByAgeMode: Object.keys(nextMap).length === 0 ? null : nextMap });
                      }}
                    />
                  </Field>
                );
              })}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sign-in and safety" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Checkbox
            label="Student PIN required"
            checked={form.studentPinRequired}
            disabled={!canWrite}
            onChange={(event) => patch({ studentPinRequired: event.target.checked })}
          />
          <Field
            label="Sign out after this many idle minutes"
            hint="Between 10 and 1440. People get a one-minute warning first."
          >
            <Input
              type="number"
              min={10}
              max={1440}
              disabled={!canWrite}
              value={form.sessionIdleMinutes}
              onChange={(event) => patch({ sessionIdleMinutes: Number(event.target.value) })}
            />
          </Field>
          <Checkbox
            label="Content reporting enabled"
            checked={form.contentReportingEnabled}
            disabled={!canWrite}
            onChange={(event) => patch({ contentReportingEnabled: event.target.checked })}
          />
          <Checkbox
            label="Moderation required"
            checked={form.moderationRequired}
            disabled={!canWrite}
            onChange={(event) => patch({ moderationRequired: event.target.checked })}
          />
          <Checkbox
            label="Parent portal enabled"
            checked={form.parentPortalEnabled}
            disabled={!canWrite}
            onChange={(event) => patch({ parentPortalEnabled: event.target.checked })}
          />
          <Field label="Data retention (months)">
            <Input
              type="number"
              min={1}
              disabled={!canWrite}
              value={form.dataRetentionMonths}
              onChange={(event) => patch({ dataRetentionMonths: Number(event.target.value) })}
            />
          </Field>
        </CardBody>
      </Card>

      {canWrite ? (
        <div className="flex justify-end">
          <Button type="submit" isLoading={save.isPending}>
            Save settings
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function RetentionSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ option: RetentionClassOption; existing: RetentionPolicyRow | null } | null>(
    null,
  );
  const [runResult, setRunResult] = useState<{ id: string; rowsAffected: number; skippedReason: string | null } | null>(
    null,
  );

  const query = useQuery({
    queryKey: qk.retention.list(),
    queryFn: () => fetchRetentionPolicies({ includePlatformDefaults: true }),
  });
  const optionsQuery = useQuery({
    queryKey: qk.retention.options,
    queryFn: fetchRetentionOptions,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.retention.list() });

  const toggleActive = useMutation({
    mutationFn: (policy: RetentionPolicyRow) =>
      policy.isActive ? pauseRetentionPolicy(policy.id) : resumeRetentionPolicy(policy.id),
    onSuccess: invalidate,
  });

  const runNow = useMutation({
    mutationFn: (id: string) => runRetentionPolicyNow(id),
    onSuccess: (outcome) => {
      setRunResult({ id: outcome.policyId, rowsAffected: outcome.rowsAffected, skippedReason: outcome.skippedReason });
      void invalidate();
    },
  });

  const policies = query.data?.items ?? [];
  const configuredClasses = new Set(policies.map((policy) => policy.dataClass));
  const unconfigured = (optionsQuery.data ?? []).filter((option) => !configuredClasses.has(option.dataClass));

  return (
    <Card>
      <CardHeader
        title="Data retention"
        description="How long each kind of data is kept, what happens to it once its clock runs out, and when that last ran."
      />
      <CardBody className="p-0">
        <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
          {policies.length === 0 && unconfigured.length === 0 ? (
            <div className="flex items-center gap-3 p-4 text-sm text-ink-muted">
              <IconSafety aria-hidden className="h-5 w-5" /> No retention policies configured — platform defaults apply.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {policies.map((policy) => {
                const option = (optionsQuery.data ?? []).find((o) => o.dataClass === policy.dataClass) ?? null;
                const outcome = runResult?.id === policy.id ? runResult : null;
                return (
                  <li key={policy.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{policy.handler.label ?? policy.dataClass}</p>
                        <p className="text-xs text-ink-muted">
                          {policy.retainMonths} months · {RETENTION_ACTION_LABEL[policy.action]}
                          {policy.notes ? ` · ${policy.notes}` : ''}
                        </p>
                        <p className="text-xs text-ink-muted">
                          Last ran {policy.lastRunAt ? formatDateTime(policy.lastRunAt) : 'never'}
                          {policy.lastRunRowCount !== null ? ` · ${policy.lastRunRowCount} rows` : ''}
                          {policy.nextRunAt ? ` · next ${formatDateTime(policy.nextRunAt)}` : ''}
                        </p>
                        {outcome ? (
                          <p className="text-xs text-success-strong">
                            {outcome.skippedReason
                              ? `Skipped: ${outcome.skippedReason}`
                              : `Ran just now — ${outcome.rowsAffected} row(s) affected.`}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={policy.isActive ? 'success' : 'neutral'}>
                          {policy.isActive ? 'Active' : 'Paused'}
                        </Badge>
                        {canWrite ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              isLoading={runNow.isPending && runNow.variables === policy.id}
                              onClick={() => runNow.mutate(policy.id)}
                            >
                              Run now
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              isLoading={toggleActive.isPending && toggleActive.variables?.id === policy.id}
                              onClick={() => toggleActive.mutate(policy)}
                            >
                              {policy.isActive ? 'Pause' : 'Resume'}
                            </Button>
                            {option ? (
                              <Button size="sm" variant="ghost" onClick={() => setEditing({ option, existing: policy })}>
                                Edit
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                    {(runNow.error && runNow.variables === policy.id) ||
                    (toggleActive.error && toggleActive.variables?.id === policy.id) ? (
                      <ErrorState error={runNow.error ?? toggleActive.error} />
                    ) : null}
                  </li>
                );
              })}
              {unconfigured.map((option) => (
                <li key={option.dataClass} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">{option.label}</p>
                    <p className="text-xs text-ink-muted">{option.description}</p>
                    <p className="text-xs text-ink-muted">
                      Platform default: {option.defaultRetainMonths} months ·{' '}
                      {RETENTION_ACTION_LABEL[option.defaultAction]}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="neutral">Platform default</Badge>
                    {canWrite ? (
                      <Button size="sm" variant="outline" onClick={() => setEditing({ option, existing: null })}>
                        Configure for this school
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </CardBody>
      {editing ? (
        <RetentionPolicyModal
          option={editing.option}
          existing={editing.existing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void invalidate();
          }}
        />
      ) : null}
    </Card>
  );
}

function RetentionPolicyModal({
  option,
  existing,
  onClose,
  onSaved,
}: {
  option: RetentionClassOption;
  existing: RetentionPolicyRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [retainMonths, setRetainMonths] = useState(existing?.retainMonths ?? option.defaultRetainMonths);
  const [action, setAction] = useState<RetentionAction>(existing?.action ?? option.defaultAction);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const save = useMutation({
    mutationFn: () =>
      upsertRetentionPolicy({
        dataClass: option.dataClass,
        retainMonths,
        action,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal isOpen onClose={onClose} title={`Retention — ${option.label}`}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {save.error ? <ErrorState error={save.error} /> : null}
        <p className="text-sm text-ink-muted">{option.description}</p>
        <Field label="Keep for (months)" isRequired>
          <Input
            type="number"
            min={1}
            required
            value={retainMonths}
            onChange={(event) => setRetainMonths(Number(event.target.value))}
          />
        </Field>
        <Field label="When the clock runs out" isRequired>
          <Select
            required
            value={action}
            onChange={(event) => setAction(event.target.value as RetentionAction)}
            options={option.supports.map((supported) => ({
              value: supported,
              label: RETENTION_ACTION_LABEL[supported],
            }))}
          />
        </Field>
        <Field label="Notes">
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
