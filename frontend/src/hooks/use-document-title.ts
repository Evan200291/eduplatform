import { useEffect } from 'react';

const SUFFIX = 'Midas Learning';

/**
 * Sets the tab title for a screen.
 *
 * Not decoration: the title is the first thing a screen reader announces after a
 * client-side navigation, and it is what a user sees when several tabs are open.
 * Every routed screen should call this.
 */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
