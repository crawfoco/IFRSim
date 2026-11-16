/**
 * Glass altitude tape: moving scale (ticks every 20 ft, labels every 100 ft), pointed readout
 * on ATT.cy, cyan selected-altitude bug (pinned to the tape edge when off-scale) and readout
 * above the tape, and a DA/MDA minimums bracket. BARO is drawn elsewhere.
 */
import { memo, useId } from 'react';
import { ALT, ATT, SEL_ALT_BOX, TAPE, type AltTapeProps } from './layout';
import { formatAlt, onTape, pinY, TAPE_HALF_PX, tapeY, visibleTicks } from './tape-geometry';
import './tapes.css';

const L = ALT.x; // left edge, toward the attitude
const BOX_H = 26;
const BUG_HALF = 8;

const Frame = memo(function Frame({ clipId }: { clipId: string }) {
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect x={ALT.x} y={TAPE.top} width={ALT.w} height={TAPE.bottom - TAPE.top} />
        </clipPath>
      </defs>
      <rect
        className="g-tape-bg"
        x={ALT.x}
        y={TAPE.top}
        width={ALT.w}
        height={TAPE.bottom - TAPE.top}
      />
      <rect
        className="g-box"
        x={SEL_ALT_BOX.x}
        y={SEL_ALT_BOX.y}
        width={SEL_ALT_BOX.w}
        height={SEL_ALT_BOX.h}
      />
    </>
  );
});

export function AltTape(p: AltTapeProps) {
  const clipId = `g-alt-clip${useId().replace(/:/g, '')}`;
  const alt = p.altitudeFt;
  const halfFt = TAPE_HALF_PX / ALT.pxPerFt + 20;
  const ticks = visibleTicks(alt, 20, halfFt).map((v) => {
    const y = tapeY(v, alt, ALT.pxPerFt);
    const major = v % 100 === 0;
    return (
      <g key={v}>
        <line className="g-tick" x1={L} y1={y} x2={L + (major ? 12 : 6)} y2={y} />
        {major && (
          <text className="g-tape-label" x={L + 16} y={y + 4}>
            {v}
          </text>
        )}
      </g>
    );
  });

  const bug = pinY(
    tapeY(p.selectedAltFt, alt, ALT.pxPerFt),
    TAPE.top + BUG_HALF,
    TAPE.bottom - BUG_HALF,
  );
  const minsY = p.minimums ? tapeY(p.minimums.altFt, alt, ALT.pxPerFt) : null;
  const top = ATT.cy - BOX_H / 2;

  return (
    <g data-testid="pfd-alt-tape">
      <Frame clipId={clipId} />
      <g clipPath={`url(#${clipId})`}>
        {ticks}
        {p.minimums && minsY !== null && onTape(minsY) && (
          <g data-testid="pfd-mins-bug" transform={`translate(0 ${Math.round(minsY * 10) / 10})`}>
            <path
              className="g-mins"
              d={`M${L + ALT.w - 2} -7 h-6 v14 h6 M${L + ALT.w - 8} 0 h-10`}
            />
            <text className="g-mins-text" x={L + ALT.w - 20} y={-3} textAnchor="end">
              {p.minimums.kind}
            </text>
          </g>
        )}
      </g>
      <path
        data-testid="pfd-alt-bug"
        data-pinned={bug.pinned ?? 'no'}
        className="g-bug-shape"
        transform={`translate(0 ${Math.round(bug.y * 10) / 10})`}
        d={`M${L} ${-BUG_HALF} h8 v${BUG_HALF * 2} h-8 v-5 l4 -3 l-4 -3 z`}
      />
      <path
        className="g-readout"
        d={`M${L + ALT.w - 2} ${top} H${L + 2} V${ATT.cy - 6} L${L - 6} ${ATT.cy} L${L + 2} ${ATT.cy + 6} V${top + BOX_H} H${L + ALT.w - 2} Z`}
      />
      <text
        data-testid="pfd-alt"
        className="g-readout-text"
        x={L + ALT.w - 6}
        y={ATT.cy + 6}
        textAnchor="end"
      >
        {formatAlt(alt)}
      </text>
      <text
        data-testid="pfd-sel-alt"
        className="g-bug-text"
        x={SEL_ALT_BOX.x + SEL_ALT_BOX.w / 2}
        y={SEL_ALT_BOX.y + SEL_ALT_BOX.h - 2.5}
        textAnchor="middle"
      >
        {Math.round(p.selectedAltFt)}
      </text>
    </g>
  );
}
