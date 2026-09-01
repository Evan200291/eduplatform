import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader, Badge, PageHeader } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/hooks/use-document-title';

export interface PreviewStat {
  label: string;
  value: string;
  note?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export interface PreviewItem {
  label: string;
  detail?: string;
  badge?: string;
}

export interface PreviewSection {
  title: string;
  description?: string;
  items: readonly PreviewItem[];
}

export interface FeaturePreviewPageProps {
  title: string;
  description?: string;
  summary: string;
  eyebrow?: string;
  badge?: string;
  highlights?: readonly PreviewStat[];
  sections?: readonly PreviewSection[];
  footer?: ReactNode;
}

/**
 * A richer placeholder shell for screens that are routed but not fully built yet.
 *
 * It keeps the review experience honest: the route exists, the surface loads, and
 * the user can see the intended structure rather than a blank stub.
 */
export function FeaturePreviewPage({
  title,
  description,
  summary,
  eyebrow,
  badge,
  highlights = [],
  sections = [],
  footer,
}: FeaturePreviewPageProps) {
  useDocumentTitle(title);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        above={eyebrow ? <p className="text-xs font-semibold uppercase tracking-heading text-ink-muted">{eyebrow}</p> : null}
        title={title}
        description={description}
      />

      <Card className="bg-gradient-to-br from-surface to-surface-sunken">
        <CardBody className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            {badge ? <Badge tone="brand" className="mb-3">{badge}</Badge> : null}
            <p className="text-base text-ink-muted">{summary}</p>
          </div>
          {footer ? <div className="flex shrink-0 flex-wrap gap-2">{footer}</div> : null}
        </CardBody>
      </Card>

      {highlights.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {highlights.map((item) => (
            <Card key={item.label} className="border-line/80 shadow-sm">
              <CardBody className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-muted">{item.label}</p>
                  <Badge tone={item.tone ?? 'neutral'}>{item.value}</Badge>
                </div>
                {item.note ? <p className="text-sm text-ink-muted">{item.note}</p> : null}
              </CardBody>
            </Card>
          ))}
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div className={cn('grid gap-4', sections.length > 1 ? 'xl:grid-cols-2' : 'grid-cols-1')}>
          {sections.map((section) => (
            <Card key={section.title}>
              <CardHeader title={section.title} description={section.description} />
              <CardBody className="space-y-3">
                {section.items.map((item) => (
                  <div
                    key={`${section.title}:${item.label}`}
                    className="flex items-start justify-between gap-4 rounded-lg border border-line/70 bg-surface-sunken px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{item.label}</p>
                      {item.detail ? <p className="mt-1 text-sm text-ink-muted">{item.detail}</p> : null}
                    </div>
                    {item.badge ? <Badge tone="info">{item.badge}</Badge> : null}
                  </div>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
