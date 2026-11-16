/**
 * Glass vertical speed scale right of the altitude tape: fixed ticks to ±2000 fpm, a pointer
 * at the current VS (clamped), VS digits when |vs| ≥ 100, and the cyan selected-VS bug.
 */
import { memo } from 'react';
import { TAPE, VSI, type VsiProps } from './layout';
import { formatVs, vsiY } from './tape-geometry';
import './tapes.css';

const X = VSI.x;
const r1 = (n: number) => Math.round(n * 10) / 10;

const Scale = memo(function Scale() {
  const items = [];
  for (const fpm of [-2000, -1500, -1000, -500, 0, 500, 1000, 1500, 2000]) {
    const y = vsiY(fpm);
    const major = fpm % 1000 === 0;
    items.push(<line key={fpm} className="g-tick" x1={X} y1={y} x2={X + (major ? 9 : 5)} y2={y} />);
    if (major && fpm !== 0) {
      items.push(
        <text key={`l${fpm}`} className="g-text-sm" x={X + 12} y={y + 3.5}>
          {Math.abs(fpm) / 1000}
        </text>,
      );
    }
  }
  return (
    <g>
      <rect
        className="g-tape-bg"
        x={X}
        y={TAPE.top}
        width={VSI.w}
        height={TAPE.bottom - TAPE.top}
      />
      {items}
    </g>
  );
});

export function VsiScale(p: VsiProps) {
  const y = r1(vsiY(p.vsFpm));
  const digits = formatVs(p.vsFpm);
  return (
    <g data-testid="pfd-vsi">
      <Scale />
      {p.selectedVsFpm !== null && (
        <path
          data-testid="pfd-vs-bug"
          className="g-bug-shape"
          transform={`translate(0 ${r1(vsiY(p.selectedVsFpm))})`}
          d={`M${X} -5 h5 v10 h-5 v-3 l3 -2 l-3 -2 z`}
        />
      )}
      <g data-testid="pfd-vsi-pointer" transform={`translate(0 ${y})`}>
        <path className="g-vsi-pointer" d={`M${X + 2} 0 l10 -6 v12 z`} />
        {digits !== null && (
          <text className="g-text-sm" x={X + 14} y={p.vsFpm > 0 ? -4 : 11}>
            {digits}
          </text>
        )}
      </g>
    </g>
  );
}
