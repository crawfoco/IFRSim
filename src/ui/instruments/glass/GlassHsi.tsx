/**
 * Glass HSI: rotating compass rose with heading readout and bug, VLOC course pointer and CDI,
 * TO/FROM, NAV flag, glideslope indicator and the two bearing pointers. Renders a <g> in the
 * PFD's absolute coordinates around HSI.cx/cy (see layout.ts).
 */
import { hsiCardDeg, hsiRelativeDeg } from '../geometry';
import { fmt, polar } from '../dial';
import { sourceLabel } from '../../../sim/nav/source';
import { HSI, type GlassHsiProps } from './layout';
import './hsi.css';

const { cx: CX, cy: CY, r: R } = HSI;
/** One deviation dot, CDI and glideslope. */
export const GLASS_HSI_DOT_PX = 17; // ≈ 0.25·r
const DOT = GLASS_HSI_DOT_PX;
const GS_X = CX + R + 16;
const LABELS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

const pad3 = (deg: number) => String(Math.round(deg) % 360 || 360).padStart(3, '0');
const rot = (deg: number) => `rotate(${fmt(deg)} ${CX} ${CY})`;
const pt = (deg: number, r: number) => polar(deg, r, CX, CY).map(fmt) as [number, number];

/** Static rose artwork, built once; only the enclosing group rotates. */
const ROSE = (() => {
  const out = [];
  for (let d = 0; d < 360; d += 5) {
    const major = d % 10 === 0;
    const [x1, y1] = pt(d, R);
    const [x2, y2] = pt(d, major ? R - 9 : R - 5);
    out.push(
      <line
        key={d}
        className={major ? 'g-hsi-tick-major' : 'g-hsi-tick'}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
      />,
    );
    if (d % 30 === 0) {
      const [x, y] = pt(d, R - 18);
      out.push(
        <text
          key={`l${d}`}
          className="g-hsi-label"
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(${d} ${x} ${y})`}
        >
          {LABELS[d] ?? d / 10}
        </text>,
      );
    }
  }
  return out;
})();

/** Fixed parts: lubber triangle, aircraft symbol and the readout box. */
const READOUT = { w: 40, h: 16, y: CY - R - 22 } as const;
const AIRCRAFT_D = `M ${CX} ${CY - 11} v 22 M ${CX - 12} ${CY - 2} h 24 M ${CX - 5} ${CY + 10} h 10`;

/**
 * Bearing pointers, drawn pointing up (rotated as a group): a head from the rim in to about
 * half radius and a tail from half radius out to the rim. BRG1 single line, BRG2 double line.
 */
const BRG_IN = Math.round(R * 0.45);
const BRG1_D = [
  `M ${CX} ${CY - R + 3} V ${CY - BRG_IN}`,
  `M ${CX - 7} ${CY - R + 13} L ${CX} ${CY - R + 3} L ${CX + 7} ${CY - R + 13}`,
  `M ${CX} ${CY + BRG_IN} V ${CY + R - 3}`,
].join(' ');
const BRG2_D = [
  `M ${CX - 3.5} ${CY - R + 10} V ${CY - BRG_IN} M ${CX + 3.5} ${CY - R + 10} V ${CY - BRG_IN}`,
  `M ${CX - 8} ${CY - R + 14} L ${CX} ${CY - R + 3} L ${CX + 8} ${CY - R + 14}`,
  `M ${CX - 3.5} ${CY + BRG_IN} V ${CY + R - 3} M ${CX + 3.5} ${CY + BRG_IN} V ${CY + R - 3}`,
].join(' ');

/** Course pointer head and tail, drawn pointing up. */
const BAR_HALF = Math.round(R * 0.42);
const COURSE_HEAD_D = `M ${CX} ${CY - R + 6} l 7 12 h -4 v ${R - 18 - BAR_HALF - 10} h -6 v ${-(R - 18 - BAR_HALF - 10)} h -4 Z`;
const COURSE_TAIL_D = `M ${CX - 3} ${CY + BAR_HALF + 4} h 6 V ${CY + R - 6} h -6 Z`;

/** Text summary of the HSI (heading, course, source, needle, TO/FROM, GS), for screen readers. */
export function hsiSummary(p: GlassHsiProps): string {
  const source = sourceLabel(p.cdiSource);
  const parts = [`heading ${pad3(p.headingMagDeg)}`, `course ${pad3(p.courseDeg)}`, source];
  if (p.deviation.flag) parts.push('NAV flag');
  else {
    const d = p.deviation.dots;
    parts.push(
      Math.abs(d) < 0.05
        ? 'needle centred'
        : `needle ${Math.abs(d).toFixed(1)} dots ${d > 0 ? 'right' : 'left'}`,
    );
    if (p.deviation.toFrom) parts.push(p.deviation.toFrom);
  }
  if (p.glideslope) {
    const g = p.glideslope;
    if (g.flag) parts.push('GS flag');
    else
      parts.push(
        Math.abs(g.dots) < 0.05
          ? 'glideslope centred'
          : `glideslope ${Math.abs(g.dots).toFixed(1)} dots ${g.dots > 0 ? 'up' : 'down'}`,
      );
  }
  return `HSI: ${parts.join(', ')}`;
}

export function GlassHsi(p: GlassHsiProps) {
  const { headingMagDeg: hdg, deviation, glideslope } = p;
  const source = sourceLabel(p.cdiSource);
  // Outside the rose, upper left, clear of the card's numbers.
  const [srcX, srcY] = [CX - R - 8, CY - R * 0.45];
  return (
    <g data-testid="pfd-hsi" className={p.cdiSource === 'GPS' ? 'g-hsi-src-gps' : undefined}>
      <title>{hsiSummary(p)}</title>
      <circle className="g-hsi-disc" cx={CX} cy={CY} r={R + 4} />

      <g data-testid="pfd-hsi-rose" transform={rot(hsiCardDeg(hdg))}>
        {ROSE}
      </g>

      {/* Heading bug on the rim. */}
      <g data-testid="pfd-hsi-bug" transform={rot(hsiRelativeDeg(p.headingBugDeg, hdg))}>
        <path
          className="g-bug"
          d={`M ${CX - 7} ${CY - R - 3} h 14 v 8 h -4 l -3 -4 l -3 4 h -4 Z`}
        />
      </g>

      {/* Bearing pointers, under the course pointer. */}
      {p.bearing2Deg !== null && (
        <g data-testid="pfd-brg2" transform={rot(hsiRelativeDeg(p.bearing2Deg, hdg))}>
          <path className="g-hsi-brg-halo" d={BRG2_D} />
          <path className="g-hsi-brg" d={BRG2_D} />
        </g>
      )}
      {p.bearing1Deg !== null && (
        <g data-testid="pfd-brg1" transform={rot(hsiRelativeDeg(p.bearing1Deg, hdg))}>
          <path className="g-hsi-brg-halo" d={BRG1_D} />
          <path className="g-hsi-brg" d={BRG1_D} />
        </g>
      )}

      {/* Course pointer, deviation scale and bar, TO/FROM. */}
      <g data-testid="pfd-hsi-course" transform={rot(hsiRelativeDeg(p.courseDeg, hdg))}>
        <path className="g-hsi-course" d={COURSE_HEAD_D} />
        <path className="g-hsi-course" d={COURSE_TAIL_D} />
        {[-2, -1, 1, 2].map((n) => (
          <circle key={n} className="g-hsi-dot" cx={CX + n * DOT} cy={CY} r={3} />
        ))}
        {!deviation.flag && (
          <rect
            data-testid="pfd-hsi-cdi"
            className="g-hsi-course"
            x={fmt(CX + deviation.dots * DOT - 2.5)}
            y={CY - BAR_HALF}
            width={5}
            height={BAR_HALF * 2}
          />
        )}
        {deviation.toFrom === 'TO' && (
          <path
            data-testid="pfd-hsi-to"
            className="g-hsi-course"
            d={`M ${CX + 26} ${CY - 22} l 6 10 h -12 Z`}
          />
        )}
        {deviation.toFrom === 'FROM' && (
          <path
            data-testid="pfd-hsi-from"
            className="g-hsi-course"
            d={`M ${CX + 26} ${CY + 22} l 6 -10 h -12 Z`}
          />
        )}
      </g>

      {deviation.flag && (
        <g data-testid="pfd-hsi-nav-flag">
          <text
            className="g-flag-text"
            x={CX + 30}
            y={CY - 30}
            textAnchor="middle"
            dominantBaseline="central"
          >
            NAV
          </text>
        </g>
      )}

      <text
        data-testid="pfd-hsi-source"
        className="g-hsi-source"
        x={fmt(srcX)}
        y={fmt(srcY)}
        textAnchor="end"
        dominantBaseline="central"
      >
        {source}
      </text>
      {p.cdiSource === 'GPS' && p.gpsMode && (
        <text
          data-testid="pfd-hsi-gps-mode"
          className="g-hsi-source"
          x={fmt(srcX)}
          y={fmt(srcY + 15)}
          textAnchor="end"
          dominantBaseline="central"
        >
          {p.gpsMode}
        </text>
      )}

      {/* Fixed: aircraft symbol, lubber triangle, heading readout. */}
      <path className="g-hsi-aircraft" d={AIRCRAFT_D} />
      <path className="g-hsi-lubber" d={`M ${CX - 5} ${READOUT.y + READOUT.h} h 10 l -5 6 Z`} />
      <rect
        className="g-readout"
        x={CX - READOUT.w / 2}
        y={READOUT.y}
        width={READOUT.w}
        height={READOUT.h}
        rx={2}
      />
      <text
        data-testid="pfd-hsi-heading"
        className="g-text"
        x={CX}
        y={READOUT.y + READOUT.h / 2}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {pad3(hdg)}
      </text>

      {glideslope && (
        <g data-testid="pfd-hsi-gs">
          {[-2, -1, 1, 2].map((n) => (
            <circle key={n} className="g-hsi-dot" cx={GS_X} cy={CY + n * DOT} r={3} />
          ))}
          <line className="g-hsi-mark" x1={GS_X - 7} y1={CY} x2={GS_X + 7} y2={CY} />
          {glideslope.flag ? (
            <text
              data-testid="pfd-hsi-gs-flag"
              className="g-flag-text"
              x={GS_X}
              y={CY - 2 * DOT - 14}
              textAnchor="middle"
              dominantBaseline="central"
            >
              GS
            </text>
          ) : (
            <path
              data-testid="pfd-hsi-gs-diamond"
              className="g-hsi-course"
              transform={`translate(0 ${fmt(-glideslope.dots * DOT)})`}
              d={`M ${GS_X} ${CY - 7} l 6 7 l -6 7 l -6 -7 Z`}
            />
          )}
        </g>
      )}
    </g>
  );
}
