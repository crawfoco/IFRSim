/**
 * Horizontal situation indicator for NAV1: rotating compass card, heading bug, course
 * pointer with deviation bar and TO/FROM, NAV flag, and the glideslope scale on the right.
 */
import type { CourseDeviation, GlideslopeDeviation } from './geometry';
import { hsiCardDeg, hsiRelativeDeg } from './geometry';
import { C, fmt, polar, rotate, Tick } from './dial';

export const HSI_DOT_PX = 16;
const GS_X = 226;
const CARD_LABELS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
const pad3 = (deg: number) => String(Math.round(deg) % 360 || 360).padStart(3, '0');

export interface HsiProps {
  headingMagDeg: number;
  headingBugDeg: number;
  courseDeg: number;
  deviation: CourseDeviation;
  /** Null when no ILS is tuned (pointer stowed). */
  glideslope: GlideslopeDeviation | null;
  /** The NAV/GPS switch selects the GPS: course pointer and bar in the GPS colour, "GPS" shown. */
  gps?: boolean;
}

function summary(p: HsiProps): string {
  const parts = [`heading ${pad3(p.headingMagDeg)}`, `course ${pad3(p.courseDeg)}`];
  if (p.gps) parts.push('GPS');
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
  return parts.join(', ');
}

export function Hsi(props: HsiProps) {
  const { headingMagDeg, headingBugDeg, courseDeg, deviation, glideslope } = props;
  const card = [];
  for (let d = 0; d < 360; d += 5) {
    const major = d % 10 === 0;
    card.push(<Tick key={d} deg={d} r1={major ? 79 : 84} r2={90} w={major ? 2.5 : 1.5} />);
    if (d % 30 === 0) {
      const [x, y] = polar(d, 69);
      card.push(
        <text
          key={`l${d}`}
          className="inst-label"
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          transform={rotate(d, x, y)}
        >
          {CARD_LABELS[d] ?? d / 10}
        </text>,
      );
    }
  }
  const barX = deviation.dots * HSI_DOT_PX;
  return (
    <figure className={`inst inst-hsi${props.gps ? ' inst-hsi-gps' : ''}`} data-testid="hsi">
      {/* The dial at 0..200 with the side strip to its right; the viewBox pads the left as
          much, so the dial is centred (in line with the instrument below). */}
      <svg viewBox="-50 0 300 200" role="img" aria-label={`HSI: ${summary(props)}`}>
        <circle className="inst-bezel" cx={C} cy={C} r={99} />
        <circle className="inst-face" cx={C} cy={C} r={92} />
        {props.gps && (
          <text
            data-testid="hsi-gps"
            className="inst-gps-label"
            x={C + 104}
            y={18}
            textAnchor="start"
            dominantBaseline="central"
          >
            GPS
          </text>
        )}
        <g data-testid="hsi-card" transform={rotate(hsiCardDeg(headingMagDeg))}>
          {card}
        </g>

        {/* Heading bug, on the card's rim. */}
        <g data-testid="hsi-bug" transform={rotate(hsiRelativeDeg(headingBugDeg, headingMagDeg))}>
          <path className="inst-bug" d={`M ${C - 8} 9 h 16 v 10 h -5 l -3 -5 l -3 5 h -5 Z`} />
        </g>

        {/* Course pointer, deviation dots and bar, TO/FROM. */}
        <g data-testid="hsi-course" transform={rotate(hsiRelativeDeg(courseDeg, headingMagDeg))}>
          <path className="inst-course" d={`M ${C} 24 l 7 13 h -4 v 19 h -6 v -19 h -4 Z`} />
          <rect className="inst-course" x={C - 3} y={C + 30} width={6} height={26} />
          {[-2, -1, 1, 2].map((n) => (
            <circle key={n} className="inst-dot" cx={C + n * HSI_DOT_PX} cy={C} r={3.5} />
          ))}
          {!deviation.flag && (
            <rect
              data-testid="hsi-cdi"
              className="inst-course"
              x={fmt(C + barX - 3)}
              y={C - 28}
              width={6}
              height={56}
            />
          )}
          {deviation.toFrom === 'TO' && (
            <path
              data-testid="hsi-to"
              className="inst-tofrom"
              d={`M ${C + 22} ${C - 30} l 8 12 h -16 Z`}
            />
          )}
          {deviation.toFrom === 'FROM' && (
            <path
              data-testid="hsi-from"
              className="inst-tofrom"
              d={`M ${C + 22} ${C + 30} l 8 -12 h -16 Z`}
            />
          )}
        </g>

        {deviation.flag && (
          <g data-testid="hsi-nav-flag">
            <rect className="inst-flag" x={C - 46} y={C - 46} width={30} height={14} />
            <text
              className="inst-flag-text"
              x={C - 31}
              y={C - 39}
              textAnchor="middle"
              dominantBaseline="central"
            >
              NAV
            </text>
          </g>
        )}

        {/* Lubber line and aircraft symbol (fixed). */}
        <path className="inst-lubber" d={`M ${C} 2 l -5 -0 l 5 9 l 5 -9 Z`} />
        <path
          className="inst-aircraft"
          d={`M ${C} ${C - 12} v 26 M ${C - 13} ${C - 2} h 26 M ${C - 6} ${C + 12} h 12`}
        />

        {/* Side strip: heading readout, glideslope scale, course readout. */}
        <g className="inst-strip">
          <rect className="inst-window" x={204} y={6} width={42} height={20} rx={3} />
          <text
            className="inst-digits"
            x={225}
            y={16}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {pad3(headingMagDeg)}
          </text>
          <text className="inst-unit inst-small" x={225} y={34} textAnchor="middle">
            HDG
          </text>
          {glideslope && (
            <g data-testid="hsi-gs">
              {[-2, -1, 1, 2].map((n) => (
                <circle key={n} className="inst-dot" cx={GS_X} cy={C + n * HSI_DOT_PX} r={3.5} />
              ))}
              <line
                className="inst-mark"
                x1={GS_X - 9}
                y1={C}
                x2={GS_X + 9}
                y2={C}
                strokeWidth={2}
              />
              {glideslope.flag ? (
                <g data-testid="hsi-gs-flag">
                  <rect className="inst-flag" x={GS_X - 13} y={C - 7} width={26} height={14} />
                  <text
                    className="inst-flag-text"
                    x={GS_X}
                    y={C}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    GS
                  </text>
                </g>
              ) : (
                <path
                  data-testid="hsi-gs-pointer"
                  className="inst-gs"
                  transform={`translate(0 ${fmt(-glideslope.dots * HSI_DOT_PX)})`}
                  d={`M ${GS_X} ${C - 8} l 8 8 l -8 8 l -8 -8 Z`}
                />
              )}
            </g>
          )}
          <text className="inst-unit inst-small" x={225} y={166} textAnchor="middle">
            CRS
          </text>
          <rect className="inst-window" x={204} y={172} width={42} height={20} rx={3} />
          <text
            className="inst-digits inst-course-text"
            x={225}
            y={182}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {pad3(courseDeg)}
          </text>
        </g>
      </svg>
      <figcaption className="inst-caption">HSI · {props.gps ? 'GPS' : 'NAV1'}</figcaption>
    </figure>
  );
}
