/** Flight screen: briefing and plate on the left, instrument panel and autopilot on the right. */
import { BUILD_STAMP, TRAINING_DISCLAIMER } from '../../app-info';
import { useEffect, useMemo } from 'react';
import { TIME_SCALES, type LoggedCommand } from '../../sim/recorder';
import { buildRoute } from '../../sim/scoring/sequencer';
import { PlanView } from '../map/PlanView';
import '../map/map.css';
import { activeMinimums, panelOf, type Scenario } from '../../sim/scenario/scenario';
import { radioOf } from '../../sim/nav/source';
import { Pfd } from '../instruments/glass/Pfd';
import { pfdData } from '../instruments/glass/pfd-data';
import { minimumsAlertOn, minimumsEventTick, modeBarFields } from '../instruments/glass/modes';
import { playMinimumsChime } from '../audio/alert';
import { ChartViewer } from '../chart/ChartViewer';
import { Altimeter } from '../instruments/Altimeter';
import { Asi } from '../instruments/Asi';
import { Cdi } from '../instruments/Cdi';
import { courseDeviation, glideslopeDeviation } from '../instruments/geometry';
import { Hsi } from '../instruments/Hsi';
import { OutsideView } from '../instruments/OutsideView';
import { outsideView } from '../../sim/scenario/outside';
import '../instruments/instruments.css';
import { Vsi } from '../instruments/Vsi';
import { ApPanel } from '../panel/ApPanel';
import { GlassControls } from '../panel/GlassControls';
import { CourseKnob, DmeUnit } from '../panel/NavControls';
import { NavRadios } from '../panel/NavRadios';
import '../panel/panel.css';
import { PowerSelector } from '../panel/PowerSelector';
import { Timer } from '../panel/Timer';
import { BriefingCard } from './Briefing';
import { useSim } from './useSim';

const OUTCOME_TEXT = {
  landed: 'Landed with the runway in sight. Approach complete.',
  belowMinimums: 'Continued below minimums without the runway in sight.',
  missedComplete: 'Missed approach and hold flown. Scenario complete.',
} as const;

export function Flight({
  scenario,
  onExit,
  onDebrief,
  onFlyAgain,
}: {
  scenario: Scenario;
  onExit: () => void;
  /** A new flight of the same scenario, with new hidden weather (Restart and Fly again). */
  onFlyAgain: () => void;
  onDebrief: (log: readonly LoggedCommand[], endTick: number) => void;
}) {
  const { sim, state, sensors, progress } = useSim(scenario);
  const send = sim.send;
  const cdi1 = courseDeviation(sensors.nav1);
  const gs1 = glideslopeDeviation(sensors.nav1);
  const cdi2 = courseDeviation(sensors.nav2);
  const route = useMemo(() => buildRoute(scenario), [scenario]);
  const glass = panelOf(scenario.options) === 'glass';
  // Glass: the aural minimums alert, once per "Minimums." event.
  const minsTick = minimumsEventTick(progress);
  useEffect(() => {
    if (glass && minsTick !== null) playMinimumsChime();
  }, [glass, minsTick]);
  const iasCmdKt = state.panel.iasCmdKt;
  const minimums = useMemo(
    () => activeMinimums(scenario.procedure, scenario.options.gsOutOfService, iasCmdKt),
    [scenario, iasCmdKt],
  );

  return (
    <div className="flight" data-tick={state.tick}>
      <header className="topbar">
        <button type="button" className="link-btn" onClick={onExit} data-testid="exit">
          ← Briefing
        </button>
        <h1>
          {scenario.procedure.airport} {scenario.procedure.name}
        </h1>
        <p className="disclaimer" title={BUILD_STAMP}>
          {TRAINING_DISCLAIMER}
        </p>
        <div className="sim-controls" role="group" aria-label="Simulation">
          <button
            type="button"
            data-testid="pause"
            onClick={() => sim.setPaused(!sim.paused)}
            disabled={sim.ended}
          >
            {sim.paused && !sim.ended ? 'Resume' : 'Pause'}
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
          <button
            type="button"
            data-testid="restart"
            title="Start this approach again, with new hidden weather"
            onClick={onFlyAgain}
          >
            Restart
          </button>
          <button
            type="button"
            className={state.panel.mapOn ? 'on' : ''}
            aria-pressed={state.panel.mapOn}
            title="Moving map (a training aid; noted in the debrief)"
            data-testid="map-toggle"
            onClick={() => send({ type: 'map', on: !state.panel.mapOn })}
          >
            Map
          </button>
          <button
            type="button"
            data-testid="end-flight"
            onClick={() => onDebrief([...sim.log], sim.tick)}
          >
            {sim.ended ? 'Debrief' : 'End flight'}
          </button>
        </div>
      </header>

      <aside className="plate-pane" aria-label="Briefing and approach plate">
        <BriefingCard scenario={scenario} compact />
        {progress.callout && (
          <div
            className={`callout${progress.phase === 'ended' ? ' callout-end' : progress.phase === 'missed' ? ' callout-missed' : ''}`}
            role="alert"
            data-testid="callout"
          >
            <p>{progress.callout}</p>
            {progress.phase === 'ended' && progress.outcome && (
              <div className="callout-end-row">
                <strong data-testid="outcome">{OUTCOME_TEXT[progress.outcome]}</strong>
                <button
                  type="button"
                  data-testid="debrief"
                  onClick={() => onDebrief([...sim.log], sim.tick)}
                >
                  Debrief
                </button>
                <button type="button" onClick={onFlyAgain}>
                  Fly again
                </button>
                <button type="button" onClick={onExit}>
                  Choose another approach
                </button>
              </div>
            )}
          </div>
        )}
        {state.panel.mapOn && (
          <div className="moving-map">
            <PlanView
              scenario={scenario}
              route={route}
              track={[
                ...sim.track,
                {
                  latDeg: state.aircraft.position.latDeg,
                  lonDeg: state.aircraft.position.lonDeg,
                  headingTrueDeg: state.aircraft.headingTrueDeg,
                },
              ]}
              fitTrack={false}
              label="Moving map"
              testId="moving-map"
            />
          </div>
        )}
        {/* The map takes the plate's place while it is on; the plate is only hidden, so its
            zoom and pan are kept for when the map is switched off. */}
        <div className="plate-slot" hidden={state.panel.mapOn}>
          <ChartViewer procedure={scenario.procedure} />
        </div>
      </aside>

      <main className="panel-pane">
        <OutsideView
          view={outsideView(state, scenario)}
          altitudeFt={state.aircraft.altitudeFt}
          baseFtMsl={scenario.weather.baseFtMsl}
        />
        <NavRadios
          state={state}
          send={send}
          idents={{ 1: sensors.nav1.ident, 2: sensors.nav2.ident }}
          autoId={glass}
        />
        {glass ? (
          <div className="glass-row">
            <Pfd
              data={pfdData(state, sensors, scenario.world, minimums)}
              modes={modeBarFields(state.ap)}
              minimumsAlert={minimumsAlertOn(progress, state.tick)}
            />
            <div className="glass-side">
              <GlassControls state={state} send={send} />
              {/* One CRS knob, for the CDI's source (VLOC1 or VLOC2), as on a glass panel. */}
              <div className="glass-knobs">
                <CourseKnob
                  radio={radioOf(state.panel.cdiSource)}
                  state={state}
                  send={send}
                  label="CRS"
                  testId="knob-crs"
                />
              </div>
              <DmeUnit nm={sensors.dmeNm} state={state} send={send} readout={false} />
              <Timer state={state} send={send} />
            </div>
          </div>
        ) : (
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
            <div className="dme-timer">
              <DmeUnit nm={sensors.dmeNm} state={state} send={send} />
              <Timer state={state} send={send} />
            </div>
            <div className="inst-with-knob">
              <Cdi obsDeg={state.radios.nav2.obsDeg} deviation={cdi2} />
              <CourseKnob radio={2} state={state} send={send} />
            </div>
            <Vsi vsFpm={state.aircraft.vsFpm} />
          </div>
        )}
        <div className="controls-row">
          <ApPanel state={state} send={send} annunciator={!glass} />
          <PowerSelector state={state} send={send} />
        </div>
      </main>
    </div>
  );
}
