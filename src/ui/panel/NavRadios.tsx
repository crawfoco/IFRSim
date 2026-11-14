/** NAV1 / NAV2: active and standby frequencies, flip-flop, MHz and kHz tuning knobs. */
import type { RadioId, SimState } from '../../sim/state';
import { formatMHz, frequencyKnob, type Send } from './controls';
import { Knob } from './Knob';

function NavRadio({ id, state, send }: { id: RadioId; state: SimState; send: Send }) {
  const r = state.radios[id === 1 ? 'nav1' : 'nav2'];
  return (
    <div className="radio" role="group" aria-label={`NAV${id} radio`} data-testid={`nav${id}`}>
      <span className="radio-name">NAV{id}</span>
      <div className="radio-freq">
        <span className="radio-label">ACT</span>
        <span className="radio-active" data-testid={`nav${id}-active`}>
          {formatMHz(r.activeMHz)}
        </span>
      </div>
      <button
        type="button"
        className="radio-swap"
        aria-label={`Swap NAV${id} active and standby`}
        data-testid={`nav${id}-swap`}
        onClick={() => send({ type: 'swap', radio: id })}
      >
        ⇆
      </button>
      <div className="radio-freq">
        <span className="radio-label">STBY</span>
        <span className="radio-standby" data-testid={`nav${id}-standby`}>
          {formatMHz(r.standbyMHz)}
        </span>
      </div>
      <div className="radio-knobs">
        <Knob
          small
          label="MHz"
          valueText={`NAV${id} standby ${formatMHz(r.standbyMHz)}`}
          testId={`nav${id}-mhz`}
          onTurn={(n) => send((s) => frequencyKnob(s, id, 'mhz', n))}
        />
        <Knob
          small
          label="kHz"
          valueText={`NAV${id} standby ${formatMHz(r.standbyMHz)}`}
          testId={`nav${id}-khz`}
          onTurn={(n) => send((s) => frequencyKnob(s, id, 'khz', n))}
        />
      </div>
    </div>
  );
}

export function NavRadios({ state, send }: { state: SimState; send: Send }) {
  return (
    <section className="radios" aria-label="Nav radios">
      <NavRadio id={1} state={state} send={send} />
      <NavRadio id={2} state={state} send={send} />
    </section>
  );
}
