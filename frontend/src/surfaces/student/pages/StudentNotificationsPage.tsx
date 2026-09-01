import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  IconNotifications,
  PageHeader,
  text,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { fetchNotifications, markNotificationRead, markNotificationsRead } from '@/notifications/notifications.api';
import { qk } from '@/query/keys';
import { formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';

const PRIORITY_TONE = { LOW: 'neutral', NORMAL: 'info', HIGH: 'warning', CRITICAL: 'danger' } as const;

/**
 * Notices from school and teacher, and safe reminders that point to the next
 * action.
 *
 * This is the one student screen where colour is *entirely* semantic: unread
 * messages take the brand tint and a coloured left edge, priority takes the
 * warning/danger tones, and read messages go quiet. Rotating decorative colours
 * through a message list would make an ordinary notice look urgent, which is
 * exactly the thing the `play` tokens are not allowed to do.
 */
export function StudentNotificationsPage() {
  useDocumentTitle('Messages');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: qk.notifications.list(),
    queryFn: () => fetchNotifications(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.notifications.list() });
    void queryClient.invalidateQueries({ queryKey: qk.notifications.summary });
  };

  const markOne = useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: () => markNotificationsRead({ all: true }), onSuccess: invalidate });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Messages"
        description="Notices from your school and your teacher."
        actions={
          <Button variant="outline" size="sm" isLoading={markAll.isPending} onClick={() => markAll.mutate()}>
            Mark all read
          </Button>
        }
      />

      <QueryBoundary
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.items.length === 0}
        emptyState={
          <EmptyState
            icon={<IconNotifications aria-hidden className="h-8 w-8 text-play-6" />}
            title="No messages right now"
            description="When your teacher sends you something, it will appear here."
          />
        }
      >
        <div className="flex flex-col gap-3">
          {query.data?.items.map((note) => {
            const isUnread = note.state !== 'READ';

            return (
              <Card
                key={note.id}
                className={cn(isUnread && 'border-l-4 border-l-primary bg-primary-soft')}
              >
                <CardBody className="flex flex-wrap items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn(text.heading, 'text-lg')}>{note.title}</p>
                      {isUnread ? (
                        <Badge tone="brand" variant="solid">
                          New
                        </Badge>
                      ) : null}
                      {note.priority !== 'NORMAL' ? (
                        <Badge tone={PRIORITY_TONE[note.priority]} variant="solid">
                          {note.priority.toLowerCase()}
                        </Badge>
                      ) : null}
                    </div>
                    {note.body ? <p className="mt-1 leading-body text-ink">{note.body}</p> : null}
                    <p className="mt-1 text-xs text-ink-muted">{formatRelative(note.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {note.actionPath && note.actionLabel ? (
                      <Button
                        onClick={() => {
                          if (isUnread) markOne.mutate(note.id);
                          navigate(note.actionPath as string);
                        }}
                      >
                        {note.actionLabel}
                      </Button>
                    ) : null}
                    {isUnread ? (
                      <Button variant="ghost" size="sm" onClick={() => markOne.mutate(note.id)}>
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </QueryBoundary>
    </div>
  );
}
