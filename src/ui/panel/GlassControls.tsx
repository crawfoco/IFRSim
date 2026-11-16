/** Glass panel buttons: CDI (HSI nav source) and the two bearing-pointer selectors. */
import { sourceLabel, type BearingSource } from '../../sim/nav/source';
import type { SimState } from '../../sim/state';
import type { Send } from './controls';

const brgText = (s: BearingSource) => s ?? 'OFF';

export function GlassControls({ state, send }: { state: SimState; send: Send }) {
  const { cdiSource, brg1, brg2 } = state.panel;
  const btn = (
    testId: string,
    label: string,
    value: string,
    title: string,
    onClick: () => void,
  ) => (
    <button
      type="button"
      className="glass-btn"
      data-testid={testId}
      title={title}
      aria-label={`${label}: ${value}. ${title}`}
      onClick={onClick}
    >
      <span className="glass-btn-label">{label}</span>
      <span className="glass-btn-value">{value}</span>
    </button>
  );
  return (
    <div className="glass-controls" role="group" aria-label="HSI sources">
      {btn(
        'btn-cdi',
        'CDI',
        sourceLabel(cdiSource),
        'Switch the HSI and autopilot nav source',
        () => send({ type: 'cdi' }),
      )}
      {btn('btn-brg1', 'BRG1', brgText(brg1), 'Bearing pointer 1: off, NAV1, NAV2', () =>
        send({ type: 'bearing', pointer: 1 }),
      )}
      {btn('btn-brg2', 'BRG2', brgText(brg2), 'Bearing pointer 2: off, NAV1, NAV2', () =>
        send({ type: 'bearing', pointer: 2 }),
      )}
    </div>
  );
}
