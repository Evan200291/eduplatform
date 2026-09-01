import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  IconAnalytics,
  IconDownload,
  IconStart,
  PageHeader,
  Pagination,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import {
  downloadReportExport,
  fetchReportDefinitions,
  fetchReportExportStatus,
  requestReportExport,
  runReport,
} from '@/reporting/reporting.api';
import type { ReportDefinition, ReportRunResult } from '@/reporting/reporting.types';

/** Sleeps, then polls the export row until it leaves QUEUED/RUNNING. */
async function waitForExport(exportId: string, attempts = 20): Promise<Awaited<ReturnType<typeof fetchReportExportStatus>>> {
  for (let i = 0; i < attempts; i += 1) {
    const job = await fetchReportExportStatus(exportId);
    if (job.status === 'READY' || job.status === 'FAILED' || job.status === 'EXPIRED') return job;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return fetchReportExportStatus(exportId);
}

/** The report catalogue: run a standard report, see the result, export it. */
export function AnalyticsPage() {
  useDocumentTitle('Analytics');
  const canExport = useCan('report.export');

  const [activeReport, setActiveReport] = useState<ReportDefinition | null>(null);
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: qk.reports.list({ page }),
    queryFn: () => fetchReportDefinitions({ page, pageSize: 10 }),
  });

  const run = useMutation({
    mutationFn: (definition: ReportDefinition) => runReport(definition.id),
    onSuccess: setResult,
  });

  const exportAndDownload = useMutation({
    mutationFn: async (definition: ReportDefinition) => {
      const queued = await requestReportExport({ definitionId: definition.id, format: 'CSV' });
      const finished = await waitForExport(queued.id);
      if (finished.status !== 'READY') {
        throw new Error(finished.failureReason ?? 'The export did not finish in time — try again shortly.');
      }
      const { blob, fileName } = await downloadReportExport(finished.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    },
  });

  const reports = query.data?.items ?? [];

  const columns: Column<ReportDefinition>[] = [
    {
      key: 'name',
      header: 'Report',
      render: (row) => (
        <div>
          <p className="text-ink">{row.name}</p>
          <p className="text-xs text-ink-muted">{row.description ?? row.key}</p>
        </div>
      ),
    },
    { key: 'scope', header: 'Scope', render: (row) => <Badge>{row.scopeLevel}</Badge> },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            leadingIcon={<IconStart aria-hidden className="h-4 w-4" />}
            isLoading={run.isPending && run.variables?.id === row.id}
            onClick={() => {
              setActiveReport(row);
              run.mutate(row);
            }}
          >
            Run
          </Button>
          {canExport ? (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<IconDownload aria-hidden className="h-4 w-4" />}
              isLoading={exportAndDownload.isPending && exportAndDownload.variables?.id === row.id}
              onClick={() => exportAndDownload.mutate(row)}
            >
              Export
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="Engagement, mastery and progress across the school, with exports."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Report catalogue"
            actions={
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
                <IconAnalytics aria-hidden className="h-4 w-4" />
              </span>
            }
          />
          <CardBody className="p-0">
            <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
              <DataTable
                caption="Standard reports"
                rows={reports}
                columns={columns}
                getRowKey={(row) => row.id}
                emptyState={
                  <EmptyState icon={<IconAnalytics className="h-8 w-8" aria-hidden />} title="No reports available" />
                }
              />
              {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
            </QueryBoundary>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={activeReport ? activeReport.name : 'Results'}
            description={result ? `${result.cohort.size} learner(s) · last ${result.window.days} days` : "Run a report to see its output here."}
          />
          <CardBody>
            {run.error ? <ErrorState error={run.error} /> : null}
            {exportAndDownload.error ? <ErrorState error={exportAndDownload.error} /> : null}
            {run.isPending ? <p className="text-sm text-ink-muted">Running…</p> : null}
            {result ? (
              result.rows.length === 0 ? (
                <EmptyState title="No data for this report yet" />
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-line bg-surface-sunken">
                          {result.columns.map((col) => (
                            <th key={col.key} className="px-3 py-2 font-medium text-ink-muted">
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.slice(0, 25).map((row, index) => (
                          <tr key={index} className="border-b border-line">
                            {result.columns.map((col) => (
                              <td key={col.key} className="px-3 py-2 text-ink">
                                {String(row[col.key] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-ink-muted">{result.measure.limitationNotes}</p>
                </div>
              )
            ) : (
              <p className="text-sm text-ink-muted">Pick a report and press Run.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
