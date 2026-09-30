import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { text } from '@/components/ui';

export type PathNodeState = 'done' | 'now' | 'open' | 'locked';

export interface LessonPathNode {
  id: string;
  /** Full step name, also spoken by a screen reader. */
  label: string;
  state: PathNodeState;
  icon: ReactNode;
  /** Present for a step that navigates. */
  href?: string;
  /** Present for a step that opens something in place (a lesson). */
  onOpen?: () => void;
  /** Why a locked step is locked, when the server said. */
  reason?: string | null;
}

const OFFSETS = [0, -1, 0, 1] as const;

/**
 * The learning path as a winding trail of big round nodes — the shape a child
 * already understands from every game: follow the road, the glowing one is next.
 *
 * Same information as the list it replaces (status, order, what opens what),
 * but the current step is the only thing that pulses and says "Start", and a
 * locked step is a grey blob rather than a wall of text. Each node keeps a
 * readable name for screen readers and a visible caption underneath.
 */
export function LessonPath({ nodes }: { nodes: readonly LessonPathNode[] }) {
  return (
    <ol className="flex flex-col items-center gap-6 py-4">
      {nodes.map((node, index) => {
        const offset = OFFSETS[index % OFFSETS.length];
        const isNow = node.state === 'now';
        const interactive = node.state !== 'locked' && (node.href || node.onOpen);
        const spoken = `Step ${index + 1}: ${node.label}. ${
          node.state === 'done' ? 'Done.' : node.state === 'locked' ? (node.reason ?? 'Locked.') : isNow ? 'Next up. Press to start.' : 'Ready.'
        }`;
        const inner = (
          <>
            {isNow ? <span className="kid-node-tip">Start</span> : null}
            <span aria-hidden className="grid place-items-center [&>svg]:h-8 [&>svg]:w-8">
              {node.icon}
            </span>
          </>
        );

        return (
          <li
            key={node.id}
            // The "Start" bubble floats above the current node; give it room so it
            // never covers the caption of the step before.
            className={cn('flex flex-col items-center gap-2', isNow && 'pt-10')}
            style={{ transform: `translateX(calc(var(--kid-zig) * ${offset}))` }}
          >
            {interactive && node.href ? (
              <Link to={node.href} data-state={node.state} aria-label={spoken} className="kid-node">
                {inner}
              </Link>
            ) : interactive ? (
              <button type="button" data-state={node.state} aria-label={spoken} onClick={node.onOpen} className="kid-node">
                {inner}
              </button>
            ) : (
              <button type="button" data-state={node.state} aria-label={spoken} disabled className="kid-node">
                {inner}
              </button>
            )}
            <span className={cn(text.heading, 'max-w-[9rem] truncate text-center text-sm', node.state === 'locked' && 'text-ink-muted')}>
              {node.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
