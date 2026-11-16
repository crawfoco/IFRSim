/**
 * Terminal arrival area (TAA, V3): which area and ring of the TAA the aircraft is in, by the
 * magnetic course to the IAF and the distance from it. Pure.
 */
import type { Taa } from '../../procedures/schema';
import { normalize360, trueToMag } from '../geo/angles';
import { distanceNm, initialBearingTrueDeg, type LatLon } from '../geo/geodesy';

export interface TaaPosition {
  area: Taa['areas'][number];
  /** The ring the aircraft is in (the innermost ring whose radius contains it). */
  ring: Taa['areas'][number]['rings'][number];
  courseToIafMag: number;
  distanceNm: number;
}

/** True when `c` lies clockwise from `from` to `to` (degrees, inclusive). */
export function inArc(c: number, from: number, to: number): boolean {
  const span = normalize360(to - from);
  return normalize360(c - from) <= span;
}

/**
 * The TAA area and ring at `p`, or null outside the TAA (beyond its outer ring). Magnetic
 * courses use the IAF's variation.
 */
export function taaPosition(
  taa: Taa,
  iafPos: LatLon,
  magVarEastDeg: number,
  p: LatLon,
): TaaPosition | null {
  const d = distanceNm(p, iafPos);
  const course =
    d < 1e-6 ? 0 : normalize360(trueToMag(initialBearingTrueDeg(p, iafPos), magVarEastDeg));
  const area = taa.areas.find((a) => inArc(course, a.fromCourseMag, a.toCourseMag));
  if (!area) return null;
  const ring = [...area.rings].sort((a, b) => a.withinNm - b.withinNm).find((r) => d <= r.withinNm);
  if (!ring) return null;
  return { area, ring, courseToIafMag: course, distanceNm: d };
}
