import type { LatLon } from '../geo/geodesy';

export const FT_PER_NM = 6076.115;
/** Mean earth radius in feet, for the small curvature correction on slant geometry. */
export const EARTH_RADIUS_FT = 20_902_231;

/** What a receiver needs to know about the aircraft. */
export interface AircraftFix {
  position: LatLon;
  altitudeFt: number;
}

/**
 * Height above a station's tangent plane. The earth falls away below that plane by d²/2R,
 * so an aircraft at a given MSL altitude sits lower relative to a straight beam.
 */
export function heightAboveTangentFt(altitudeFt: number, stationElevFt: number, groundNm: number) {
  const dFt = groundNm * FT_PER_NM;
  return altitudeFt - stationElevFt - (dFt * dFt) / (2 * EARTH_RADIUS_FT);
}
