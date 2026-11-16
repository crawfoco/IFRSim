/**
 * Out-the-window view: clear sky above the overcast, grey in cloud, and the ground below the
 * base, with the runway drawn in perspective once it is in sight. Deliberately simple: it
 * answers one question at minimums, "is the runway in sight?".
 */
import type { OutsideView as View } from '../../sim/scenario/outside';

/** A wide strip across the top of the panel, like a windscreen. The SVG fills the full width
 *  (sliced to fit), so the horizontal field of view is about ±37°. */
const W = 760;
const H = 84;
const HORIZON = 30;
/** Pixels per radian at the centre: the same scale vertically and horizontally. */
const FOCAL = 480;
const RUNWAY_LENGTH_FT = 7000;
const RUNWAY_WIDTH_FT = 150;
const FT_PER_NM = 6076.12;

/** Fraction of the way out of the base, for the grey to thin as the aircraft breaks out. */
const BREAKOUT_FT = 150;

const LABEL: Record<View['layer'], string> = {
  clear: 'Above the clouds',
  cloud: 'In cloud',
  below: 'Below the clouds',
};

function runwayPolygon(r: NonNullable<View['runway']>): string | null {
  const b = (r.relBearingDeg * Math.PI) / 180;
  const a = (r.relAlignmentDeg * Math.PI) / 180;
  const dFt = r.distanceNm * FT_PER_NM;
  // Threshold centre in aircraft axes: x right, y forward (ft).
  const tx = dFt * Math.sin(b);
  const ty = dFt * Math.cos(b);
  const ux = Math.sin(a); // along the runway
  const uy = Math.cos(a);
  const half = RUNWAY_WIDTH_FT / 2;
  const corners = [
    [tx - uy * half, ty + ux * half],
    [tx + uy * half, ty - ux * half],
    [tx + uy * half + ux * RUNWAY_LENGTH_FT, ty - ux * half + uy * RUNWAY_LENGTH_FT],
    [tx - uy * half + ux * RUNWAY_LENGTH_FT, ty + ux * half + uy * RUNWAY_LENGTH_FT],
  ];
  if (corners.some(([, y]) => y! < 200)) return null; // under or behind the nose
  const h = Math.max(r.aglFt, 20);
  return corners
    .map(
      ([x, y]) =>
        `${(W / 2 + (x! / y!) * FOCAL).toFixed(1)},${(HORIZON + (h / y!) * FOCAL).toFixed(1)}`,
    )
    .join(' ');
}

export function OutsideView({
  view,
  altitudeFt,
  baseFtMsl,
}: {
  view: View;
  altitudeFt: number;
  baseFtMsl: number;
}) {
  const { layer } = view;
  // In cloud the grey is solid, thinning over the last BREAKOUT_FT above the base.
  const fog =
    layer === 'cloud'
      ? Math.min(1, 0.75 + ((altitudeFt - baseFtMsl) / BREAKOUT_FT) * 0.25)
      : layer === 'below'
        ? 0.18
        : 0;
  const rwy = view.runway ? runwayPolygon(view.runway) : null;
  const inSightText = view.circling ? ', airport in sight' : ', runway in sight';
  const text = `${LABEL[layer]}${view.runwayInSight ? inSightText : ''}`;
  return (
    <figure
      className="outside"
      data-testid="outside-view"
      data-layer={layer}
      data-runway={view.runwayInSight ? 'in-sight' : 'not-in-sight'}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={`Outside view: ${text}`}
      >
        <defs>
          <linearGradient id="ov-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2f6fb5" />
            <stop offset="1" stopColor="#9cc6ec" />
          </linearGradient>
          <linearGradient id="ov-deck" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e9eef3" />
            <stop offset="1" stopColor="#b9c3cc" />
          </linearGradient>
          <linearGradient id="ov-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6f7a62" />
            <stop offset="1" stopColor="#4d5a3e" />
          </linearGradient>
        </defs>
        {layer === 'clear' ? (
          <>
            <rect x={0} y={0} width={W} height={HORIZON + 6} fill="url(#ov-sky)" />
            <rect x={0} y={HORIZON + 6} width={W} height={H - HORIZON - 6} fill="url(#ov-deck)" />
          </>
        ) : (
          <>
            <rect x={0} y={0} width={W} height={HORIZON} fill="#8d959c" />
            <rect x={0} y={HORIZON} width={W} height={H - HORIZON} fill="url(#ov-ground)" />
            {rwy && (
              <polygon
                data-testid="outside-runway"
                points={rwy}
                fill="#4a4e54"
                stroke="#f2f2f2"
                strokeWidth={1}
              />
            )}
            <rect x={0} y={0} width={W} height={H} fill="#aab1b7" opacity={fog} />
          </>
        )}
      </svg>
      <figcaption className="outside-caption" data-testid="outside-caption">
        {text}
      </figcaption>
    </figure>
  );
}
