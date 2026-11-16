/** The flown track drawn on a plate's plan view (image pixels), clipped to the plan view box. */
import { useId } from 'react';
import type { LatLon } from '../../sim/geo/geodesy';
import type { PlateCalibration, PlateFit } from './overlay';

export function PlateTrack({
  cal,
  fit,
  track,
}: {
  cal: PlateCalibration;
  fit: PlateFit;
  track: readonly LatLon[];
}) {
  const clip = useId();
  if (track.length < 2) return null;
  const pts = track.map((p) => fit.toPx(p));
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [sx, sy] = pts[0]!;
  const [ex, ey] = pts[pts.length - 1]!;
  const { x, y, w, h } = cal.planArea;
  return (
    <g data-testid="plate-track">
      {/* The plan view minus its insets (even-odd: the inset rectangles cut holes). */}
      <clipPath id={clip}>
        <path
          clipRule="evenodd"
          d={[{ x, y, w, h }, ...(cal.insets ?? [])]
            .map((r) => `M ${r.x} ${r.y} h ${r.w} v ${r.h} h ${-r.w} Z`)
            .join(' ')}
        />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <path className="plate-track-halo" d={d} />
        <path className="plate-track" d={d} />
        <circle className="plate-track-start" cx={sx} cy={sy} r={4} />
        <circle className="plate-track-end" cx={ex} cy={ey} r={4.5} />
      </g>
    </g>
  );
}
