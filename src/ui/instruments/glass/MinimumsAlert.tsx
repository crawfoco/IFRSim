/**
 * Minimums on the Glass PFD: the DA/MDA value box below BARO (always visible, unlike the tape
 * bug, which the altitude readout covers at minimums), and the MINIMUMS alert beside the
 * altitude tape when the "Minimums." callout fires.
 */
import { ALT, ATT, MINS_BOX } from './layout';
import type { Minimums } from './layout';

export function MinimumsBox({ minimums }: { minimums: Minimums | null }) {
  if (!minimums) return null;
  const { x, y, w, h } = MINS_BOX;
  return (
    <g data-testid="pfd-mins-box">
      <rect className="g-box" x={x} y={y} width={w} height={h} rx={2} />
      <text className="g-text-sm" x={x + 5} y={y + h / 2} dominantBaseline="central">
        {minimums.kind}
      </text>
      <text
        className="g-mins-text"
        x={x + w - 5}
        y={y + h / 2}
        textAnchor="end"
        dominantBaseline="central"
        data-testid="pfd-mins-box-value"
      >
        {minimums.altFt.toLocaleString('en-US')}
      </text>
    </g>
  );
}

const ALERT = { w: 92, h: 20, x: ALT.x - 100, y: ATT.cy + 34 } as const;

export function MinimumsAlert({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <g data-testid="pfd-minimums" aria-hidden="true">
      <rect
        className="g-mins-alert"
        x={ALERT.x}
        y={ALERT.y}
        width={ALERT.w}
        height={ALERT.h}
        rx={2}
      />
      <text
        className="g-mins-alert-text"
        x={ALERT.x + ALERT.w / 2}
        y={ALERT.y + ALERT.h / 2}
        textAnchor="middle"
        dominantBaseline="central"
      >
        MINIMUMS
      </text>
    </g>
  );
}
