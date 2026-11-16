/**
 * Briefing: pick a start condition and the glideslope status, read the brief, fly. The actual
 * weather (whether the runway will be in sight at minimums) is chosen at random when the
 * learner presses Fly, and stays hidden until the debrief.
 */
import { useMemo, useState } from 'react';
import { NAVDATA } from '../../procedures';
import type { Procedure } from '../../procedures/schema';
import {
  briefing,
  buildScenario,
  type PanelKind,
  type WeatherPick,
  panelOf,
  pickCeiling,
  type Scenario,
  type ScenarioOptions,
} from '../../sim/scenario/scenario';
import { ChartViewer } from '../chart/ChartViewer';

const WEATHER_PICKS: { id: WeatherPick; name: string }[] = [
  { id: 'random', name: 'Random (hidden)' },
  { id: 'above', name: 'In sight' },
  { id: 'below', name: 'Not in sight' },
];

const PANELS: { id: PanelKind; name: string }[] = [
  { id: 'steam', name: 'Steam gauges' },
  { id: 'glass', name: 'Glass PFD' },
];
/** The panel last chosen in this visit (not stored), so going back to the briefing keeps it. */
let lastPanel: PanelKind = 'steam';

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

export function BriefingCard({ scenario, compact }: { scenario: Scenario; compact?: boolean }) {
  const b = briefing(scenario);
  return (
    <section className={`brief${compact ? ' brief-compact' : ''}`} aria-label="Briefing">
      <h2>{b.title}</h2>
      <p className="brief-start">{b.startName}</p>
      <p className="clearance" data-testid="clearance">
        “{b.clearance}”
      </p>
      <dl>
        <dt>Weather</dt>
        <dd data-testid="brief-weather">{b.weather}</dd>
        <dt>Glideslope</dt>
        <dd data-testid="brief-gs">{b.glideslope}</dd>
        {/* On the flight screen these come from the plate. */}
        {!compact && (
          <>
            <dt>Minimums</dt>
            <dd data-testid="brief-minimums">{b.minimums}</dd>
            <dt>Missed approach</dt>
            <dd>{b.missedApproach}</dd>
          </>
        )}
      </dl>
      {b.hints.length > 0 && (
        <ul className="brief-hints" data-testid="brief-hints">
          {b.hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {!compact && b.notes.length > 0 && (
        <details className="brief-details" data-testid="brief-details">
          <summary>Details about this approach chart</summary>
          <ul className="brief-notes">
            {b.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function Briefing({
  procedure,
  onBack,
  onFly,
}: {
  procedure: Procedure;
  onBack: () => void;
  onFly: (s: Scenario) => void;
}) {
  const hasGs = procedure.approach.some((l) => l.type === 'final' && !!l.glideslope);
  const [opts, setOpts] = useState<ScenarioOptions>({
    startId: procedure.starts[0]!.id,
    ceiling: 'above',
    gsOutOfService: false,
    panel: lastPanel,
  });
  const scenario = useMemo(() => buildScenario(procedure, NAVDATA, opts), [procedure, opts]);
  const set = (o: Partial<ScenarioOptions>) => setOpts((p) => ({ ...p, ...o }));
  const random = () =>
    setOpts((p) => ({
      ...p,
      startId: pick(procedure.starts).id,
      gsOutOfService: hasGs ? Math.random() < 0.3 : false,
    }));

  return (
    <div className="briefing-screen">
      <header className="topbar">
        <button type="button" className="link-btn" onClick={onBack} data-testid="back">
          ← Approaches
        </button>
        <h1>Briefing</h1>
      </header>
      <aside className="plate-pane">
        <ChartViewer procedure={procedure} />
      </aside>
      <main className="briefing-main">
        <fieldset className="choice">
          <legend>Start condition</legend>
          {procedure.starts.map((s) => (
            <label key={s.id}>
              <input
                type="radio"
                name="start"
                value={s.id}
                checked={opts.startId === s.id}
                onChange={() => set({ startId: s.id })}
                data-testid={`start-${s.id}`}
              />
              {s.name}
            </label>
          ))}
        </fieldset>
        <fieldset className="choice choice-inline">
          <legend>Panel</legend>
          {PANELS.map((p) => (
            <label key={p.id}>
              <input
                type="radio"
                name="panel"
                value={p.id}
                checked={panelOf(opts) === p.id}
                onChange={() => {
                  lastPanel = p.id;
                  set({ panel: p.id });
                }}
                data-testid={`panel-${p.id}`}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
        <fieldset className="choice choice-inline">
          <legend>Runway at minimums</legend>
          {WEATHER_PICKS.map((w) => (
            <label key={w.id}>
              <input
                type="radio"
                name="weather"
                value={w.id}
                checked={(opts.weatherPick ?? 'random') === w.id}
                onChange={() => set({ weatherPick: w.id })}
                data-testid={`weather-${w.id}`}
              />
              {w.name}
            </label>
          ))}
        </fieldset>
        {hasGs && (
          <fieldset className="choice">
            <legend>Glideslope</legend>
            <label>
              <input
                type="checkbox"
                checked={opts.gsOutOfService}
                onChange={(e) => set({ gsOutOfService: e.target.checked })}
                data-testid="gs-out"
              />
              Out of service (LOC only)
            </label>
          </fieldset>
        )}
        <div className="briefing-actions">
          <button type="button" onClick={random} data-testid="random">
            Random
          </button>
          <button
            type="button"
            className="primary"
            onClick={() =>
              onFly(
                buildScenario(procedure, NAVDATA, {
                  ...opts,
                  ceiling: pickCeiling(opts.weatherPick, Math.random()),
                }),
              )
            }
            data-testid="fly"
          >
            Fly
          </button>
        </div>
        <BriefingCard scenario={scenario} />
      </main>
    </div>
  );
}
