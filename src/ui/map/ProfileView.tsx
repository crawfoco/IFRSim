/** Debrief profile: altitude over time against the minimum altitude in force (and DA/MDA). */
import type { DebriefSample } from '../../sim/scoring/analyze';
import { clock } from '../../sim/scoring/rules/types';

const W = 640;
const H = 200;
const L = 48;
const R = 10;
const T = 10;
const B = 24;

export function ProfileView({
  samples,
  minimums,
  cursor,
}: {
  samples: DebriefSample[];
  minimums: { label: string; altFt: number };
  cursor: number;
}) {
  if (samples.length < 2) return null;
  const alts = samples.flatMap((s) => [s.altitudeFt, s.minAltFt ?? s.altitudeFt]);
  const lo = Math.floor((Math.min(...alts, minimums.altFt) - 200) / 500) * 500;
  const hi = Math.ceil((Math.max(...alts) + 200) / 500) * 500;
  const t0 = samples[0]!.tick;
  const t1 = samples.at(-1)!.tick;
  const x = (tick: number) => L + ((tick - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (ft: number) => T + (1 - (ft - lo) / (hi - lo)) * (H - T - B);

  const flown = samples
    .map((s) => `${x(s.tick).toFixed(1)},${y(s.altitudeFt).toFixed(1)}`)
    .join(' ');
  // Minimum altitude as steps, broken where none applies.
  const minPaths: string[] = [];
  let d = '';
  samples.forEach((s, i) => {
    if (s.minAltFt === null) {
      if (d) minPaths.push(d);
      d = '';
      return;
    }
    const px = x(s.tick).toFixed(1);
    const py = y(s.minAltFt).toFixed(1);
    d += d ? ` H ${px} V ${py}` : `M ${px} ${py}`;
    if (i === samples.length - 1) minPaths.push(d);
  });
  if (d) minPaths.push(d);
  const ticks: number[] = [];
  for (let ft = lo; ft <= hi; ft += hi - lo > 4000 ? 1000 : 500) ticks.push(ft);
  const c = samples[Math.min(cursor, samples.length - 1)]!;

  return (
    <svg
      className="profile"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Altitude profile against minimum altitudes"
      data-testid="profile-view"
    >
      <rect className="plan-bg" x={0} y={0} width={W} height={H} />
      {ticks.map((ft) => (
        <g key={ft}>
          <line className="profile-grid" x1={L} x2={W - R} y1={y(ft)} y2={y(ft)} />
          <text className="plan-label" x={L - 4} y={y(ft) + 4} textAnchor="end">
            {ft}
          </text>
        </g>
      ))}
      <line
        className="profile-mins"
        x1={L}
        x2={W - R}
        y1={y(minimums.altFt)}
        y2={y(minimums.altFt)}
      />
      <text
        className="plan-label profile-mins-label"
        x={W - R - 4}
        y={y(minimums.altFt) - 4}
        textAnchor="end"
      >
        {minimums.label}
      </text>
      {minPaths.map((p, i) => (
        <path key={i} className="profile-min" d={p} />
      ))}
      <polyline className="plan-track" points={flown} />
      <line className="profile-cursor" x1={x(c.tick)} x2={x(c.tick)} y1={T} y2={H - B} />
      <text className="plan-label" x={L} y={H - 6}>
        {clock(t0)}
      </text>
      <text className="plan-label" x={W - R} y={H - 6} textAnchor="end">
        {clock(t1)}
      </text>
    </svg>
  );
}
