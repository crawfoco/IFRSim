/**
 * Debrief: score table, plan view of the flown track over the procedure, altitude profile
 * against the minimum altitudes, event timeline, and a replay at 1×, 4× or 16×.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoggedCommand } from '../../sim/recorder';
import { activeMinimums, type Scenario } from '../../sim/scenario/scenario';
import { analyzeFlight } from '../../sim/scoring/analyze';
import { clock } from '../../sim/scoring/rules/types';
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
  onBriefing,
}: {
  scenario: Scenario;
  log: readonly LoggedCommand[];
  endTick: number;
  onFlyAgain: () => void;
  onBriefing: () => void;
}) {
  const a = useMemo(() => analyzeFlight(scenario, log, endTick), [scenario, log, endTick]);
  const replay = useReplay(a.samples.length);
  const t0 = a.samples[0]?.tick ?? 0;
  const seekTick = (tick: number) => replay.seek(Math.round((tick - t0) / 20));
  const mins = activeMinimums(
    scenario.procedure,
    scenario.options.gsOutOfService,
    scenario.start.iasKt,
  );
  const cur = a.samples[Math.min(replay.index, a.samples.length - 1)];
  const scored = a.items.filter((x) => x.status !== 'info');

  return (
    <div className="debrief">
      <header className="topbar">
        <button type="button" className="link-btn" onClick={onBriefing} data-testid="debrief-back">
          ← Briefing
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
        </section>
      </main>
    </div>
  );
}
