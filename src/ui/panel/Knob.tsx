/**
 * Rotary knob. Turn it by dragging up/down, with the mouse wheel or trackpad, or with the keyboard
 * (arrows = 1 step, Page Up/Down or Shift+arrow = big step). It reports step counts;
 * the parent turns those into sim commands. A knob with `onPush` is also pushed by a
 * double-click or Enter (e.g. the HDG knob syncs the bug to the current heading).
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

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
  /** How far a step and a big step go, e.g. ['1°', '10°']: shown in the tooltip. */
  stepHint?: [small: string, big: string];
  /** Shown under the knob in place of the label, e.g. a value window you can type into. */
  below?: ReactNode;
}

/** The knob's tooltip: what a push does, then how to turn it in small and big steps. */
export function knobTitle(pushHint?: string, stepHint?: [string, string]): string | undefined {
  const turn = stepHint
    ? `Drag, scroll or arrow keys: ${stepHint[0]}. Shift or Page Up/Down: ${stepHint[1]}.`
    : undefined;
  return [pushHint && `${pushHint}.`, turn].filter(Boolean).join(' ') || undefined;
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

/** Trackpad scroll (in pixels) per knob step once a gesture is under way. */
export const WHEEL_PX_PER_STEP = 50;
/** A pause this long between wheel events starts a new gesture. */
export const WHEEL_GESTURE_GAP_MS = 250;

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  /** 0 = pixels, 1 = lines, 2 = pages (WheelEvent.DOM_DELTA_*). */
  deltaMode: number;
  timeStamp: number;
}

/**
 * Turns wheel events into knob steps without letting a trackpad run away. A mouse sends
 * a few large events (a notch each), a trackpad a stream of small ones plus momentum
 * after the fingers lift, so a step per event spins a trackpad far past the target.
 * Here the first event of a gesture is one step (so a mouse notch or a light touch
 * still turns the knob at once), then pixel scrolling counts one step per
 * WHEEL_PX_PER_STEP, never more than one per event. Line and page deltas (a mouse in
 * Firefox) are one step per event. Up or left (negative delta) turns the knob up; the
 * horizontal axis counts too, since Shift+wheel scrolls sideways in some browsers.
 */
export function createWheelStepper(): (e: WheelLike) => number {
  let acc = 0;
  let last = -Infinity;
  return (e) => {
    const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (d === 0) return 0;
    const fresh = e.timeStamp - last > WHEEL_GESTURE_GAP_MS;
    last = e.timeStamp;
    if (fresh || e.deltaMode !== 0) {
      acc = 0;
      return d < 0 ? 1 : -1;
    }
    // A reversal mid-gesture starts counting afresh in the new direction.
    if (Math.sign(acc) !== Math.sign(d)) acc = 0;
    acc += d;
    if (Math.abs(acc) < WHEEL_PX_PER_STEP) return 0;
    acc = 0;
    return d < 0 ? 1 : -1;
  };
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
  stepHint,
  below,
}: KnobProps) {
  const title = knobTitle(pushHint, stepHint);
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
    const wheelSteps = createWheelStepper();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const steps = wheelSteps(e);
      if (steps !== 0) emitRef.current(steps, e.shiftKey);
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
        aria-description={title}
        title={title}
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
      {below ?? <span className="knob-label">{label}</span>}
    </div>
  );
}
