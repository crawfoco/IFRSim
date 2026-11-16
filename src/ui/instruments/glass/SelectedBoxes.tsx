/** Glass PFD selected-value boxes: HDG bug, CRS (CDI source) and BARO. The selected ALT is on the altitude tape. */
import { memo } from 'react';
import { BARO_BOX, CRS_BOX, HDG_BOX } from './layout';

const pad3 = (deg: number) => String(Math.round(deg) % 360 || 360).padStart(3, '0');

function Box({
  x,
  y,
  w,
  h,
  label,
  value,
  testId,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <g data-testid={testId}>
      <rect className="g-box" x={x} y={y} width={w} height={h} rx={2} />
      <text className="g-text-sm" x={x + 5} y={y + h / 2} dominantBaseline="central">
        {label}
      </text>
      <text
        className="g-bug-text"
        x={x + w - 5}
        y={y + h / 2}
        textAnchor="end"
        dominantBaseline="central"
        data-testid={`${testId}-value`}
      >
        {value}
      </text>
    </g>
  );
}

export const SelectedBoxes = memo(function SelectedBoxes({
  headingBugDeg,
  courseDeg,
  baroInHg,
}: {
  headingBugDeg: number;
  courseDeg: number;
  baroInHg: number;
}) {
  return (
    <g data-testid="pfd-boxes">
      <Box {...HDG_BOX} label="HDG" value={`${pad3(headingBugDeg)}°`} testId="pfd-hdg-box" />
      <Box {...CRS_BOX} label="CRS" value={`${pad3(courseDeg)}°`} testId="pfd-crs-box" />
      <Box {...BARO_BOX} label="BARO" value={`${baroInHg.toFixed(2)}IN`} testId="pfd-baro-box" />
    </g>
  );
});
