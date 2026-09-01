import { ButtonLink, EmptyState, IconSearch } from '@/components/ui';
import { useHomePath } from '@/routes/use-home-path';
import { useDocumentTitle } from '@/hooks/use-document-title';

/**
 * The catch-all route.
 *
 * Offers the one link that always works — the user's own home page — rather than a
 * generic "go back", which after a bad redirect just returns them to the thing
 * that sent them here.
 */
export function NotFoundPage() {
  useDocumentTitle('Page not found');
  const home = useHomePath();

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-gutter">
      <EmptyState
        icon={<IconSearch className="h-10 w-10" />}
        title="We could not find that page"
        description="The link may be out of date, or the page may have been moved."
        action={<ButtonLink to={home}>Back to my home page</ButtonLink>}
      />
    </div>
  );
}
