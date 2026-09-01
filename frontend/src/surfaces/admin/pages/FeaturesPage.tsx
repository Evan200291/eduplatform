import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconFeatures,
  IconGamification,
  IconLesson,
  IconSafety,
  IconSupport,
  PageHeader,
  Select,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan, useProfile } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { fetchFeatureCatalogue, setEntitlement } from '@/entitlements/entitlements.api';
import type { CatalogueEntry, EntitlementScopeType, FeatureCategory } from '@/entitlements/entitlements.types';
import { fetchClasses, fetchGrades, fetchSubjects } from '@/academic/academic.api';
import { ROLE_KEYS, type RoleKey } from '@/types/enums';

/** Scopes a school-level admin can target from this screen. Platform-owned
 * scopes (PLATFORM/PLAN/ORGANIZATION) are gated separately below. */
const SCHOOL_SCOPES: EntitlementScopeType[] = ['SCHOOL', 'ROLE', 'GRADE', 'CLASS', 'SUBJECT'];
const PLATFORM_SCOPES: EntitlementScopeType[] = ['PLATFORM', 'PLAN', 'ORGANIZATION'];

const SCOPE_LABEL: Record<EntitlementScopeType, string> = {
  PLATFORM: 'Platform (everyone)',
  PLAN: 'Plan',
  ORGANIZATION: 'Organization',
  SCHOOL: 'This school',
  ROLE: 'A role',
  GRADE: 'A grade',
  CLASS: 'A class',
  SUBJECT: 'A subject',
  USER_GROUP: 'A user group',
};

const ROLE_LABEL: Record<RoleKey, string> = {
  PLATFORM_OWNER: 'Platform owner',
  PLATFORM_OPS_ADMIN: 'Platform ops admin',
  SCHOOL_ADMIN: 'School admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
  CURRICULUM_MANAGER: 'Curriculum manager',
  CONTENT_REVIEWER: 'Content reviewer',
  BILLING_ADMIN: 'Billing admin',
  SUPPORT_AGENT: 'Support agent',
  REPORT_VIEWER: 'Report viewer',
};

const CATEGORY_ICON: Record<FeatureCategory, typeof IconFeatures> = {
  learning: IconLesson,
  assessment: IconLesson,
  gamification: IconGamification,
  communication: IconSupport,
  reporting: IconFeatures,
  administration: IconFeatures,
  safety: IconSafety,
  commercial: IconFeatures,
};

const CATEGORY_LABEL: Record<FeatureCategory, string> = {
  learning: 'Learning',
  assessment: 'Assessment',
  gamification: 'Gamification',
  communication: 'Communication',
  reporting: 'Reporting',
  administration: 'Administration',
  safety: 'Safety',
  commercial: 'Commercial',
};

/** What is switched on for this school — the entitlement catalogue, toggle-able where allowed. */
export function FeaturesPage() {
  useDocumentTitle('Features');
  const queryClient = useQueryClient();
  const canWrite = useCan('entitlement.write');
  const isPlatformStaff = Boolean(useProfile()?.isPlatformStaff);
  const [category, setCategory] = useState<FeatureCategory | ''>('');

  const availableScopes = useMemo(
    () => (isPlatformStaff ? [...SCHOOL_SCOPES, ...PLATFORM_SCOPES] : SCHOOL_SCOPES),
    [isPlatformStaff],
  );

  // What the next toggle should target. Defaults to SCHOOL, the old behaviour.
  const [scopeType, setScopeType] = useState<EntitlementScopeType>('SCHOOL');
  const [roleKey, setRoleKey] = useState<RoleKey | ''>('');
  const [gradeId, setGradeId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const gradesQuery = useQuery({
    queryKey: qk.grades.list(),
    queryFn: () => fetchGrades(),
    enabled: scopeType === 'GRADE',
  });
  const classesQuery = useQuery({
    queryKey: qk.classes.list(),
    queryFn: () => fetchClasses(),
    enabled: scopeType === 'CLASS',
  });
  const subjectsQuery = useQuery({
    queryKey: qk.subjects.list(),
    queryFn: () => fetchSubjects(),
    enabled: scopeType === 'SUBJECT',
  });

  const query = useQuery({
    queryKey: qk.entitlements.catalogue({ category: category || undefined }),
    queryFn: () => fetchFeatureCatalogue(category ? { category } : undefined),
  });

  /** Whether the current scope selection has everything it needs to save. */
  const scopeReady =
    scopeType === 'SCHOOL' ||
    scopeType === 'PLATFORM' ||
    (scopeType === 'ROLE' && roleKey !== '') ||
    (scopeType === 'GRADE' && gradeId !== '') ||
    (scopeType === 'CLASS' && classId !== '') ||
    (scopeType === 'SUBJECT' && subjectId !== '');

  const toggle = useMutation({
    mutationFn: (input: { entry: CatalogueEntry; enabled: boolean }) =>
      setEntitlement({
        featureKey: input.entry.key,
        scopeType,
        enabled: input.enabled,
        reason: 'Toggled from the admin panel',
        ...(scopeType === 'ROLE' ? { roleKey: roleKey || undefined } : {}),
        ...(scopeType === 'GRADE' ? { gradeId: gradeId || undefined } : {}),
        ...(scopeType === 'CLASS' ? { classId: classId || undefined } : {}),
        ...(scopeType === 'SUBJECT' ? { subjectId: subjectId || undefined } : {}),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['entitlements'] }),
  });

  const features = query.data?.features ?? [];
  const enabledCount = features.filter((f) => f.enabled).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Features"
        description="What your school uses — and, if you can, switch it on or off."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Available" value={features.length} tone="brand" icon={IconFeatures} />
        <StatTile label="Enabled" value={enabledCount} tone="success" icon={IconFeatures} />
        <StatTile
          label="Safety rules"
          value={features.filter((f) => f.isSafetyRule).length}
          tone="warning"
          icon={IconSafety}
        />
        <StatTile
          label="Overridden here"
          value={features.filter((f) => f.schoolRule).length}
          tone="info"
          icon={IconFeatures}
        />
      </div>

      {canWrite ? (
        <Card>
          <CardHeader title="Toggle scope" description="Choose what a toggle below applies to." />
          <CardBody className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-ink-muted" htmlFor="entitlement-scope-type">
                Apply toggles to
              </label>
              <Select
                id="entitlement-scope-type"
                className="min-w-[10rem]"
                value={scopeType}
                onChange={(event) => {
                  setScopeType(event.target.value as EntitlementScopeType);
                  setRoleKey('');
                  setGradeId('');
                  setClassId('');
                  setSubjectId('');
                }}
                options={availableScopes.map((value) => ({ value, label: SCOPE_LABEL[value] }))}
              />
            </div>
            {scopeType === 'ROLE' ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted" htmlFor="entitlement-scope-role">
                  Role
                </label>
                <Select
                  id="entitlement-scope-role"
                  className="min-w-[10rem]"
                  value={roleKey}
                  onChange={(event) => setRoleKey(event.target.value as RoleKey)}
                  placeholder="Choose a role"
                  options={ROLE_KEYS.map((value) => ({ value, label: ROLE_LABEL[value] }))}
                />
              </div>
            ) : null}
            {scopeType === 'GRADE' ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted" htmlFor="entitlement-scope-grade">
                  Grade
                </label>
                <Select
                  id="entitlement-scope-grade"
                  className="min-w-[10rem]"
                  value={gradeId}
                  onChange={(event) => setGradeId(event.target.value)}
                  placeholder="Choose a grade"
                  options={(gradesQuery.data?.items ?? []).map((grade) => ({ value: grade.id, label: grade.name }))}
                />
              </div>
            ) : null}
            {scopeType === 'CLASS' ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted" htmlFor="entitlement-scope-class">
                  Class
                </label>
                <Select
                  id="entitlement-scope-class"
                  className="min-w-[10rem]"
                  value={classId}
                  onChange={(event) => setClassId(event.target.value)}
                  placeholder="Choose a class"
                  options={(classesQuery.data?.items ?? []).map((cls) => ({ value: cls.id, label: cls.name }))}
                />
              </div>
            ) : null}
            {scopeType === 'SUBJECT' ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted" htmlFor="entitlement-scope-subject">
                  Subject
                </label>
                <Select
                  id="entitlement-scope-subject"
                  className="min-w-[10rem]"
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                  placeholder="Choose a subject"
                  options={(subjectsQuery.data?.items ?? []).map((subject) => ({
                    value: subject.id,
                    label: subject.name,
                  }))}
                />
              </div>
            ) : null}
            {!scopeReady ? (
              <p className="pb-2 text-xs text-warning-strong">Pick a target before toggling a feature below.</p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Feature catalogue"
          actions={
            <Select
              aria-label="Filter by category"
              className="max-w-[12rem]"
              value={category}
              onChange={(event) => setCategory(event.target.value as FeatureCategory | '')}
              options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))}
              placeholder="All categories"
            />
          }
        />
        <CardBody className="p-0">
          {toggle.error ? <ErrorState error={toggle.error} className="m-4" /> : null}
          <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
            {features.length === 0 ? (
              <EmptyState icon={<IconFeatures className="h-8 w-8" aria-hidden />} title="No features match" className="p-8" />
            ) : (
              <ul className="divide-y divide-line">
                {features.map((feature) => {
                  const Icon = CATEGORY_ICON[feature.category] ?? IconFeatures;
                  return (
                    <li key={feature.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-secondary-strong">
                          <Icon aria-hidden className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-ink">{feature.name}</p>
                            {feature.isSafetyRule ? <Badge tone="warning">Safety</Badge> : null}
                            <Badge tone={feature.enabled ? 'success' : 'neutral'}>
                              {feature.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </div>
                          <p className="text-sm text-ink-muted">{feature.description}</p>
                          <p className="text-xs text-ink-muted">Decided by {feature.decidedBy} · {feature.reason}</p>
                        </div>
                      </div>
                      {canWrite && feature.configurableScopes.includes(scopeType) && !feature.isSafetyRule ? (
                        <Button
                          size="sm"
                          variant={feature.enabled ? 'outline' : 'primary'}
                          disabled={!scopeReady}
                          isLoading={toggle.isPending && toggle.variables?.entry.key === feature.key}
                          onClick={() => toggle.mutate({ entry: feature, enabled: !feature.enabled })}
                        >
                          {feature.enabled ? 'Turn off' : 'Turn on'} ({SCOPE_LABEL[scopeType]})
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryBoundary>
        </CardBody>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof IconFeatures;
  tone: BadgeTone;
}) {
  const toneClasses: Record<BadgeTone, string> = {
    neutral: 'bg-surface-sunken text-ink-muted',
    info: 'bg-secondary-soft text-secondary-strong',
    success: 'bg-success-soft text-success-strong',
    warning: 'bg-warning-soft text-warning-strong',
    danger: 'bg-danger-soft text-danger-strong',
    brand: 'bg-primary-soft text-primary-strong',
  };
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneClasses[tone]}`}>
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-semibold text-ink tabular-nums">{value}</p>
          <p className="text-xs text-ink-muted">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}
