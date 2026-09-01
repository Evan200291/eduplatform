import { ButtonLink, EmptyState, IconSafety } from '@/components/ui';
import { useHomePath } from '@/routes/use-home-path';
import { useDocumentTitle } from '@/hooks/use-document-title';

/**
 * Shown when a guard blocks a route.
 *
 * Says the access is missing, not that the page is missing — pretending a screen
 * does not exist leaves people re-checking the URL. It also names the fix, which
 * is always a person: whoever administers their school.
 */
export function ForbiddenPage() {
  useDocumentTitle('No access');
  const home = useHomePath();

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-gutter">
      <EmptyState
        icon={<IconSafety className="h-10 w-10" />}
        title="You do not have access to this page"
        description="Your account does not include this area. If you think it should, ask your school administrator."
        action={<ButtonLink to={home}>Back to my home page</ButtonLink>}
      />
    </div>
  );
}
