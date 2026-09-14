import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  IconCheck,
  IconNotifications,
  PageHeader,
  Pagination,
  Select,
  type SelectOption,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import {
  dismissNotification,
  dismissNotifications,
  fetchNotificationPreferences,
  fetchNotificationSummary,
  fetchNotifications,
  markNotificationActioned,
  markNotificationRead,
  markNotificationsRead,
  updateNotificationPreferences,
} from '@/notifications/notifications.api';
import type { NotificationRecord, NotificationState } from '@/notifications/notifications.types';
import { qk } from '@/query/keys';
import { formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize, toneFor } from '../lib/humanize';
import { useCan } from '@/auth';
import { ComposeMessageModal } from '@/notifications/ComposeMessage';

const PRIORITY_TONE = { LOW: 'neutral', NORMAL: 'info', HIGH: 'warning', URGENT: 'danger' } as const;

const STATE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All' },
  { value: 'DELIVERED', label: 'Unread' },
  { value: 'READ', label: 'Read' },
  { value: 'ACTIONED', label: 'Actioned' },
];

/** Announcements and alerts: what came in, and how the teacher wants to hear about it. */
export function TeacherNotificationsPage() {
  useDocumentTitle('Messages');
  const queryClient = useQueryClient();
  const [state, setState] = useState<NotificationState | ''>('');
  const [showPreferences, setShowPreferences] = useState(false);
  const canSend = useCan('notification.send');
  const canBroadcast = useCan('notification.broadcast');
  const [composing, setComposing] = useState<'direct' | 'broadcast' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const listQuery = useQuery({
    queryKey: qk.notifications.list({ state: state || undefined, page, pageSize: 20 }),
    queryFn: () => fetchNotifications({ state: state || undefined, page, pageSize: 20 }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.notifications.all });
  };

  const markAllRead = useMutation({
    mutationFn: () => markNotificationsRead({ all: true }),
    onSuccess: invalidate,
  });

  /** Across the whole inbox, not just this page, so "Mark all read" is never wrongly greyed out. */
  const summary = useQuery({ queryKey: qk.notifications.summary, queryFn: fetchNotificationSummary });

  const rows = listQuery.data?.items ?? [];
  const unreadCount = summary.data?.unread ?? rows.filter((row) => row.state === 'DELIVERED' || row.state === 'PENDING').length;
  const readIds = rows.filter((row) => row.state === 'READ' || row.state === 'ACTIONED').map((row) => row.id);

  /** Clears only messages already read on this page, so nothing unseen disappears. */
  const clearRead = useMutation({
    mutationFn: () => dismissNotifications({ ids: readIds }),
    onSuccess: invalidate,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Messages"
        description="Notices from your school, and alerts about students who are stuck or waiting on a decision."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canSend ? (
              <Button size="sm" onClick={() => setComposing('direct')}>
                Send a message
              </Button>
            ) : null}
            {canBroadcast ? (
              <Button size="sm" variant="outline" onClick={() => setComposing('broadcast')}>
                Announce
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              isLoading={markAllRead.isPending}
              disabled={unreadCount === 0}
            >
              Mark all read{unreadCount > 0 ? ` (${unreadCount})` : ''}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearRead.mutate()}
              isLoading={clearRead.isPending}
              disabled={readIds.length === 0}
            >
              Clear read ones
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPreferences((v) => !v)}>
              {showPreferences ? 'Hide preferences' : 'Preferences'}
            </Button>
          </div>
        }
      />

      {markAllRead.error ? <ErrorState error={markAllRead.error} /> : null}
      {clearRead.error ? <ErrorState error={clearRead.error} /> : null}
      {notice ? (
        <p className="rounded-lg bg-success-soft p-3 text-sm text-ink" role="status">
          {notice}
        </p>
      ) : null}
      {composing ? (
        <ComposeMessageModal
          mode={composing}
          learnerSource="mine"
          onClose={() => setComposing(null)}
          onSent={(message) => {
            setComposing(null);
            setNotice(message);
          }}
        />
      ) : null}

      {showPreferences ? <PreferencesCard /> : null}

      <Field label="Filter" className="w-48">
        <Select
          options={STATE_OPTIONS}
          value={state}
          onChange={(event) => {
            setState(event.target.value as NotificationState | '');
            setPage(1);
          }}
        />
      </Field>

      <QueryBoundary
        isLoading={listQuery.isPending}
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
        isEmpty={rows.length === 0}
        emptyState={
          <EmptyState
            icon={<IconNotifications className="h-8 w-8" />}
            title="Nothing here"
            description="Notices from your school will show up here."
          />
        }
      >
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <NotificationCard key={row.id} row={row} onChanged={invalidate} />
          ))}
        </div>
        {listQuery.data ? <Pagination meta={listQuery.data.meta} onPageChange={setPage} /> : null}
      </QueryBoundary>
    </div>
  );
}

function NotificationCard({ row, onChanged }: { row: NotificationRecord; onChanged: () => void }) {
  const isUnread = row.state === 'DELIVERED' || row.state === 'PENDING';

  const markRead = useMutation({
    mutationFn: () => markNotificationRead(row.id),
    onSuccess: onChanged,
  });
  const dismiss = useMutation({
    mutationFn: () => dismissNotification(row.id),
    onSuccess: onChanged,
  });
  // Following the link is acting on it — the state the sender's reports read.
  const actioned = useMutation({ mutationFn: () => markNotificationActioned(row.id), onSuccess: onChanged });

  return (
    <Card className={isUnread ? 'border-primary-muted bg-primary-soft/40' : undefined}>
      <CardBody className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isUnread ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden /> : null}
            <p className={isUnread ? 'font-medium text-ink' : 'text-ink'}>{row.title}</p>
            <Badge tone={toneFor(PRIORITY_TONE, row.priority)}>{humanize(row.priority)}</Badge>
          </div>
          {row.body ? <p className="mt-1 text-sm text-ink-muted">{row.body}</p> : null}
          <p className="mt-1 text-xs text-ink-muted">{formatRelative(row.createdAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.actionPath ? (
            <ButtonLink
              to={row.actionPath}
              size="sm"
              variant="outline"
              onClick={() => {
                if (row.state !== 'ACTIONED') actioned.mutate();
              }}
            >
              {row.actionLabel ?? 'View'}
            </ButtonLink>
          ) : null}
          {isUnread ? (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<IconCheck aria-hidden className="h-4 w-4" />}
              onClick={() => markRead.mutate()}
              isLoading={markRead.isPending}
            >
              Mark read
            </Button>
          ) : null}
          {row.state !== 'DISMISSED' ? (
            <Button size="sm" variant="ghost" onClick={() => dismiss.mutate()} isLoading={dismiss.isPending}>
              Dismiss
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

const FREQUENCY_OPTIONS: SelectOption[] = [
  { value: 'NONE', label: 'No digest' },
  { value: 'DAILY', label: 'Daily digest' },
  { value: 'WEEKLY', label: 'Weekly digest' },
];

function PreferencesCard() {
  const queryClient = useQueryClient();
  const prefsQuery = useQuery({ queryKey: qk.notifications.preferences, queryFn: fetchNotificationPreferences });

  const update = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.notifications.preferences }),
  });

  const data = prefsQuery.data;

  return (
    <Card>
      <CardHeader title="How you hear about things" description="Applies across the platform, not just this list." />
      <CardBody>
        <QueryBoundary
          isLoading={prefsQuery.isPending}
          error={prefsQuery.error}
          onRetry={() => void prefsQuery.refetch()}
        >
          {data ? (
            <div className="flex flex-col gap-3">
              <Checkbox
                label="In-app notifications"
                checked={data.inAppEnabled}
                onChange={(event) => update.mutate({ inAppEnabled: event.target.checked })}
              />
              <Checkbox
                label="Email notifications"
                checked={data.emailEnabled}
                onChange={(event) => update.mutate({ emailEnabled: event.target.checked })}
              />
              <Checkbox
                label="Push notifications"
                checked={data.pushEnabled}
                onChange={(event) => update.mutate({ pushEnabled: event.target.checked })}
              />
              <Field label="Digest" className="w-56">
                <Select
                  options={FREQUENCY_OPTIONS}
                  value={data.digestFrequency}
                  onChange={(event) =>
                    update.mutate({
                      digestEnabled: event.target.value !== 'NONE',
                      digestFrequency: event.target.value as 'DAILY' | 'WEEKLY' | 'NONE',
                    })
                  }
                />
              </Field>
            </div>
          ) : null}
        </QueryBoundary>
      </CardBody>
      <CardFooter>
        <p className="text-xs text-ink-muted">Changes save immediately.</p>
      </CardFooter>
    </Card>
  );
}
