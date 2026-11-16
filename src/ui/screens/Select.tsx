/**
 * Approach select: every procedure by airport, name and chart cycle, in two tabs: the radio
 * approaches (ILS, LOC, VOR) and the RNAV (GPS) approaches.
 */
import { useState } from 'react';
import { APP_NAME, BUILD_STAMP, TRAINING_DISCLAIMER } from '../../app-info';
import type { Procedure } from '../../procedures/schema';
import { chartCycleText } from '../chart/ChartViewer';

/** The tab last shown in this visit (not stored), so coming back keeps it. */
let lastTab: 'radio' | 'rnav' = 'radio';

export function Select({
  procedures,
  rnavProcedures = [],
  onPick,
}: {
  procedures: readonly Procedure[];
  rnavProcedures?: readonly Procedure[];
  onPick: (p: Procedure) => void;
}) {
  const [tab, setTab] = useState<'radio' | 'rnav'>(lastTab);
  // Alphabetical by airport, then by procedure name.
  const shown = [...(tab === 'rnav' ? rnavProcedures : procedures)].sort(
    (a, b) => a.airport.localeCompare(b.airport) || a.name.localeCompare(b.name),
  );
  return (
    <main className="select">
      <header className="select-head">
        <h1>{APP_NAME}</h1>
        <p className="disclaimer">{TRAINING_DISCLAIMER}</p>
        <p className="select-intro">
          Choose an approach. You fly it by driving the autopilot and nav radios; the aircraft flies
          itself, the procedure is up to you.
        </p>
      </header>
      <div className="select-body">
        <HowToFly />
        <div className="select-main">
          {rnavProcedures.length > 0 && (
            <div className="seg select-tabs" role="tablist" aria-label="Approach type">
              {(
                [
                  ['radio', 'ILS · LOC · VOR'],
                  ['rnav', 'RNAV (GPS)'],
                ] as const
              ).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`seg-btn${tab === id ? ' on' : ''}`}
                  data-testid={`tab-${id}`}
                  onClick={() => {
                    lastTab = id;
                    setTab(id);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <ul className={`select-list${shown.length > 6 ? ' select-list-compact' : ''}`}>
            {shown.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="select-card"
                  data-testid={`pick-${p.id}`}
                  onClick={() => onPick(p)}
                >
                  <span className="select-airport">{p.airport}</span>
                  <span className="select-name">{p.name}</span>
                  <span className="select-cycle">{chartCycleText(p)}</span>
                  <span className="select-starts">
                    {p.starts.length} start condition{p.starts.length === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <footer className="build-stamp" data-testid="build-stamp">
        {APP_NAME} {BUILD_STAMP}
      </footer>
    </main>
  );
}

/** Always-visible quick steps beside the approach list. */
export function HowToFly() {
  return (
    <aside className="how-to-fly" data-testid="how-to-fly" aria-labelledby="how-to-fly-title">
      <h2 id="how-to-fly-title">How to fly</h2>
      <ol>
        <li>Pick an approach and start.</li>
        <li>Read the briefing and the plate.</li>
        <li>Tune and identify the navaids, then fly with the autopilot.</li>
        <li>
          At DA/MDA, if the runway is in sight, continue and the sim lands automatically; if not,
          press GA and fly the missed approach.
        </li>
        <li>Review the debrief.</li>
      </ol>
      <p>On the briefing, choose the Steam gauges or the Glass PFD.</p>
    </aside>
  );
}
