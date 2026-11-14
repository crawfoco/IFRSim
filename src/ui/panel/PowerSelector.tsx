/** Power selector: target airspeed 90–120 KIAS, which also sets the approach category. */
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
      <Knob
        label="POWER"
        valueText={`target ${kt} knots, category ${approachCategory(kt)}`}
        testId="knob-power"
        onTurn={(n, big) => send((s) => speedKnob(s, n, big))}
      />
    </section>
  );
}
