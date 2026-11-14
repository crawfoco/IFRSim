/** NAV2 course deviation indicator: OBS card, vertical needle, TO/FROM and NAV flag. */
import type { CourseDeviation } from './geometry';
import { hsiCardDeg } from './geometry';
import { C, Dial, fmt, polar, rotate, Tick } from './dial';

export const CDI_DOT_PX = 14;
const pad3 = (deg: number) => String(Math.round(deg) % 360 || 360).padStart(3, '0');

export function Cdi({ obsDeg, deviation }: { obsDeg: number; deviation: CourseDeviation }) {
  const card = [];
  for (let d = 0; d < 360; d += 10) {
    const major = d % 30 === 0;
    card.push(<Tick key={d} deg={d} r1={major ? 80 : 85} r2={90} w={major ? 2.5 : 1.5} />);
    if (major) {
      const [x, y] = polar(d, 72);
      card.push(
        <text
          key={`l${d}`}
          className="inst-label inst-small-label"
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          transform={rotate(d, x, y)}
        >
          {d === 0 ? 'N' : d / 10}
        </text>,
      );
    }
  }
  const s = deviation.flag
    ? 'NAV flag'
    : Math.abs(deviation.dots) < 0.05
      ? 'needle centred'
      : `needle ${Math.abs(deviation.dots).toFixed(1)} dots ${deviation.dots > 0 ? 'right' : 'left'}`;
  return (
    <Dial
      label="CDI · NAV2"
      summary={`OBS ${pad3(obsDeg)}, ${s}${deviation.toFrom ? `, ${deviation.toFrom}` : ''}`}
      testId="cdi"
    >
      <g data-testid="cdi-card" transform={rotate(hsiCardDeg(obsDeg))}>
        {card}
      </g>
      <path className="inst-lubber" d={`M ${C} 2 l -5 0 l 5 9 l 5 -9 Z`} />
      {[-2, -1, 0, 1, 2].map((n) => (
        <circle
          key={n}
          className={n === 0 ? 'inst-dot-ring' : 'inst-dot'}
          cx={C + n * CDI_DOT_PX}
          cy={C + 22}
          r={n === 0 ? 5 : 3}
        />
      ))}
      {!deviation.flag && (
        <rect
          data-testid="cdi-needle"
          className="inst-needle"
          x={fmt(C + deviation.dots * CDI_DOT_PX - 2)}
          y={C - 52}
          width={4}
          height={104}
        />
      )}
      {deviation.toFrom && (
        <text
          data-testid="cdi-tofrom"
          className="inst-tofrom-text"
          x={C + 36}
          y={C - 10}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {deviation.toFrom}
        </text>
      )}
      {deviation.flag && (
        <g data-testid="cdi-nav-flag">
          <rect className="inst-flag" x={C + 20} y={C - 18} width={32} height={16} />
          <text
            className="inst-flag-text"
            x={C + 36}
            y={C - 10}
            textAnchor="middle"
            dominantBaseline="central"
          >
            NAV
          </text>
        </g>
      )}
      <rect className="inst-window" x={C - 22} y={C + 40} width={44} height={20} rx={3} />
      <text className="inst-digits" x={C} y={C + 50} textAnchor="middle" dominantBaseline="central">
        {pad3(obsDeg)}
      </text>
    </Dial>
  );
}
