/**
 * Rotary knob. Turn it by dragging up/down, with the mouse wheel, or with the keyboard
 * (arrows = 1 step, Page Up/Down or Shift+arrow = big step). It reports step counts;
 * the parent turns those into sim commands. A knob with `onPush` is also pushed by a
 * double-click or Enter (e.g. the HDG knob syncs the bug to the current heading).
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const DRAG_PX_PER_STEP = 8;
const DEG_PER_STEP = 15;

export interface KnobProps {
  label: string;
  /** Text read by screen readers and shown under the knob. */
  valueText: string;
  onTurn: (steps: number, big: boolean) => void;
  testId?: string;
  /** Smaller knob, e.g. the inner kHz knob. */
  small?: boolean;
  disabled?: boolean;
  /** Push the knob (double-click or Enter). */
  onPush?: () => void;
  /** What a push does, shown as a tooltip and read by screen readers. */
  pushHint?: string;
}

export function keyToSteps(e: { key: string; shiftKey: boolean }): [number, boolean] | null {
  switch (e.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return [1, e.shiftKey];
    case 'ArrowDown':
    case 'ArrowLeft':
      return [-1, e.shiftKey];
    case 'PageUp':
      return [1, true];
    case 'PageDown':
      return [-1, true];
    default:
      return null;
  }
}

export function Knob({
  label,
  valueText,
  onTurn,
  testId,
  small,
  disabled,
  onPush,
  pushHint,
}: KnobProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [angle, setAngle] = useState(0);
  const drag = useRef<{ y: number; acc: number } | null>(null);

  const emit = (steps: number, big: boolean) => {
    if (disabled || steps === 0) return;
    setAngle((a) => a + steps * DEG_PER_STEP);
    onTurn(steps, big);
  };
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  });

  // React's onWheel is passive, so preventDefault (stop the page scrolling) needs a native listener.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY !== 0) emitRef.current(e.deltaY < 0 ? 1 : -1, e.shiftKey);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const push = () => {
    if (!disabled) onPush?.();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && onPush) {
      e.preventDefault();
      push();
      return;
    }
    const s = keyToSteps(e);
    if (!s) return;
    e.preventDefault();
    emit(s[0], s[1]);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, acc: 0 };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.acc += d.y - e.clientY;
    d.y = e.clientY;
    const steps = Math.trunc(d.acc / DRAG_PX_PER_STEP);
    if (steps !== 0) {
      d.acc -= steps * DRAG_PX_PER_STEP;
      emit(steps, e.shiftKey);
    }
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className={`knob${small ? ' knob-small' : ''}${disabled ? ' knob-disabled' : ''}`}>
      <div
        ref={ref}
        className="knob-cap"
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        aria-description={pushHint}
        title={pushHint}
        data-testid={testId}
        onDoubleClick={onPush ? push : undefined}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="knob-grip" style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <span className="knob-label">{label}</span>
    </div>
  );
}
