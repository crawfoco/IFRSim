/**
 * Debrief: score table, plan view of the flown track over the procedure (or the approach
 * plate), altitude profile against the minimum altitudes, a chart-style final-approach
 * profile against distance to the threshold, event timeline, and a replay at 1×, 4× or 16×.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILD_STAMP } from '../../app-info';
import type { LoggedCommand } from '../../sim/recorder';
import { activeMinimums, panelOf, type Scenario, waasOf } from '../../sim/scenario/scenario';
import { analyzeFlight } from '../../sim/scoring/analyze';
import { clock } from '../../sim/scoring/rules/types';
import { ChartViewer } from '../chart/ChartViewer';
import { fitPlate, PLATE_CALIBRATION } from '../chart/overlay';
import { PlateTrack } from '../chart/PlateTrack';
import { finalProfile } from '../map/finalProfile';
import { FinalProfileView } from '../map/FinalProfileView';
import { PlanView } from '../map/PlanView';
import { ProfileView } from '../map/ProfileView';
import '../map/map.css';

const REPLAY_SPEEDS = [1, 4, 16] as const;
type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

const STATUS_ICON = { pass: '✓', fail: '✗', info: 'ℹ' } as const;

/** Replay position in sample (second) units, advanced by requestAnimationFrame while playing. */
function useReplay(length: number) {
  const [pos, setPos] = useState(Math.max(0, length - 1));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(4);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const frame = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setPos((p) => {
        const next = p + dt * speed;
        if (next >= length - 1) {
          setPlaying(false);
          return length - 1;
        }
        return next;
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [playing, speed, length]);
  return {
    index: Math.floor(pos),
    playing,
    speed,
    setSpeed,
    seek: (i: number) => setPos(Math.max(0, Math.min(length - 1, i))),
    toggle: () => {
      if (!playing && pos >= length - 1) setPos(0);
      setPlaying(!playing);
    },
  };
}

export function Debrief({
  scenario,
  log,
  endTick,
  onFlyAgain,
  onMainMenu,
}: {
  scenario: Scenario;
  log: readonly LoggedCommand[];
  endTick: number;
  onFlyAgain: () => void;
  /** Back to the main menu (the approach list). */
  onMainMenu: () => void;
}) {
  const a = useMemo(() => analyzeFlight(scenario, log, endTick), [scenario, log, endTick]);
  const replay = useReplay(a.samples.length);
  const t0 = a.samples[0]?.tick ?? 0;
  const seekTick = (tick: number) => replay.seek(Math.round((tick - t0) / 20));
  const mins = useMemo(
    () =>
      activeMinimums(
        scenario.procedure,
        scenario.options.gsOutOfService,
        scenario.start.iasKt,
        waasOf(scenario.options),
      ),
    [scenario],
  );
  const plateOverlay = useMemo(() => {
    const cal = PLATE_CALIBRATION[scenario.procedure.id];
    if (!cal) return null;
    const fit = fitPlate(cal, scenario);
    const track = a.samples.map((x) => ({ latDeg: x.latDeg, lonDeg: x.lonDeg }));
    return {
      errorNm: Math.max(...fit.residuals.map((r) => r.px)) / fit.scalePxPerNm,
      overlay: {
        width: cal.imageW,
        height: cal.imageH,
        content: <PlateTrack cal={cal} fit={fit} track={track} />,
      },
    };
  }, [scenario, a.samples]);
  const fp = useMemo(
    () => finalProfile(scenario, mins, a.sequencer.route, a.samples),
    [scenario, mins, a],
  );
  const [leftTab, setLeftTab] = useState<'plan' | 'plate'>('plan');
  const cur = a.samples[Math.min(replay.index, a.samples.length - 1)];
  const scored = a.items.filter((x) => x.status !== 'info');

  return (
    <div className="debrief">
      <header className="topbar">
        <button type="button" className="link-btn" onClick={onMainMenu} data-testid="debrief-back">
          ← Main menu
        </button>
        <h1>
          Debrief · {scenario.procedure.airport} {scenario.procedure.name}
        </h1>
        <div className="sim-controls">
          <button type="button" onClick={onFlyAgain} data-testid="fly-again">
            Fly again
          </button>
        </div>
      </header>

      <main className="debrief-main">
        <section className="debrief-left">
          <div className="seg debrief-tabs" role="tablist" aria-label="Left panel">
            {(['plan', 'plate'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={leftTab === t}
                className={`seg-btn${leftTab === t ? ' on' : ''}`}
                onClick={() => setLeftTab(t)}
                data-testid={`debrief-tab-${t}`}
              >
                {t === 'plan' ? 'Plan' : 'Plate'}
              </button>
            ))}
          </div>
          {/* Plan: the track, replay and profiles. Plate: the plate alone, using the whole column. */}
          {leftTab === 'plan' ? (
            <>
              <PlanView
                scenario={scenario}
                route={a.sequencer.route}
                track={a.samples}
                cursor={replay.index}
              />
              <div className="replay" role="group" aria-label="Replay">
                <button type="button" onClick={replay.toggle} data-testid="replay-play">
                  {replay.playing ? 'Pause' : 'Replay'}
                </button>
                <div className="seg" role="radiogroup" aria-label="Replay speed">
                  {REPLAY_SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={replay.speed === s}
                      className={`seg-btn${replay.speed === s ? ' on' : ''}`}
                      onClick={() => replay.setSpeed(s)}
                      data-testid={`replay-${s}`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, a.samples.length - 1)}
                  value={replay.index}
                  onChange={(e) => replay.seek(Number(e.target.value))}
                  aria-label="Replay position"
                  data-testid="replay-scrub"
                />
                <span className="replay-time" data-testid="replay-time">
                  {cur
                    ? `${clock(cur.tick)} · ${Math.round(cur.altitudeFt).toLocaleString('en-US')} ft`
                    : ''}
                </span>
              </div>
              <ProfileView
                samples={a.samples}
                minimums={{ label: `${mins.kind} ${mins.altFt}`, altFt: mins.altFt }}
                cursor={replay.index}
              />
              {a.samples.length >= 2 && (
                <FinalProfileView data={fp} minimums={mins} cursor={replay.index} />
              )}
            </>
          ) : (
            <div className="debrief-plate">
              {plateOverlay && (
                <p className="debrief-overlay-note" data-testid="plate-track-note">
                  Your track on the plan view (fitted to the plate within about{' '}
                  {plateOverlay.errorNm.toFixed(1)} NM). Plates draw holds and procedure turns
                  schematically.
                </p>
              )}
              <ChartViewer procedure={scenario.procedure} overlay={plateOverlay?.overlay} />
            </div>
          )}
        </section>

        <section className="debrief-right">
          {a.samples.length < 2 && (
            <p className="debrief-empty" data-testid="debrief-empty">
              Not enough flight was recorded to score. Fly for a while, then end the flight.
            </p>
          )}
          <div className="score" data-testid="score">
            <span className="score-pct">{a.scorePct}%</span>
            <span className="score-sub">
              {scored.filter((x) => x.status === 'pass').length} of {scored.length} items passed
            </span>
          </div>
          <p className="debrief-weather" data-testid="debrief-weather">
            Actual weather: ceiling {scenario.weather.ceilingFtAgl.toLocaleString('en-US')} ft,
            visibility {scenario.weather.visibilitySm} SM:{' '}
            {scenario.options.ceiling === 'above'
              ? `the runway came into sight by the ${mins.kind}.`
              : `below minimums; the runway was not in sight at the ${mins.kind}.`}
          </p>
          <p className="debrief-weather" data-testid="debrief-panel">
            Panel: {panelOf(scenario.options) === 'glass' ? 'Glass PFD' : 'Steam gauges'}
          </p>
          <table className="score-table" data-testid="score-table">
            <tbody>
              {a.items.map((x) => (
                <tr
                  key={x.id}
                  className={`row-${x.status}`}
                  onClick={() => x.tick !== undefined && seekTick(x.tick)}
                  data-testid={`item-${x.id}`}
                >
                  <td className="score-icon" aria-label={x.status}>
                    {STATUS_ICON[x.status]}
                  </td>
                  <td>
                    <div className="score-title">{x.title}</div>
                    <div className="score-measured">{x.measured}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="timeline-head">Timeline</h2>
          <ol className="timeline" data-testid="timeline">
            {a.timeline.map((e, i) => (
              <li key={i} className={`tl-${e.kind}`}>
                <button type="button" className="tl-btn" onClick={() => seekTick(e.tick)}>
                  <span className="tl-time">{clock(e.tick)}</span> {e.text}
                </button>
              </li>
            ))}
          </ol>
          <footer className="build-stamp" data-testid="debrief-build-stamp">
            {BUILD_STAMP}
          </footer>
        </section>
      </main>
    </div>
  );
}
