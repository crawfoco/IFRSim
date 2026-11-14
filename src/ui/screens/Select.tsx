/** Approach select: every procedure by airport, name and chart cycle. */
import { APP_NAME, TRAINING_DISCLAIMER } from '../../app-info';
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
    </main>
  );
}
