import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  IconDownload,
  IconReports,
  IconStart,
  PageHeader,
  Pagination,
  Select,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { downloadReportExport, fetchReportDefinitions, requestReportExport, runReport } from '@/reporting/reporting.api';
import { fetchClassRoster, fetchMyClasses } from '@/academic/academic.api';
import type { ReportDefinition, ReportRunResult } from '@/reporting/reporting.types';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize } from '../lib/humanize';

const SCOPE_TONE = {
  STUDENT: 'info',
  CLASS: 'brand',
  GRADE: 'warning',
  SUBJECT: 'success',
  SCHOOL: 'neutral',
} as const;

/** Runs the platform's built-in reports, scoped to the teacher's own classes, and exports them. */
export function TeacherReportsPage() {
  useDocumentTitle('Reports');
  const canSeeSchool = useCan('report.read.school');
  const canExport = useCan('report.export');

  const [definitionsPage, setDefinitionsPage] = useState(1);
  const definitionsQuery = useQuery({
    queryKey: qk.reports.list({ includeSystem: true, page: definitionsPage, pageSize: 10 }),
    queryFn: () =>
      fetchReportDefinitions({ includeSystem: true, page: definitionsPage, pageSize: 10 }),
  });
  const classesQuery = useQuery({ queryKey: qk.classes.mine, queryFn: fetchMyClasses });

  const reports = (definitionsQuery.data?.items ?? []).filter(
    (report) => canSeeSchool || report.scopeLevel !== 'SCHOOL',
  );

  const [selectedId, setSelectedId] = useState('');
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');

  const selected = reports.find((report) => report.id === selectedId) ?? null;

  const rosterQuery = useQuery({
    queryKey: qk.classes.roster(classId),
    queryFn: () => fetchClassRoster(classId),
    enabled: Boolean(classId) && selected?.scopeLevel === 'STUDENT',
  });

  const runQuery = useQuery({
    queryKey: qk.reports.run(selectedId, { classId, studentId }),
    queryFn: () => runReport(selectedId, { classId: classId || undefined, studentId: studentId || undefined }),
    enabled: false,
  });

  const exportMutation = useMutation({
    mutationFn: async (format: 'CSV' | 'XLSX' | 'PDF') =>
      requestReportExport({
        definitionId: selectedId,
        format,
        classId: classId || undefined,
        studentId: studentId || undefined,
      }),
  });

  const downloadMutation = useMutation({
    mutationFn: async (exportId: string) => {
      const { blob, fileName } = await downloadReportExport(exportId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    },
  });

  const canRun =
    Boolean(selectedId) &&
    (selected?.scopeLevel !== 'CLASS' || Boolean(classId)) &&
    (selected?.scopeLevel !== 'STUDENT' || Boolean(studentId));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="Progress across your classes — run a standard report, then export it for a parent or staff review."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader title="Choose a report" />
          <CardBody className="p-0">
            <QueryBoundary
              isLoading={definitionsQuery.isPending}
              error={definitionsQuery.error}
              onRetry={() => void definitionsQuery.refetch()}
              isEmpty={reports.length === 0}
              emptyState={<EmptyState title="No reports available" className="border-none py-6" />}
            >
              <ul className="divide-y divide-line">
                {reports.map((report) => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    isSelected={report.id === selectedId}
                    onSelect={() => {
                      setSelectedId(report.id);
                      setStudentId('');
                    }}
                  />
                ))}
              </ul>
              {definitionsQuery.data ? (
                <Pagination meta={definitionsQuery.data.meta} onPageChange={setDefinitionsPage} />
              ) : null}
            </QueryBoundary>
          </CardBody>
        </Card>

        <div className="flex flex-col gap-6">
          {selected ? (
            <Card>
              <CardHeader title={selected.name} description={selected.description} />
              <CardBody className="flex flex-col gap-4">
                <p className="text-xs text-ink-muted">
                  <span className="font-medium text-ink">Measures:</span> {selected.measureNotes}
                </p>
                <p className="text-xs text-ink-muted">
                  <span className="font-medium text-ink">Limitations:</span> {selected.limitationNotes}
                </p>

                <div className="flex flex-wrap items-end gap-3">
                  {selected.scopeLevel === 'CLASS' || selected.scopeLevel === 'STUDENT' ? (
                    <Field label="Class" className="w-56" isRequired>
                      <Select
                        placeholder="Choose a class"
                        options={(classesQuery.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
                        value={classId}
                        onChange={(event) => {
                          setClassId(event.target.value);
                          setStudentId('');
                        }}
                      />
                    </Field>
                  ) : null}

                  {selected.scopeLevel === 'STUDENT' ? (
                    <Field label="Student" className="w-56" isRequired hint={!classId ? 'Choose a class first.' : undefined}>
                      <Select
                        placeholder="Choose a student"
                        options={(rosterQuery.data ?? []).map((s) => ({ value: s.user.id, label: s.user.displayName }))}
                        value={studentId}
                        onChange={(event) => setStudentId(event.target.value)}
                        disabled={!classId}
                      />
                    </Field>
                  ) : null}

                  <Button
                    leadingIcon={<IconStart aria-hidden className="h-4 w-4" />}
                    onClick={() => void runQuery.refetch()}
                    isLoading={runQuery.isFetching}
                    disabled={!canRun}
                  >
                    Run report
                  </Button>

                  {canExport ? (
                    <>
                      <Button
                        variant="outline"
                        leadingIcon={<IconDownload aria-hidden className="h-4 w-4" />}
                        onClick={() => exportMutation.mutate('CSV')}
                        isLoading={exportMutation.isPending}
                        disabled={!canRun}
                      >
                        Export CSV
                      </Button>
                      <Button
                        variant="outline"
                        leadingIcon={<IconDownload aria-hidden className="h-4 w-4" />}
                        onClick={() => exportMutation.mutate('PDF')}
                        isLoading={exportMutation.isPending}
                        disabled={!canRun}
                      >
                        Export PDF
                      </Button>
                    </>
                  ) : null}
                </div>

                {exportMutation.error ? <ErrorState error={exportMutation.error} /> : null}
                {exportMutation.data ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-sunken p-3 text-sm">
                    <span className="text-ink">
                      {exportMutation.data.format} export {humanize(exportMutation.data.status)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => downloadMutation.mutate(exportMutation.data!.id)}
                      isLoading={downloadMutation.isPending}
                      disabled={exportMutation.data.status !== 'READY'}
                    >
                      {exportMutation.data.status === 'READY' ? 'Download' : 'Preparing…'}
                    </Button>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<IconReports className="h-8 w-8" />}
                  title="Pick a report"
                  description="Choose one from the list to run it for your classes."
                  className="border-none py-6"
                />
              </CardBody>
            </Card>
          )}

          {runQuery.data ? <ReportResultTable result={runQuery.data} /> : null}
          {runQuery.error ? <ErrorState error={runQuery.error} /> : null}
        </div>
      </div>
    </div>
  );
}

function ReportRow({
  report,
  isSelected,
  onSelect,
}: {
  report: ReportDefinition;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full flex-col gap-1 px-4 py-3 text-left text-sm transition hover:bg-surface-sunken ${
          isSelected ? 'bg-primary-soft' : ''
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={isSelected ? 'font-medium text-primary-strong' : 'text-ink'}>{report.name}</span>
          <Badge tone={SCOPE_TONE[report.scopeLevel]}>{humanize(report.scopeLevel)}</Badge>
        </span>
        <span className="line-clamp-2 text-xs text-ink-muted">{report.description}</span>
      </button>
    </li>
  );
}

function ReportResultTable({ result }: { result: ReportRunResult }) {
  const columns: Column<Record<string, unknown>>[] = useMemo(
    () =>
      result.columns.map((col) => ({
        key: col.key,
        header: col.label,
        isNumeric: col.type === 'number' || col.type === 'percent',
        render: (row) => formatCell(row[col.key], col.type),
      })),
    [result.columns],
  );

  return (
    <Card>
      <CardHeader
        title="Results"
        description={`${result.cohort.size} learner(s) · ${result.window.days} day window · generated ${new Date(result.generatedAt).toLocaleString()}`}
      />
      <CardBody className="p-0">
        <QueryBoundary
          isLoading={false}
          error={null}
          isEmpty={result.rows.length === 0}
          emptyState={<EmptyState title="No rows for this scope" className="border-none py-6" />}
        >
          <DataTable
            caption="Report results"
            rows={result.rows}
            columns={columns}
            getRowKey={(row) => String(row.id ?? row.learner ?? row.className ?? JSON.stringify(row))}
          />
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}

function formatCell(value: unknown, type: 'text' | 'number' | 'percent' | 'date'): string {
  if (value === null || value === undefined) return '—';
  if (type === 'percent') return `${value}%`;
  if (type === 'date') return new Date(String(value)).toLocaleDateString();
  return String(value);
}
