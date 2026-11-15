/**
 * Power selector: target airspeed 80–110 KIAS, which also sets the approach category. The
 * GA (TOGA) button sits here, as on a throttle: pressing it is the go-around decision.
 */
import type { SimState } from '../../sim/state';
import { approachCategory, speedKnob, type Send } from './controls';
import { Knob } from './Knob';

export function PowerSelector({ state, send }: { state: SimState; send: Send }) {
  const kt = state.panel.iasCmdKt;
  return (
    <section className="power" aria-label="Power selector">
      <div className="power-readout">
        <span className="power-value" data-testid="power-value">
          {kt}
        </span>
        <span className="power-unit">KIAS</span>
        <span className="power-cat" data-testid="power-cat">
          CAT {approachCategory(kt)}
        </span>
      </div>
      <div className="power-row">
        <Knob
          label="POWER"
          valueText={`target ${kt} knots, category ${approachCategory(kt)}`}
          testId="knob-power"
          onTurn={(n, big) => send((s) => speedKnob(s, n, big))}
        />
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
      </div>
    </section>
  );
}
