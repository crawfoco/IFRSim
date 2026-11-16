/**
 * Glass airspeed tape: moving scale (ticks every 5 kt, labels every 10 kt), pointed readout
 * on ATT.cy, and a magenta 6-second trend vector.
 */
import { memo, useId } from 'react';
import { ATT, SPD, TAPE, type SpeedTapeProps } from './layout';
import { formatIas, TAPE_HALF_PX, tapeY, visibleTicks } from './tape-geometry';
import './tapes.css';

const R = SPD.x + SPD.w; // right edge, toward the attitude
const BOX_H = 26;

const Frame = memo(function Frame({ clipId }: { clipId: string }) {
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect x={SPD.x} y={TAPE.top} width={SPD.w} height={TAPE.bottom - TAPE.top} />
        </clipPath>
      </defs>
      <rect
        className="g-tape-bg"
        x={SPD.x}
        y={TAPE.top}
        width={SPD.w}
        height={TAPE.bottom - TAPE.top}
      />
    </>
  );
});

export function SpeedTape(p: SpeedTapeProps) {
  const clipId = `g-spd-clip${useId().replace(/:/g, '')}`;
  const ias = Math.max(0, p.iasKt);
  const halfKt = TAPE_HALF_PX / SPD.pxPerKt + 5;
  const ticks = visibleTicks(ias, 5, halfKt, 0).map((v) => {
    const y = tapeY(v, ias, SPD.pxPerKt);
    const major = v % 10 === 0;
    return (
      <g key={v}>
        <line className="g-tick" x1={R - (major ? 12 : 7)} y1={y} x2={R} y2={y} />
        {major && (
          <text className="g-tape-label" x={R - 16} y={y + 4} textAnchor="end">
            {v}
          </text>
        )}
      </g>
    );
  });
  const trendEnd = Math.max(TAPE.top, Math.min(TAPE.bottom, ATT.cy - p.trendKt * SPD.pxPerKt));
  const top = ATT.cy - BOX_H / 2;
  return (
    <g data-testid="pfd-speed-tape">
      <Frame clipId={clipId} />
      <g clipPath={`url(#${clipId})`}>
        {ticks}
        {Math.abs(p.trendKt) >= 0.5 && (
          <line
            data-testid="pfd-speed-trend"
            className="g-trend"
            x1={R - 3}
            y1={ATT.cy}
            x2={R - 3}
            y2={trendEnd}
          />
        )}
      </g>
      <path
        className="g-readout"
        d={`M${SPD.x + 4} ${top} H${R - 2} V${ATT.cy - 6} L${R + 6} ${ATT.cy} L${R - 2} ${ATT.cy + 6} V${top + BOX_H} H${SPD.x + 4} Z`}
      />
      <text
        data-testid="pfd-ias"
        className="g-readout-text"
        x={R - 8}
        y={ATT.cy + 6}
        textAnchor="end"
      >
        {formatIas(ias)}
      </text>
    </g>
  );
}
