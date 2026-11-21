/**
 * Shared by the panel's popovers (value entry, speed menu): place a fixed popover next to
 * the control that opened it, and close it on a press outside both.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';

const POP_GAP_PX = 6;
/** Before it is placed: invisible but focusable, so a field in it can take the focus at once. */
export const POPOVER_HIDDEN: CSSProperties = { opacity: 0, pointerEvents: 'none' };

/**
 * Where the popover goes while `open`: below the anchor, or above it when there isn't
 * room, kept on screen. Hidden until measured, and again after closing.
 */
export function usePopoverPlacement(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  pop: RefObject<HTMLElement | null>,
): CSSProperties {
  const [pos, setPos] = useState<CSSProperties>(POPOVER_HIDDEN);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const w = anchor.current?.getBoundingClientRect();
      const p = pop.current?.getBoundingClientRect();
      if (!w || !p) return;
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const below = w.bottom + POP_GAP_PX;
      const top =
        below + p.height <= vh ? below : Math.max(POP_GAP_PX, w.top - POP_GAP_PX - p.height);
      const left = Math.min(Math.max(POP_GAP_PX, w.left), vw - p.width - POP_GAP_PX);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
      setPos(POPOVER_HIDDEN);
    };
  }, [open, anchor, pop]);
  return pos;
}

/** While `open`, a press outside every element in `inside` calls `onOutside`. */
export function useOutsidePress(
  open: boolean,
  inside: RefObject<HTMLElement | null>[],
  onOutside: () => void,
) {
  const cb = useRef(onOutside);
  const refs = useRef(inside);
  useEffect(() => {
    cb.current = onOutside;
    refs.current = inside;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (refs.current.some((r) => r.current?.contains(t))) return;
      cb.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);
}
