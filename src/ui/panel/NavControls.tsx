/**
 * Course knobs (CRS on the HSI, OBS on the CDI), each with a course window under it that
 * takes a typed course, and the DME source selector.
 */
import type { RadioId, SimState } from '../../sim/state';
import { DmeReadout } from '../instruments/DmeReadout';
import { courseKnob, formatCourse, parseDegrees, type Send } from './controls';
import { Knob } from './Knob';
import { degreeSteps, ValueEntry } from './ValueEntry';

export function CourseKnob({
  radio,
  state,
  send,
  label,
  testId,
}: {
  radio: RadioId;
  state: SimState;
  send: Send;
  /** Knob label; default CRS (NAV1, the HSI) / OBS (NAV2, the CDI). */
  label?: string;
  /** Test id; default knob-crs1 / knob-crs2. */
  testId?: string;
}) {
  const deg = state.radios[radio === 1 ? 'nav1' : 'nav2'].obsDeg;
  const name = label ?? (radio === 1 ? 'CRS' : 'OBS');
  const id = testId ?? `knob-crs${radio}`;
  return (
    <Knob
      label={name}
      valueText={`NAV${radio} ${name.toLowerCase()} ${formatCourse(deg)}`}
      testId={id}
      onTurn={(n, big) => send((s) => courseKnob(s, radio, n, big))}
      stepHint={['1°', '10°']}
      below={
        <ValueEntry
          testId={`${id}-sel`}
          text={formatCourse(deg)}
          parse={parseDegrees}
          onSet={(d) => send({ type: 'course', radio, deg: d })}
          name={`NAV${radio} ${name === 'OBS' ? 'OBS course' : 'course'}`}
          rangeHint="a course, 1 to 360 degrees"
          label={name}
          className="knob-entry"
          labelClassName="knob-entry-label"
          valueClassName="knob-entry-value"
          maxLength={3}
          title={`${name}: click to set the course`}
          steps={degreeSteps('Course', (n) => send((s) => courseKnob(s, radio, n, false)))}
          hint="Knob: drag, scroll or arrows 1°; Shift or Page Up/Down 10°."
        />
      }
    />
  );
}

export function DmeUnit({
  nm,
  state,
  send,
  readout = true,
}: {
  nm: number | null;
  state: SimState;
  send: Send;
  /** Show the DME readout; off on the glass panel, where the PFD's DME window shows it. */
  readout?: boolean;
}) {
  const src = state.radios.dmeSource;
  return (
    <div className="dme-unit-box">
      {readout ? (
        <DmeReadout nm={nm} source={src} />
      ) : (
        <span className="dme-src-label">DME SRC</span>
      )}
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
