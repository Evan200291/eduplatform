import { useEffect, type RefObject } from 'react';

/**
 * Calls `onOutside` when a pointer press or an Escape key lands outside `ref`.
 *
 * Both events, not just the click: a dropdown that closes on click-away but not
 * on Escape is a keyboard trap. Listens in the capture phase so it still fires
 * when the pressed element stops propagation.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const node = ref.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) onOutside();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOutside();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [ref, isOpen, onOutside]);
}
