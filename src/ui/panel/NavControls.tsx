/** Course knobs (CRS on the HSI, OBS on the CDI) and the DME source selector. */
import type { RadioId, SimState } from '../../sim/state';
import { DmeReadout } from '../instruments/DmeReadout';
import { courseKnob, formatCourse, type Send } from './controls';
import { Knob } from './Knob';

export function CourseKnob({
  radio,
  state,
  send,
}: {
  radio: RadioId;
  state: SimState;
  send: Send;
}) {
  const deg = state.radios[radio === 1 ? 'nav1' : 'nav2'].obsDeg;
  const name = radio === 1 ? 'CRS' : 'OBS';
  return (
    <Knob
      label={name}
      valueText={`NAV${radio} ${name.toLowerCase()} ${formatCourse(deg)}`}
      testId={`knob-crs${radio}`}
      onTurn={(n, big) => send((s) => courseKnob(s, radio, n, big))}
    />
  );
}

export function DmeUnit({ nm, state, send }: { nm: number | null; state: SimState; send: Send }) {
  const src = state.radios.dmeSource;
  return (
    <div className="dme-unit-box">
      <DmeReadout nm={nm} source={src} />
      <div className="seg" role="radiogroup" aria-label="DME source">
        {([1, 2] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={src === r}
            className={`seg-btn${src === r ? ' on' : ''}`}
            data-testid={`dme-src-${r}`}
            onClick={() => send({ type: 'dmeSource', radio: r })}
          >
            NAV{r}
          </button>
        ))}
      </div>
    </div>
  );
}
