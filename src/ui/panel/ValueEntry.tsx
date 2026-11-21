/**
 * A value window you can type into: the NAV standby frequency, the selected heading and
 * the course. Click it (or focus it and press Enter) to type; Enter or leaving the field
 * sets the value, Escape cancels. An invalid entry stays in the field, marked, on Enter,
 * and is dropped on leaving. The parent parses the text and sends the command.
 *
 * Test ids: `${testId}-edit` is the window, `${testId}` the value in it, and
 * `${testId}-input` the field while typing.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface ValueEntryProps<T> {
  testId: string;
  /** What the window shows. */
  text: string;
  /** What the field starts with; defaults to `text`. */
  editText?: string;
  parse: (text: string) => T | null;
  onSet: (value: T) => void;
  /** Accessible name, e.g. "NAV1 standby". */
  name: string;
  /** What a valid entry is, e.g. "108.00 to 117.95, in 0.05 steps". */
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
}

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
}: ValueEntryProps<T>) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // Set when Enter or Escape closes the field: focus goes back to the window, and a blur
  // from the field going away must not commit a cancelled draft.
  const closing = useRef(false);
  useEffect(() => {
    if (draft === null && closing.current) {
      closing.current = false;
      button.current?.focus();
    }
  }, [draft]);
  const close = () => {
    setDraft(null);
    setInvalid(false);
  };
  /** Enter: set it or mark it invalid. Blur: set it or drop it. */
  const commit = (fromEnter: boolean) => {
    if (closing.current) return;
    const v = parse(draft ?? '');
    if (v === null && fromEnter) {
      setInvalid(true);
      return;
    }
    if (v !== null) onSet(v);
    closing.current = fromEnter;
    close();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closing.current = true;
      close();
    }
  };
  const labelEl = (htmlFor?: string) =>
    label === undefined ? null : htmlFor ? (
      <label className={labelClassName} htmlFor={htmlFor}>
        {label}
      </label>
    ) : (
      <span className={labelClassName}>{label}</span>
    );

  if (draft === null)
    return (
      <button
        ref={button}
        type="button"
        className={`${className} entry-btn`}
        aria-label={`${name} ${text}, click to type a value`}
        title={title ?? `${name}: click to type a value`}
        data-testid={`${testId}-edit`}
        onClick={() => setDraft(editText ?? text)}
      >
        {labelEl()}
        <span className={valueClassName} data-testid={testId}>
          {text}
        </span>
      </button>
    );
  const inputId = `${testId}-input`;
  return (
    <span className={`${className} entry-open`}>
      {labelEl(inputId)}
      <span className={valueClassName}>
        <input
          id={inputId}
          className={`entry-input${invalid ? ' entry-invalid' : ''}`}
          style={{ width: `${maxLength}ch` }}
          data-testid={inputId}
          aria-label={`${name}, ${rangeHint}`}
          aria-invalid={invalid || undefined}
          title={invalid ? `Enter ${rangeHint}` : undefined}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          maxLength={maxLength}
          value={draft}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(false)}
        />
      </span>
    </span>
  );
}
