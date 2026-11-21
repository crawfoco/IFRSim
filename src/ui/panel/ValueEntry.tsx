/**
 * A value window you can set from any input: the NAV standby frequency, the selected
 * heading and the course. Click or tap it (or focus it and press Enter) to open a popover
 * with the value, an on-screen keypad and step buttons.
 *
 * - Typing (physical keyboard or the keypad) replaces the value; Enter or Set sets it,
 *   Escape or Cancel closes without setting. An invalid entry stays, marked, on Set.
 * - Step buttons (e.g. −10 / +10) act at once, like a knob turn, and the popover then
 *   shows the new value.
 * - A click or tap outside sets a valid entry and drops an invalid one.
 * - Opened by touch, the field asks for no system keyboard (`inputmode="none"`): the
 *   keypad is the keyboard, so the iPad keyboard doesn't cover half the panel. A
 *   hardware keyboard still types into it.
 *
 * Test ids: `${testId}-edit` is the window, `${testId}` the value in it, `${testId}-pop`
 * the popover, `${testId}-input` its field, `${testId}-key-<k>` the keys (0–9, dot, back),
 * `${testId}-set` / `-cancel`, and `${testId}-step-<id>` the step buttons.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

export interface EntryStep {
  /** Test-id suffix, e.g. "m10". */
  id: string;
  /** Button text, e.g. "−10". */
  label: string;
  /** Small unit under the text, e.g. "MHz". */
  unit?: string;
  /** Read by screen readers and shown as a tooltip, e.g. "Heading down 10°". */
  title: string;
  onPress: () => void;
  /** Takes a whole row (e.g. HDG's sync). */
  wide?: boolean;
}

export interface ValueEntryProps<T> {
  testId: string;
  /** What the window shows. */
  text: string;
  /** What the field starts with; defaults to `text`. */
  editText?: string;
  parse: (text: string) => T | null;
  onSet: (value: T) => void;
  /** Accessible name and popover heading, e.g. "NAV1 standby". */
  name: string;
  /** What a valid entry is, e.g. "a NAV frequency, 108.00 to 117.95, in 0.05 steps". */
  rangeHint: string;
  /** Short label shown in the window above the value, e.g. STBY or CRS. */
  label?: string | undefined;
  /** Classes for the window, its label and its value. */
  className: string;
  labelClassName?: string;
  valueClassName: string;
  /** Characters the field takes. */
  maxLength: number;
  /** Tooltip on the window; defaults to a hint to click and type. */
  title?: string;
  /** Step buttons in the popover. */
  steps?: EntryStep[];
  /** Whether the keypad has a decimal point (frequencies) or not (degrees). */
  decimal?: boolean;
  /** One line under the keypad, e.g. how the knob turns (not shown when opened by touch). */
  hint?: string;
}

const POP_GAP_PX = 6;
/** Before it is placed: invisible but focusable, so the field can take the focus at once. */
const HIDDEN: CSSProperties = { opacity: 0, pointerEvents: 'none' };
const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

export function ValueEntry<T>({
  testId,
  text,
  editText,
  parse,
  onSet,
  name,
  rangeHint,
  label,
  className,
  labelClassName,
  valueClassName,
  maxLength,
  title,
  steps = [],
  decimal = false,
  hint,
}: ValueEntryProps<T>) {
  const [open, setOpen] = useState(false);
  /** What has been typed since opening or the last step; null shows the live value. */
  const [typed, setTyped] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [touch, setTouch] = useState(false);
  const [pos, setPos] = useState<CSSProperties>(HIDDEN);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const lastPointer = useRef('');
  // Set when Enter, Escape, Set or Cancel closes the popover: focus goes back to the window.
  const refocus = useRef(false);

  const live = editText ?? text;
  const shown = typed ?? live;

  const close = (focusWindow: boolean) => {
    refocus.current = focusWindow;
    setOpen(false);
    setTyped(null);
    setInvalid(false);
  };
  /** Set what was typed. From Set/Enter an invalid entry stays open, marked. */
  const commit = (fromSet: boolean) => {
    if (typed === null) return close(fromSet);
    const v = parse(typed);
    if (v === null && fromSet) {
      setInvalid(true);
      return;
    }
    if (v !== null) onSet(v);
    close(fromSet);
  };
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  useEffect(() => {
    if (!open && refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [open]);

  // Place the popover below the window, or above it when there isn't room, kept on screen.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const w = button.current?.getBoundingClientRect();
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
    };
  }, [open]);

  // A press outside the popover (and its window) sets a valid entry and closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || button.current?.contains(t)) return;
      commitRef.current(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // Focus the field on opening; with the live value shown, select it so typing replaces it.
  // Not on touch: iOS answers a selection with its Cut/Copy menu, and the keypad's first
  // key replaces the value anyway.
  useEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
    if (typed === null && !touch) input.current?.select();
  }, [open, typed, touch, live]);

  const type = (next: string) => {
    setTyped(next.slice(0, maxLength));
    setInvalid(false);
  };
  // Keypad: the first key replaces the value shown, as typing over a selected field does.
  const press = (k: string) => type(typed === null ? k : typed + k);
  const back = () => type((typed ?? live).slice(0, -1));
  const step = (s: EntryStep) => {
    s.onPress();
    setTyped(null);
    setInvalid(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  };
  // Keypad and step buttons keep the focus in the field, so typing carries on.
  const keepFocus = (e: PointerEvent) => e.preventDefault();

  const keyBtn = (k: string, id: string, aria: string, onClick: () => void) => (
    <button
      key={id}
      type="button"
      className="entry-key"
      aria-label={aria}
      data-testid={`${testId}-key-${id}`}
      onPointerDown={keepFocus}
      onClick={onClick}
    >
      {k}
    </button>
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`${className} entry-btn${open ? ' entry-open' : ''}`}
        aria-label={`${name} ${text}, click to set`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title ?? `${name}: click to set`}
        data-testid={`${testId}-edit`}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
        }}
        onClick={() => {
          if (open) return commit(false);
          setTouch(lastPointer.current === 'touch' || lastPointer.current === 'pen');
          lastPointer.current = '';
          setPos(HIDDEN);
          setOpen(true);
        }}
      >
        {label !== undefined && <span className={labelClassName}>{label}</span>}
        <span className={valueClassName} data-testid={testId}>
          {text}
        </span>
      </button>
      {open && (
        <div
          ref={pop}
          className="entry-pop"
          role="dialog"
          aria-label={name}
          data-testid={`${testId}-pop`}
          style={pos}
        >
          <div className="entry-pop-name">{name}</div>
          <input
            ref={input}
            className={`entry-input${invalid ? ' entry-invalid' : ''}`}
            data-testid={`${testId}-input`}
            aria-label={`${name}, ${rangeHint}`}
            aria-invalid={invalid || undefined}
            title={invalid ? `Enter ${rangeHint}` : undefined}
            inputMode={touch ? 'none' : decimal ? 'decimal' : 'numeric'}
            enterKeyHint="done"
            autoComplete="off"
            spellCheck={false}
            maxLength={maxLength}
            value={shown}
            onChange={(e) => type(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {invalid && (
            <div className="entry-error" role="alert">
              Enter {rangeHint}
            </div>
          )}
          {steps.length > 0 && (
            <div className="entry-steps">
              {steps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`entry-step${s.wide ? ' entry-step-wide' : ''}`}
                  title={s.title}
                  aria-label={s.title}
                  data-testid={`${testId}-step-${s.id}`}
                  onPointerDown={keepFocus}
                  onClick={() => step(s)}
                >
                  {s.label}
                  {s.unit && <span className="entry-step-unit">{s.unit}</span>}
                </button>
              ))}
            </div>
          )}
          <div className="entry-keys">
            {KEYS.map((k) => keyBtn(k, k, k, () => press(k)))}
            {decimal ? keyBtn('.', 'dot', 'point', () => press('.')) : <span />}
            {keyBtn('0', '0', '0', () => press('0'))}
            {keyBtn('⌫', 'back', 'Delete', back)}
          </div>
          <div className="entry-actions">
            <button
              type="button"
              className="entry-action"
              data-testid={`${testId}-cancel`}
              onPointerDown={keepFocus}
              onClick={() => close(true)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="entry-action entry-set"
              data-testid={`${testId}-set`}
              onPointerDown={keepFocus}
              onClick={() => commit(true)}
            >
              Set
            </button>
          </div>
          {hint && !touch && <div className="entry-hint">{hint}</div>}
        </div>
      )}
    </>
  );
}

/** −10 / −1 / +1 / +10 for a heading or course; `turn(n)` turns it by n degrees. */
export function degreeSteps(what: string, turn: (deg: number) => void): EntryStep[] {
  return ([-10, -1, 1, 10] as const).map((n) => ({
    id: n < 0 ? `m${-n}` : `p${n}`,
    label: n < 0 ? `−${-n}` : `+${n}`,
    title: `${what} ${n < 0 ? 'down' : 'up'} ${Math.abs(n)}°`,
    onPress: () => turn(n),
  }));
}

/** −1 MHz / −50 kHz / +50 kHz / +1 MHz, wrapping as the knobs do. */
export function frequencySteps(turn: (part: 'mhz' | 'khz', steps: number) => void): EntryStep[] {
  return [
    {
      id: 'mhz-down',
      label: '−1',
      unit: 'MHz',
      title: 'Down 1 MHz',
      onPress: () => turn('mhz', -1),
    },
    {
      id: 'khz-down',
      label: '−50',
      unit: 'kHz',
      title: 'Down 50 kHz',
      onPress: () => turn('khz', -1),
    },
    { id: 'khz-up', label: '+50', unit: 'kHz', title: 'Up 50 kHz', onPress: () => turn('khz', 1) },
    { id: 'mhz-up', label: '+1', unit: 'MHz', title: 'Up 1 MHz', onPress: () => turn('mhz', 1) },
  ];
}
