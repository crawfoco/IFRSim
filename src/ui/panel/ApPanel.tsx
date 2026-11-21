/** Generic GA autopilot: mode annunciator, mode buttons, HDG / ALT knobs and VS +/− buttons. */
import { annunciation, type ApButton } from '../../sim/autopilot/modes';
import type { SimState } from '../../sim/state';
import {
  altitudeKnob,
  formatCourse,
  headingKnob,
  parseAltitude,
  parseDegrees,
  VS_STEP_FPM,
  vsStep,
  type Send,
} from './controls';
import { Knob } from './Knob';
import { altitudeSteps, degreeSteps, ValueEntry } from './ValueEntry';

const BUTTONS: { id: ApButton; name: string }[] = [
  { id: 'AP', name: 'Autopilot on/off' },
  { id: 'HDG', name: 'Heading mode' },
  { id: 'NAV', name: 'Nav mode' },
  { id: 'APR', name: 'Approach mode' },
  { id: 'ALT', name: 'Altitude hold' },
  { id: 'VS', name: 'Vertical speed mode' },
];

const fmtVs = (fpm: number) => (fpm > 0 ? `+${fpm}` : String(fpm));

export function ApPanel({
  state,
  send,
  annunciator = true,
}: {
  state: SimState;
  send: Send;
  /** Show the panel's mode annunciator; off on the glass panel, where the PFD shows the modes. */
  annunciator?: boolean;
}) {
  const a = annunciation(state.ap, state.ap.navKind);
  const vsMode = state.ap.vertical === 'VS' && state.ap.engaged;
  const hdg = formatCourse(state.panel.headingBugDeg);
  /** The selected heading, typed: in the annunciator strip (steam) or under the knob (glass). */
  const headingEntry = (
    testId: string,
    className: string,
    valueClassName: string,
    label?: string,
  ) => (
    <ValueEntry
      testId={testId}
      text={label ? hdg : `${hdg}°`}
      editText={hdg}
      parse={parseDegrees}
      onSet={(deg) => send({ type: 'headingBug', deg })}
      name="Selected heading"
      rangeHint="a heading, 1 to 360 degrees"
      label={label}
      className={className}
      labelClassName="knob-entry-label"
      valueClassName={valueClassName}
      maxLength={3}
      title="Selected heading: click to set it"
      steps={[
        ...degreeSteps('Heading', (n) => send((s) => headingKnob(s, n, false))),
        {
          id: 'sync',
          label: 'Sync to heading',
          title: 'Set the bug to the current heading',
          onPress: () => send({ type: 'syncHeadingBug' }),
          wide: true,
        },
      ]}
      hint="Knob: drag, scroll or arrows 1°; Shift or Page Up/Down 10°. Double-click syncs."
    />
  );
  const altFt = state.panel.altPreselectFt;
  /** The selected altitude, typed: in the annunciator strip (steam) or under the knob (glass). */
  const altitudeEntry = (
    testId: string,
    className: string,
    valueClassName: string,
    label?: string,
  ) => (
    <ValueEntry
      testId={testId}
      text={altFt.toLocaleString('en-US')}
      editText={String(altFt)}
      parse={parseAltitude}
      onSet={(ft) => send({ type: 'altPreselect', ft })}
      name="Selected altitude"
      rangeHint="an altitude, 0 to 18,000 feet in hundreds"
      label={label}
      className={className}
      labelClassName="knob-entry-label"
      valueClassName={valueClassName}
      maxLength={6}
      title="Selected altitude, feet: click to set it"
      steps={altitudeSteps((ft) => send((s) => altitudeKnob(s, ft / 100, false)))}
      hint="Knob: drag, scroll or arrows 100 ft; Shift or Page Up/Down 1,000 ft."
    />
  );
  return (
    <section className="ap" aria-label="Autopilot">
      {annunciator && (
        <div
          className="ap-annunciator"
          role="status"
          aria-label="Autopilot modes"
          data-testid="annunciator"
        >
          {/* Modes on the left; one selected-value window above each knob on the right. */}
          <div className="ap-modes">
            <span className={`ann ann-ap${a.ap ? ' on' : ''}`} data-testid="ann-ap">
              AP
            </span>
            <span className="ann ann-active" data-testid="ann-lateral">
              {a.lateral ?? ''}
            </span>
            <span className="ann ann-armed" data-testid="ann-lateral-armed">
              {a.lateralArmed ?? ''}
            </span>
            <span className="ann ann-active" data-testid="ann-vertical">
              {a.vertical ?? ''}
            </span>
            <span className="ann ann-armed" data-testid="ann-vertical-armed">
              {a.verticalArmed.join(' ')}
            </span>
          </div>
          <div className="ap-sel">
            {headingEntry('ann-hdg-sel', 'ann ann-sel', 'ann-sel-value')}
            {altitudeEntry('ann-alt-sel', 'ann ann-sel', 'ann-sel-value')}
            <span
              className="ann ann-sel"
              title="Selected vertical speed, feet per minute (VS mode)"
              data-testid="ann-vs-sel"
            >
              {vsMode ? fmtVs(state.ap.vsRefFpm) : ''}
            </span>
          </div>
        </div>
      )}
      <div className="ap-row">
        <div className="ap-buttons">
          {BUTTONS.map((b) => (
            <button
              key={b.id}
              type="button"
              className="ap-btn"
              aria-label={b.name}
              data-testid={`btn-${b.id}`}
              onClick={() => send({ type: 'button', button: b.id })}
            >
              {b.id}
            </button>
          ))}
        </div>
        <div className="ap-knobs">
          <Knob
            label="HDG"
            valueText={`heading bug ${hdg}`}
            testId="knob-hdg"
            onTurn={(n, big) => send((s) => headingKnob(s, n, big))}
            onPush={() => send({ type: 'syncHeadingBug' })}
            pushHint="Double-click (or Enter) to set the bug to the current heading"
            stepHint={['1°', '10°']}
            // Glass: no annunciator strip, so the heading window sits under the knob.
            below={
              annunciator
                ? undefined
                : headingEntry('knob-hdg-sel', 'knob-entry', 'knob-entry-value', 'HDG')
            }
          />
          <Knob
            label="ALT"
            valueText={`altitude preselect ${state.panel.altPreselectFt} feet`}
            testId="knob-alt"
            stepHint={['100 ft', '1,000 ft']}
            onTurn={(n, big) => send((s) => altitudeKnob(s, n, big))}
            below={
              annunciator
                ? undefined
                : altitudeEntry('knob-alt-sel', 'knob-entry', 'knob-entry-value', 'ALT')
            }
          />
          {/* VS: two buttons in the knob's place, up over down; they act only in VS mode. */}
          <div
            className="knob vs-steps"
            role="group"
            aria-label="Vertical speed"
            data-testid="vs-steps"
          >
            {(
              [
                ['up', VS_STEP_FPM, '+'],
                ['down', -VS_STEP_FPM, '−'],
              ] as const
            ).map(([id, fpm, sign]) => (
              <button
                key={id}
                type="button"
                className="vs-btn"
                data-testid={`btn-vs-${id}`}
                disabled={!vsMode}
                aria-label={`Vertical speed ${id} ${VS_STEP_FPM} feet per minute`}
                title={
                  vsMode
                    ? `Vertical speed ${id} ${VS_STEP_FPM} fpm`
                    : 'Vertical speed: press VS first (acts only in VS mode)'
                }
                onClick={() => send((s) => vsStep(s, fpm))}
              >
                {sign}
                {VS_STEP_FPM}
                <span className="vs-btn-unit">FPM</span>
              </button>
            ))}
            <span className="knob-label">VS</span>
          </div>
        </div>
      </div>
    </section>
  );
}
