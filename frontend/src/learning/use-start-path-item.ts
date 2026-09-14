import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { startPathItem } from './learning.api';
import { qk } from '@/query/keys';

/**
 * Marks a path step as started the first time a learner opens it, so a
 * teacher's path view can tell "not opened" apart from "opened and stuck".
 *
 * It is a status marker, not a gate: the server refuses locked or removed
 * steps, and in that case the screen that opened the step already explains
 * why. So a refusal here is deliberately not shown a second time.
 */
export function useStartPathItem(pathId: string | null | undefined, itemId: string | null | undefined) {
  const queryClient = useQueryClient();
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathId || !itemId) return;
    const key = `${pathId}:${itemId}`;
    if (sent.current === key) return;
    sent.current = key;
    startPathItem(pathId, itemId)
      .then(() => queryClient.invalidateQueries({ queryKey: qk.learningPaths.detail(pathId) }))
      .catch(() => undefined);
  }, [pathId, itemId, queryClient]);
}
