/** Generic GA autopilot: mode annunciator, mode buttons, HDG / ALT / VS knobs. */
import { annunciation, type ApButton } from '../../sim/autopilot/modes';
import type { SimState } from '../../sim/state';
import {
  altitudeKnob,
  formatCourse,
  headingKnob,
  parseDegrees,
  vsKnob,
  type Send,
} from './controls';
import { Knob } from './Knob';
import { degreeSteps, ValueEntry } from './ValueEntry';

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
            <span className="ann ann-sel" title="Selected altitude, feet" data-testid="ann-alt-sel">
              {state.panel.altPreselectFt.toLocaleString('en-US')}
            </span>
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
          />
          <Knob
            label="VS"
            valueText={
              vsMode ? `vertical speed ${fmtVs(state.ap.vsRefFpm)} fpm` : 'inactive outside VS mode'
            }
            testId="knob-vs"
            disabled={!vsMode}
            onTurn={(n) => send((s) => vsKnob(s, n))}
          />
        </div>
      </div>
    </section>
  );
}
