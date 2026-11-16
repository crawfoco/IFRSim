/**
 * Plan view, north up: the procedure, the flown track and the aircraft. Used by the
 * debrief (fitted to procedure + track, with a replay cursor) and by the optional moving
 * map during flight (fitted to the procedure and the start, so it does not jump around).
 */
import { useMemo } from 'react';
import { LocalFrame } from '../../sim/geo/projection';
import { METRES_PER_NM, type LatLon } from '../../sim/geo/geodesy';
import type { Scenario } from '../../sim/scenario/scenario';
import type { RouteLeg } from '../../sim/scoring/sequencer';
import { drawRoute } from './procedureGeometry';

const W = 640;
const H = 520;
const PAD = 30;

export interface TrackPoint {
  latDeg: number;
  lonDeg: number;
  headingTrueDeg: number;
}

export function PlanView({
  scenario,
  route,
  track,
  cursor,
  fitTrack = true,
  label = 'Plan view of the procedure and the flown track',
  testId = 'plan-view',
}: {
  scenario: Scenario;
  route: RouteLeg[];
  track: readonly TrackPoint[];
  /** Index into `track` of the aircraft marker; defaults to the last point. */
  cursor?: number;
  /** Include the track in the fitted bounds (debrief); off for the live map. */
  fitTrack?: boolean;
  label?: string;
  testId?: string;
}) {
  const boundsTrack = fitTrack ? track : null;
  const geo = useMemo(() => {
    const frame = new LocalFrame(scenario.fixes[scenario.final.map.fix]!);
    const toNm = (p: LatLon) => {
      const l = frame.toLocal(p);
      return { x: l.eastM / METRES_PER_NM, y: l.northM / METRES_PER_NM };
    };
    const legs = drawRoute(route, scenario).map((d) => ({ ...d, pts: d.points.map(toNm) }));
    // The runway threshold sits under the MAP; label named fixes only.
    const fixes = Object.entries(scenario.fixes)
      .filter(([name]) => scenario.procedure.fixes[name]?.def.kind !== 'threshold')
      .map(([name, p]) => ({ name, ...toNm(p) }));
    const extra = boundsTrack
      ? boundsTrack.map((s) => toNm(s))
      : [toNm(scenario.initial.aircraft.position)];
    const all = [...legs.flatMap((l) => l.pts), ...extra];
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
      project: (p: LatLon) => px(toNm(p)),
      legs: legs.map((l) => ({ ...l, pts: l.pts.map(px) })),
      fixes: fixes.map((f) => ({ ...f, ...px(f) })),
    };
  }, [scenario, route, boundsTrack]);

  const pts = track.map((s) => geo.project(s));
  const poly = (p: { x: number; y: number }[]) =>
    p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  const i = Math.min(cursor ?? track.length - 1, track.length - 1);
  const here = pts[i];
  const hdg = track[i]?.headingTrueDeg ?? 0;
  const barNm = geo.scale * 5 > 160 ? 2 : 5;

  return (
    <svg
      className="plan"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      data-testid={testId}
    >
      <rect className="plan-bg" x={0} y={0} width={W} height={H} />
      {geo.legs.map((l) => (
        <polyline
          key={l.index}
          className={`plan-leg${l.phase === 'missed' ? ' plan-missed' : ''}${l.leadIn ? ' plan-leadin' : ''}`}
          points={poly(l.pts)}
        />
      ))}
      <polyline className="plan-track" points={poly(pts)} />
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
        <g
          transform={`translate(${here.x} ${here.y}) rotate(${hdg})`}
          data-testid={`${testId}-aircraft`}
        >
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
