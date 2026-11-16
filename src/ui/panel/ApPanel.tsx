/** Generic GA autopilot: mode annunciator, mode buttons, HDG / ALT / VS knobs. */
import { annunciation, type ApButton } from '../../sim/autopilot/modes';
import type { SimState } from '../../sim/state';
import { altitudeKnob, formatCourse, headingKnob, vsKnob, type Send } from './controls';
import { Knob } from './Knob';

const BUTTONS: { id: ApButton; name: string }[] = [
  { id: 'AP', name: 'Autopilot on/off' },
  { id: 'HDG', name: 'Heading mode' },
  { id: 'NAV', name: 'Nav mode' },
  { id: 'APR', name: 'Approach mode' },
  { id: 'ALT', name: 'Altitude hold' },
  { id: 'VS', name: 'Vertical speed mode' },
];

const fmtVs = (fpm: number) => (fpm > 0 ? `+${fpm}` : String(fpm));

export function ApPanel({ state, send }: { state: SimState; send: Send }) {
  const a = annunciation(state.ap, state.ap.navKind);
  const vsMode = state.ap.vertical === 'VS' && state.ap.engaged;
  return (
    <section className="ap" aria-label="Autopilot">
      <div
        className="ap-annunciator"
        role="status"
        aria-label="Autopilot modes"
        data-testid="annunciator"
      >
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
          {a.vertical === 'VS' ? `VS ${fmtVs(state.ap.vsRefFpm)}` : (a.vertical ?? '')}
        </span>
        <span className="ann ann-armed" data-testid="ann-vertical-armed">
          {a.verticalArmed.join(' ')}
        </span>
        <span className="ann ann-sel" data-testid="ann-alt-sel">
          {state.panel.altPreselectFt.toLocaleString('en-US')} FT
        </span>
      </div>
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
            valueText={`heading bug ${formatCourse(state.panel.headingBugDeg)}`}
            testId="knob-hdg"
            onTurn={(n, big) => send((s) => headingKnob(s, n, big))}
            onPush={() => send({ type: 'syncHeadingBug' })}
            pushHint="Double-click (or Enter) to set the bug to the current heading"
          />
          <Knob
            label="ALT"
            valueText={`altitude preselect ${state.panel.altPreselectFt} feet`}
            testId="knob-alt"
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
