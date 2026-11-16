/**
 * Glass attitude: sky/ground behind the whole PFD, pitch ladder (clipped to a window around
 * the aircraft symbol), fixed bank scale with a rotating bank pointer, and the fixed yellow
 * own-aircraft symbol on top. Movement is a single transform per frame.
 */
import { memo, useId } from 'react';
import { ATT, type AttitudeProps } from './layout';
import './tapes.css';

const { cx, cy, pitchPx, bankR } = ATT;
/** Sky/ground half-size: covers 560×420 at ±60° bank plus ±20° (120 units) of pitch. */
const BIG = 800;
/** Ladder clip window around the attitude centre. */
const LADDER_HALF_W = 70;
const LADDER_HALF_H = 80;
const LADDER_MAX_DEG = 30;

/** The transform applied to everything that moves with the horizon. */
export function horizonTransform(pitchDeg: number, bankDeg: number): string {
  const r = Math.round(-bankDeg * 100) / 100;
  const t = Math.round(pitchDeg * pitchPx * 100) / 100;
  return `rotate(${r} ${cx} ${cy}) translate(0 ${t})`;
}

const SkyGround = memo(function SkyGround() {
  return (
    <>
      <rect className="g-sky" x={cx - BIG} y={cy - BIG} width={2 * BIG} height={BIG} />
      <rect className="g-ground" x={cx - BIG} y={cy} width={2 * BIG} height={BIG} />
      <line className="g-horizon" x1={cx - BIG} y1={cy} x2={cx + BIG} y2={cy} />
    </>
  );
});

const PitchLadder = memo(function PitchLadder() {
  const items = [];
  for (let i = -LADDER_MAX_DEG / 2.5; i <= LADDER_MAX_DEG / 2.5; i++) {
    if (i === 0) continue;
    const deg = i * 2.5;
    const y = cy - deg * pitchPx;
    const half = deg % 10 === 0 ? 26 : deg % 5 === 0 ? 14 : 6;
    items.push(<line key={deg} className="g-ladder" x1={cx - half} y1={y} x2={cx + half} y2={y} />);
    if (deg % 10 === 0) {
      const label = String(Math.abs(deg));
      items.push(
        <text
          key={`l${deg}`}
          className="g-ladder-text"
          x={cx - half - 4}
          y={y + 3.5}
          textAnchor="end"
        >
          {label}
        </text>,
        <text key={`r${deg}`} className="g-ladder-text" x={cx + half + 4} y={y + 3.5}>
          {label}
        </text>,
      );
    }
  }
  return <>{items}</>;
});

/** Point on the bank arc `deg` from the top (+ clockwise), at radius r. */
function arcPt(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

const BankScale = memo(function BankScale() {
  const [x0, y0] = arcPt(-60, bankR);
  const [x1, y1] = arcPt(60, bankR);
  const ticks = [];
  for (const d of [10, 20, 30, 45, 60]) {
    const len = d === 30 || d === 60 ? 12 : 7;
    for (const s of [-1, 1]) {
      const [ax, ay] = arcPt(s * d, bankR);
      const [bx, by] = arcPt(s * d, bankR + len);
      ticks.push(<line key={s * d} className="g-bank-scale" x1={ax} y1={ay} x2={bx} y2={by} />);
    }
  }
  const top = cy - bankR;
  return (
    <g>
      <path className="g-bank-scale" d={`M${x0} ${y0} A${bankR} ${bankR} 0 0 1 ${x1} ${y1}`} />
      {ticks}
      <path className="g-bank-index" d={`M${cx} ${top - 1} l-6 -10 h12 z`} />
    </g>
  );
});

const AircraftSymbol = memo(function AircraftSymbol() {
  return (
    <g>
      <path className="g-symbol" d={`M${cx - 62} ${cy - 2.5} h34 v12 h-6 v-7.5 h-28 z`} />
      <path className="g-symbol" d={`M${cx + 62} ${cy - 2.5} h-34 v12 h6 v-7.5 h28 z`} />
      <rect className="g-symbol" x={cx - 3.5} y={cy - 3.5} width={7} height={7} />
    </g>
  );
});

export function Attitude(p: AttitudeProps) {
  const clipId = `g-ladder-clip${useId().replace(/:/g, '')}`;
  const transform = horizonTransform(p.pitchDeg, p.bankDeg);
  const bankRot = `rotate(${Math.round(-p.bankDeg * 100) / 100} ${cx} ${cy})`;
  const ptrTop = cy - bankR + 1;
  return (
    <g data-testid="pfd-attitude">
      <defs>
        <clipPath id={clipId}>
          <rect
            x={cx - LADDER_HALF_W}
            y={cy - LADDER_HALF_H}
            width={2 * LADDER_HALF_W}
            height={2 * LADDER_HALF_H}
          />
        </clipPath>
      </defs>
      <g data-testid="pfd-horizon" transform={transform}>
        <SkyGround />
      </g>
      <g clipPath={`url(#${clipId})`}>
        <g transform={transform}>
          <PitchLadder />
        </g>
      </g>
      <BankScale />
      <path
        data-testid="pfd-bank-pointer"
        className="g-bank-pointer"
        transform={bankRot}
        d={`M${cx} ${ptrTop} l-7 11 h14 z`}
      />
      <AircraftSymbol />
    </g>
  );
}
