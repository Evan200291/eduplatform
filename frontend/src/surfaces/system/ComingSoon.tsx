import { EmptyState, IconTime, PageHeader } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/use-document-title';

export interface ComingSoonProps {
  title: string;
  description?: string;
  /** What this screen will do, in the user's terms. */
  summary?: string;
}

/**
 * A screen that is routed and reachable but not built yet.
 *
 * Scaffolding, and marked as such: it keeps the navigation, permissions and page
 * titles honest while the feature is implemented, and it tells a user the truth
 * rather than showing an empty table that looks broken.
 *
 * Replacing one of these is the unit of work — delete the `<ComingSoon>` call and
 * write the screen in its place. Nothing else has to change.
 */
export function ComingSoon({ title, description, summary }: ComingSoonProps) {
  useDocumentTitle(title);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={<IconTime className="h-10 w-10" />}
        title="Being built"
        description={summary ?? 'This part of Midas is on its way. Nothing is missing from your account.'}
      />
    </div>
  );
}
