/** Approach select: every procedure by airport, name and chart cycle. */
import { APP_NAME, BUILD_STAMP, TRAINING_DISCLAIMER } from '../../app-info';
import type { Procedure } from '../../procedures/schema';
import { chartCycleText } from '../chart/ChartViewer';

export function Select({
  procedures,
  onPick,
}: {
  procedures: readonly Procedure[];
  onPick: (p: Procedure) => void;
}) {
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
        <ul className="select-list">
          {procedures.map((p) => (
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
          At DA/MDA, land if the runway is in sight; otherwise press GA and fly the missed approach.
        </li>
        <li>Review the debrief.</li>
      </ol>
      <p>On the briefing, choose the Steam gauges or the Glass PFD.</p>
    </aside>
  );
}
