/** Briefing: pick a start condition and the weather/glideslope, read the brief, fly. */
import { useMemo, useState } from 'react';
import { NAVDATA } from '../../procedures';
import type { Procedure } from '../../procedures/schema';
import {
  briefing,
  buildScenario,
  type Ceiling,
  type Scenario,
  type ScenarioOptions,
} from '../../sim/scenario/scenario';
import { ChartViewer } from '../chart/ChartViewer';

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
        <dt>Minimums</dt>
        <dd data-testid="brief-minimums">{b.minimums}</dd>
        <dt>Missed approach</dt>
        <dd>{b.missedApproach}</dd>
      </dl>
      {!compact && b.notes.length > 0 && (
        <ul className="brief-notes">
          {b.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
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
  });
  const scenario = useMemo(() => buildScenario(procedure, NAVDATA, opts), [procedure, opts]);
  const set = (o: Partial<ScenarioOptions>) => setOpts((p) => ({ ...p, ...o }));
  const random = () =>
    setOpts({
      startId: pick(procedure.starts).id,
      ceiling: pick<Ceiling>(['above', 'below']),
      gsOutOfService: hasGs ? Math.random() < 0.3 : false,
    });

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
        <fieldset className="choice">
          <legend>Weather</legend>
          {(['above', 'below'] as const).map((c) => (
            <label key={c}>
              <input
                type="radio"
                name="ceiling"
                checked={opts.ceiling === c}
                onChange={() => set({ ceiling: c })}
                data-testid={`ceiling-${c}`}
              />
              {c === 'above' ? 'At or above minimums' : 'Below minimums (missed approach)'}
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
            onClick={() => onFly(scenario)}
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
