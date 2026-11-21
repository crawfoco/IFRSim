/**
 * Power selector: the target airspeed, which also sets the approach category. Click or tap
 * the speed readout for a small menu of target speeds (SPEED_CHOICES). The GA (TOGA)
 * button sits here, as on a throttle: pressing it is the go-around decision.
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import type { SimState } from '../../sim/state';
import { approachCategory, SPEED_CHOICES, type Send } from './controls';
import { useOutsidePress, usePopoverPlacement } from './usePopover';

export function PowerSelector({ state, send }: { state: SimState; send: Send }) {
  const kt = state.panel.iasCmdKt;
  const cat = approachCategory(kt);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const pos = usePopoverPlacement(open, button, menu);
  useOutsidePress(open, [button, menu], () => setOpen(false));

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const pick = (choice: number) => {
    send({ type: 'speed', kt: choice });
    close();
  };
  /** Up/down move between the choices; Escape closes. */
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items[next]?.focus();
    }
  };

  return (
    <section className="power" aria-label="Power selector">
      <button
        ref={button}
        type="button"
        className={`power-readout entry-btn${open ? ' entry-open' : ''}`}
        aria-label={`Target speed ${kt} knots, category ${cat}: click to choose`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Target speed: click to choose"
        data-testid="power-edit"
        onClick={() => (open ? setOpen(false) : setOpen(true))}
      >
        <span className="power-value entry-value" data-testid="power-value">
          {kt}
        </span>
        <span className="power-unit">KIAS</span>
        <span className="power-cat" data-testid="power-cat">
          CAT {cat}
        </span>
      </button>
      {open && (
        <div
          ref={menu}
          className="entry-pop speed-menu"
          role="menu"
          aria-label="Target speed"
          data-testid="power-menu"
          style={pos}
          onKeyDown={onMenuKey}
        >
          <div className="entry-pop-name">Target speed</div>
          {SPEED_CHOICES.map((choice, i) => (
            <button
              key={choice}
              type="button"
              role="menuitemradio"
              aria-checked={choice === kt}
              className={`speed-opt${choice === kt ? ' on' : ''}`}
              data-testid={`speed-opt-${choice}`}
              // The current speed (or the first) takes the focus, for the keyboard.
              autoFocus={choice === kt || (i === 0 && !SPEED_CHOICES.some((c) => c === kt))}
              onClick={() => pick(choice)}
            >
              <span className="speed-opt-kt">{choice} KIAS</span>
              <span className="speed-opt-cat">CAT {approachCategory(choice)}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`ga-btn${state.goAroundTick !== null ? ' on' : ''}`}
        aria-label="Go-around (TOGA)"
        title="Go-around (TOGA): wings level, climb; starts the missed approach"
        data-testid="btn-GA"
        onClick={() => send({ type: 'button', button: 'GA' })}
      >
        GA
      </button>
    </section>
  );
}
