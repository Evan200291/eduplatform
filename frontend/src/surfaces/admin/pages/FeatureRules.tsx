import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Modal, Pagination, Select } from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { deleteEntitlement, explainFeatures, fetchEntitlements } from '@/entitlements/entitlements.api';
import type { EntitlementRow, FeatureExplanation } from '@/entitlements/entitlements.types';
import { fetchClasses, fetchGrades, fetchSubjects } from '@/academic/academic.api';
import { ROLE_KEYS, type RoleKey } from '@/types/enums';
import { formatDate } from '@/lib/format';
import { qk } from '@/query/keys';

/**
 * Two questions the toggles above cannot answer on their own.
 *
 * "Which rules have we actually set?" — every entitlement row that applies to
 * this school, including the class- and role-level ones that are otherwise
 * invisible, each removable.
 *
 * "What would this person see?" — blueprint 06's explain: pick a role and,
 * optionally, a class, year group or subject, and the resolver says for every
 * feature whether it is on and which rule decided it.
 */

function scopeTarget(row: EntitlementRow): string {
  switch (row.scopeType) {
    case 'ROLE':
      return row.roleKey ?? '';
    case 'PLAN':
      return row.plan ?? '';
    default:
      return '';
  }
}

export function EntitlementRulesCard({ canWrite }: { canWrite: boolean }) {
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState<EntitlementRow | null>(null);
  const params = { page, pageSize: 15, includeInherited: false };
  const query = useQuery({ queryKey: qk.entitlements.list(params), queryFn: () => fetchEntitlements(params) });
  const rows = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Rules set for this school"
        description="Every switch someone has set here, at any level. Removing one returns that level to what it inherits."
      />
      <CardBody>
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="No rules set" description="Everything follows the plan and platform defaults." />}
        >
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-ink">
                    <code className="text-xs">{row.featureKey}</code>
                    <Badge tone={row.enabled ? 'success' : 'neutral'}>{row.enabled ? 'On' : 'Off'}</Badge>
                    <span className="text-ink-muted">
                      for {row.scopeType.toLowerCase().replace('_', ' ')} {scopeTarget(row)}
                    </span>
                    {row.isSafetyRule ? <Badge tone="warning">Safety rule</Badge> : null}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Set {formatDate(row.createdAt)}
                    {row.reason ? ` · ${row.reason}` : ''}
                    {row.effectiveTo ? ` · until ${formatDate(row.effectiveTo)}` : ''}
                  </p>
                </div>
                {canWrite && !row.isSafetyRule ? (
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(row)}>
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} className="px-0" /> : null}
        </QueryBoundary>
      </CardBody>
      {removing ? <RemoveRuleModal row={removing} onClose={() => setRemoving(null)} /> : null}
    </Card>
  );
}

function RemoveRuleModal({ row, onClose }: { row: EntitlementRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteEntitlement(row.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['entitlements'] });
      onClose();
    },
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Remove this rule?"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Keep it
          </Button>
          <Button variant="danger" isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
            Remove
          </Button>
        </>
      }
    >
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      <p className="text-ink">
        <code className="text-sm">{row.featureKey}</code> at {row.scopeType.toLowerCase()} level goes back to whatever the
        level above decides.
      </p>
    </Modal>
  );
}

export function ExplainCard() {
  const [roleKey, setRoleKey] = useState<RoleKey>('STUDENT');
  const [classId, setClassId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const classes = useQuery({ queryKey: qk.classes.list(), queryFn: () => fetchClasses() });
  const grades = useQuery({ queryKey: qk.grades.list(), queryFn: () => fetchGrades() });
  const subjects = useQuery({ queryKey: qk.subjects.list(), queryFn: () => fetchSubjects() });

  const explain = useMutation({
    mutationFn: () =>
      explainFeatures({
        roleKey,
        ...(classId ? { classId } : {}),
        ...(gradeId ? { gradeId } : {}),
        ...(subjectId ? { subjectId } : {}),
      }),
  });
  const features: FeatureExplanation[] = explain.data?.features ?? [];

  return (
    <Card>
      <CardHeader
        title="What would someone see?"
        description="Pick who, and the resolver shows every feature and the rule that decided it."
      />
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Role">
            <Select
              value={roleKey}
              onChange={(event) => setRoleKey(event.target.value as RoleKey)}
              options={ROLE_KEYS.map((key) => ({ value: key, label: key.toLowerCase().replace(/_/g, ' ') }))}
            />
          </Field>
          <Field label="Class" hint="Optional.">
            <Select
              value={classId}
              placeholder="Any"
              onChange={(event) => setClassId(event.target.value)}
              options={(classes.data?.items ?? []).map((row) => ({ value: row.id, label: row.name }))}
            />
          </Field>
          <Field label="Year group" hint="Optional.">
            <Select
              value={gradeId}
              placeholder="Any"
              onChange={(event) => setGradeId(event.target.value)}
              options={(grades.data?.items ?? []).map((row) => ({ value: row.id, label: row.name }))}
            />
          </Field>
          <Field label="Subject" hint="Optional.">
            <Select
              value={subjectId}
              placeholder="Any"
              onChange={(event) => setSubjectId(event.target.value)}
              options={(subjects.data?.items ?? []).map((row) => ({ value: row.id, label: row.name }))}
            />
          </Field>
        </div>
        <div>
          <Button isLoading={explain.isPending} onClick={() => explain.mutate()}>
            Explain
          </Button>
        </div>
        {explain.error ? <ErrorState error={explain.error} /> : null}
        {explain.isSuccess && features.length === 0 ? <EmptyState title="No features to explain" /> : null}
        {features.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line">
            {features.map((feature) => (
              <li key={feature.key} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-ink">{feature.name}</p>
                  <p className="text-xs text-ink-muted">
                    Decided by {feature.decidedBy.toLowerCase().replace(/_/g, ' ')}: {feature.reason}
                  </p>
                </div>
                <Badge tone={feature.enabled ? 'success' : 'neutral'}>{feature.enabled ? 'On' : 'Off'}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}
