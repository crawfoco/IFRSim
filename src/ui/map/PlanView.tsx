/** Debrief plan view: the procedure, the flown track and the replay position, north up. */
import { useMemo } from 'react';
import { LocalFrame } from '../../sim/geo/projection';
import { METRES_PER_NM, type LatLon } from '../../sim/geo/geodesy';
import type { Scenario } from '../../sim/scenario/scenario';
import type { DebriefSample } from '../../sim/scoring/analyze';
import type { RouteLeg } from '../../sim/scoring/sequencer';
import { drawRoute } from './procedureGeometry';

const W = 640;
const H = 520;
const PAD = 30;

export function PlanView({
  scenario,
  route,
  samples,
  cursor,
}: {
  scenario: Scenario;
  route: RouteLeg[];
  samples: DebriefSample[];
  /** Index into samples of the replay position. */
  cursor: number;
}) {
  const geo = useMemo(() => {
    const frame = new LocalFrame(scenario.fixes[scenario.final.map.fix]!);
    const toNm = (p: LatLon) => {
      const l = frame.toLocal(p);
      return { x: l.eastM / METRES_PER_NM, y: l.northM / METRES_PER_NM };
    };
    const legs = drawRoute(route, scenario).map((d) => ({ ...d, pts: d.points.map(toNm) }));
    const track = samples.map((s) => toNm({ latDeg: s.latDeg, lonDeg: s.lonDeg }));
    // The runway threshold sits under the MAP; label named fixes only.
    const fixes = Object.entries(scenario.fixes)
      .filter(([name]) => scenario.procedure.fixes[name]?.def.kind !== 'threshold')
      .map(([name, p]) => ({ name, ...toNm(p) }));
    const all = [...legs.flatMap((l) => l.pts), ...track];
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxY - minY || 1));
    const ox = (W - (maxX - minX) * scale) / 2;
    const oy = (H - (maxY - minY) * scale) / 2;
    const px = (p: { x: number; y: number }) => ({
      x: ox + (p.x - minX) * scale,
      y: H - (oy + (p.y - minY) * scale),
    });
    return {
      scale,
      legs: legs.map((l) => ({ ...l, pts: l.pts.map(px) })),
      track: track.map(px),
      fixes: fixes.map((f) => ({ ...f, ...px(f) })),
    };
  }, [scenario, route, samples]);

  const poly = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const here = geo.track[Math.min(cursor, geo.track.length - 1)];
  const hdg = samples[Math.min(cursor, samples.length - 1)]?.headingTrueDeg ?? 0;
  const barNm = geo.scale * 5 > 160 ? 2 : 5;

  return (
    <svg
      className="plan"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Plan view of the procedure and the flown track"
      data-testid="plan-view"
    >
      <rect className="plan-bg" x={0} y={0} width={W} height={H} />
      {geo.legs.map((l) => (
        <polyline
          key={l.index}
          className={`plan-leg${l.phase === 'missed' ? ' plan-missed' : ''}`}
          points={poly(l.pts)}
        />
      ))}
      <polyline className="plan-track" points={poly(geo.track)} />
      {geo.fixes.map((f) => (
        <g key={f.name}>
          <path
            className="plan-fix"
            d={`M ${f.x} ${f.y - 5} L ${f.x + 5} ${f.y + 4} L ${f.x - 5} ${f.y + 4} Z`}
          />
          <text className="plan-label" x={f.x + 7} y={f.y - 6}>
            {f.name}
          </text>
        </g>
      ))}
      {here && (
        <g transform={`translate(${here.x} ${here.y}) rotate(${hdg})`} data-testid="plan-aircraft">
          <path className="plan-ac" d="M 0 -9 L 6 7 L 0 3 L -6 7 Z" />
        </g>
      )}
      <g transform={`translate(${PAD} ${H - 16})`}>
        <line className="plan-scale" x1={0} y1={0} x2={geo.scale * barNm} y2={0} />
        <text className="plan-label" x={0} y={-5}>
          {barNm} NM
        </text>
      </g>
      <text className="plan-label" x={W - 20} y={22} textAnchor="middle">
        N ↑
      </text>
    </svg>
  );
}
