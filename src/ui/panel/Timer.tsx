/** Stopwatch for holds, procedure turns and FAF-to-MAP timing: the time, Start/Stop and Reset below. */
import type { SimState } from '../../sim/state';
import type { Send } from './controls';

export function formatTimer(s: number): string {
  const t = Math.floor(s + 1e-6);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function Timer({ state, send }: { state: SimState; send: Send }) {
  const { running, elapsedS } = state.timer;
  return (
    <div className="timer" role="group" aria-label="Timer">
      <span className="timer-value" data-testid="timer-value" aria-live="off">
        {formatTimer(elapsedS)}
      </span>
      <div className="timer-btns">
        <button
          type="button"
          className="seg-btn"
          data-testid="timer-startstop"
          onClick={() => send({ type: 'timer', action: 'startStop' })}
        >
          {running ? 'Stop' : 'Start'}
        </button>
        <button
          type="button"
          className="seg-btn"
          data-testid="timer-reset"
          onClick={() => send({ type: 'timer', action: 'reset' })}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
