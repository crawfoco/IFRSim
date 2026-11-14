/** Flight screen: plate and briefing on the left, instrument panel and autopilot on the right. */
import { APP_NAME, TRAINING_DISCLAIMER } from '../../app-info';
import { TIME_SCALES } from '../../sim/recorder';
import type { SimState } from '../../sim/state';
import { Altimeter } from '../instruments/Altimeter';
import { Asi } from '../instruments/Asi';
import { Cdi } from '../instruments/Cdi';
import { courseDeviation, glideslopeDeviation } from '../instruments/geometry';
import { Hsi } from '../instruments/Hsi';
import '../instruments/instruments.css';
import { Vsi } from '../instruments/Vsi';
import { ApPanel } from '../panel/ApPanel';
import { CourseKnob, DmeUnit } from '../panel/NavControls';
import { NavRadios } from '../panel/NavRadios';
import '../panel/panel.css';
import { PowerSelector } from '../panel/PowerSelector';
import { KCFO_BRIEFING, KCFO_DA_FT, KCFO_VECTORS_START, KCFO_WORLD } from './kcfoVectors';
import { useSim } from './useSim';

const atOrBelowDa = (s: SimState) => s.aircraft.altitudeFt <= KCFO_DA_FT;
const dotsText = (d: number, pos: string, neg: string) =>
  Math.abs(d) < 0.05 ? 'centred' : `${Math.abs(d).toFixed(1)} dots ${d > 0 ? pos : neg}`;

export function Flight() {
  const { sim, state, sensors } = useSim(KCFO_WORLD, KCFO_VECTORS_START, atOrBelowDa);
  const send = sim.send;
  const cdi1 = courseDeviation(sensors.nav1);
  const gs1 = glideslopeDeviation(sensors.nav1);
  const cdi2 = courseDeviation(sensors.nav2);
  const atDa = atOrBelowDa(state);

  return (
    <div className="flight">
      <header className="topbar">
        <h1>{APP_NAME}</h1>
        <p className="disclaimer">{TRAINING_DISCLAIMER}</p>
        <div className="sim-controls" role="group" aria-label="Simulation">
          <button
            type="button"
            data-testid="pause"
            onClick={() => sim.setPaused(!sim.paused)}
            disabled={atDa}
          >
            {sim.paused ? 'Resume' : 'Pause'}
          </button>
          <div className="seg" role="radiogroup" aria-label="Sim speed">
            {TIME_SCALES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={sim.timeScale === t}
                className={`seg-btn${sim.timeScale === t ? ' on' : ''}`}
                data-testid={`speed-${t}`}
                onClick={() => sim.setTimeScale(t)}
              >
                {t}×
              </button>
            ))}
          </div>
          <button type="button" data-testid="restart" onClick={() => sim.restart()}>
            Restart
          </button>
        </div>
      </header>

      <aside className="plate-pane" aria-label="Briefing and approach plate">
        <section className="briefing">
          <h2>{KCFO_BRIEFING.title}</h2>
          <p className="clearance">“{KCFO_BRIEFING.clearance}”</p>
          <ul>
            {KCFO_BRIEFING.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
        <div className="plate" tabIndex={0} aria-label="Approach plate, scrollable">
          <img
            src={`${import.meta.env.BASE_URL}charts/kcfo-ils26.png`}
            alt="KCFO ILS or LOC RWY 26 approach plate"
          />
        </div>
      </aside>

      <main className="panel-pane">
        {atDa && (
          <div className="da-banner" role="alert" data-testid="da-banner">
            <strong>Decision altitude.</strong> Runway in sight. LOC{' '}
            {cdi1.flag ? 'flagged' : dotsText(cdi1.dots, 'right', 'left')}, GS{' '}
            {!gs1 || gs1.flag ? 'flagged' : dotsText(gs1.dots, 'up', 'down')}.
            <button type="button" onClick={() => sim.restart()}>
              Fly again
            </button>
          </div>
        )}
        <NavRadios state={state} send={send} />
        <div className="inst-grid">
          <Asi iasKt={state.aircraft.iasKt} />
          <div className="inst-with-knob">
            <Hsi
              headingMagDeg={sensors.headingMagDeg}
              headingBugDeg={state.panel.headingBugDeg}
              courseDeg={state.radios.nav1.obsDeg}
              deviation={cdi1}
              glideslope={gs1}
            />
            <CourseKnob radio={1} state={state} send={send} />
          </div>
          <Altimeter altitudeFt={state.aircraft.altitudeFt} />
          <DmeUnit nm={sensors.dmeNm} state={state} send={send} />
          <div className="inst-with-knob">
            <Cdi obsDeg={state.radios.nav2.obsDeg} deviation={cdi2} />
            <CourseKnob radio={2} state={state} send={send} />
          </div>
          <Vsi vsFpm={state.aircraft.vsFpm} />
        </div>
        <div className="controls-row">
          <ApPanel state={state} send={send} />
          <PowerSelector state={state} send={send} />
        </div>
      </main>
    </div>
  );
}
