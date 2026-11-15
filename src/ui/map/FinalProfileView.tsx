/**
 * Debrief final-approach profile, drawn like a chart's profile view: altitude against
 * distance to the threshold (decreasing to 0 at the right), the FAF and step-down fixes
 * with their minimum altitudes, the glideslope or charted descent angle, the DA/MDA, the
 * MAP, and the altitude actually flown on the final.
 */
import type { ActiveMinimums } from '../../sim/scenario/scenario';
import type { FinalProfileData } from './finalProfile';
import { glidepathAltFt } from './finalProfile';

const W = 640;
const H = 220;
const L = 48;
const R = 14;
const T = 22;
const B = 24;

export function FinalProfileView({
  data,
  minimums,
  cursor,
}: {
  data: FinalProfileData;
  minimums: ActiveMinimums;
  cursor: number;
}) {
  const { maxNm, thresholdElevFt, fixes, path, flown } = data;
  const fixAlts = fixes.flatMap((f) => (f.minAltFt === null ? [] : [f.minAltFt]));
  const flownAlts = flown.flat().map((p) => p.altFt);
  const pathTop = path ? glidepathAltFt(thresholdElevFt, path.tchFt, path.angleDeg, maxNm) : 0;
  const lo = Math.floor((thresholdElevFt - 100) / 500) * 500;
  const top = Math.max(...fixAlts, ...flownAlts, minimums.altFt, pathTop);
  const hi = Math.ceil((top + 300) / 500) * 500;
  const x = (nm: number) => L + (1 - nm / maxNm) * (W - L - R);
  const y = (ft: number) => T + (1 - (ft - lo) / (hi - lo)) * (H - T - B);
  const step = hi - lo > 4000 ? 1000 : 500;
  const altTicks: number[] = [];
  for (let ft = lo; ft <= hi; ft += step) altTicks.push(ft);
  const nmTicks: number[] = [];
  for (let nm = 0; nm <= maxNm; nm++) nmTicks.push(nm);

  const fixList = fixes.filter((f) => f.distNm >= 0 && f.distNm <= maxNm);
  const cursorPt = flown.flat().find((p) => p.i === cursor);
  const minsY = y(minimums.altFt);
  const fmt = (ft: number) => Math.round(ft).toLocaleString('en-US');

  return (
    <svg
      className="profile"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Final approach profile: altitude against distance to the threshold"
      data-testid="final-profile"
    >
      <rect className="plan-bg" x={0} y={0} width={W} height={H} />
      {altTicks.map((ft) => (
        <g key={ft}>
          <line className="profile-grid" x1={L} x2={W - R} y1={y(ft)} y2={y(ft)} />
          <text className="plan-label" x={L - 4} y={y(ft) + 4} textAnchor="end">
            {ft}
          </text>
        </g>
      ))}
      {nmTicks.map((nm) => (
        <text
          key={nm}
          className="plan-label fp-axis"
          x={x(nm)}
          y={H - 8}
          textAnchor={nm === 0 ? 'end' : nm === maxNm ? 'start' : 'middle'}
        >
          {nm === 0 ? 'THR' : nm === maxNm ? `${nm} NM` : nm}
        </text>
      ))}
      {/* Ground at the threshold elevation. */}
      <line
        className="fp-ground"
        x1={L}
        x2={W - R}
        y1={y(thresholdElevFt)}
        y2={y(thresholdElevFt)}
      />
      <line className="profile-mins" x1={L} x2={W - R} y1={minsY} y2={minsY} />
      <text className="plan-label profile-mins-label" x={L + 4} y={minsY - 4}>
        {minimums.kind} {fmt(minimums.altFt)}
      </text>
      {path && (
        <g data-testid="final-profile-path">
          <line
            className="fp-path"
            x1={x(0)}
            y1={y(thresholdElevFt + path.tchFt)}
            x2={x(maxNm)}
            y2={y(glidepathAltFt(thresholdElevFt, path.tchFt, path.angleDeg, maxNm))}
          />
          <text
            className="plan-label fp-path-label"
            x={x(maxNm) + 4}
            y={y(glidepathAltFt(thresholdElevFt, path.tchFt, path.angleDeg, maxNm)) - 6}
          >
            {path.kind} {path.angleDeg.toFixed(2)}° TCH {path.tchFt}
          </text>
        </g>
      )}
      {fixList.map((f) => {
        const fx = x(f.distNm);
        const isMap = f.role === 'MAP';
        return (
          <g key={`${f.role}-${f.name}`} data-testid={`final-profile-fix-${f.role}`}>
            <line
              className={isMap ? 'fp-map' : f.role === 'VDP' ? 'fp-vdp' : 'fp-fix'}
              x1={fx}
              x2={fx}
              y1={T}
              y2={y(thresholdElevFt)}
            />
            {f.minAltFt !== null && (
              <>
                <line
                  className="profile-min"
                  x1={fx}
                  x2={Math.min(W - R, fx + 40)}
                  y1={y(f.minAltFt)}
                  y2={y(f.minAltFt)}
                />
                <text className="plan-label" x={fx + 3} y={y(f.minAltFt) - 4}>
                  {fmt(f.minAltFt)}
                </text>
              </>
            )}
            <text
              className={`plan-label${isMap ? ' fp-map-label' : ''}`}
              x={fx}
              y={T - 8}
              textAnchor="middle"
            >
              {f.role === 'FAF'
                ? `✠ ${f.name}`
                : isMap && f.name !== 'DA'
                  ? 'MAP'
                  : f.role === 'VDP'
                    ? 'V'
                    : f.name}
            </text>
          </g>
        );
      })}
      {flown.map((run, k) =>
        run.length > 1 ? (
          <polyline
            key={k}
            className="plan-track"
            points={run.map((p) => `${x(p.distNm).toFixed(1)},${y(p.altFt).toFixed(1)}`).join(' ')}
          />
        ) : null,
      )}
      {cursorPt && (
        <circle
          className="plan-ac"
          cx={x(cursorPt.distNm)}
          cy={y(cursorPt.altFt)}
          r={4}
          data-testid="final-profile-cursor"
        />
      )}
      {flown.length === 0 && (
        <text className="plan-label" x={(L + W - R) / 2} y={(T + H - B) / 2} textAnchor="middle">
          Not flown on the final approach
        </text>
      )}
    </svg>
  );
}
