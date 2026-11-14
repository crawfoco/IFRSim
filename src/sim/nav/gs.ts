/**
 * Glideslope receiver. The glide path is a straight beam at `angleDeg` that crosses the
 * landing threshold at the TCH; it rises from the glide path intercept point (GPI) on the
 * runway centreline. Earth curvature is included: the beam is straight, the earth is not.
 */
import { clamp, DEG, magToTrue, signedAngleDiff } from '../geo/angles';
import { destination, inverse, METRES_PER_NM, type LatLon } from '../geo/geodesy';
import type { Localizer, RunwayEnd } from '../navdata/types';
import { FT_PER_NM, heightAboveTangentFt, type AircraftFix } from './common';

export const GS_FULL_SCALE_DEG = 0.7;
const GS_RANGE_NM = 10;
const GS_LATERAL_DEG = 8;

export interface GlidePath {
  /** Where the beam meets the runway (threshold elevation). */
  gpi: LatLon;
  elevationFt: number;
  angleDeg: number;
  /** Inbound localizer course, true. */
  courseTrueDeg: number;
}

export interface GsIndication {
  kind: 'GS';
  flag: boolean;
  /** Displayed pointer, ±0.7°; + = glide path is above (fly up). 0 when flagged. */
  deviationDeg: number;
  /** Unclamped angular offset, same sign. */
  offsetDeg: number;
  /** Height of the glide path above the aircraft (+ = aircraft low), for the autopilot. */
  verticalErrorFt: number;
  /** Ground distance from the GPI. */
  distanceNm: number;
}

/** Build the glide path for an ILS from its runway end and the plate's TCH. */
export function glidePathFor(loc: Localizer, rwy: RunwayEnd, tchFt: number): GlidePath {
  if (!loc.glideslope) throw new Error(`${loc.id} has no glideslope`);
  const angleDeg = loc.glideslope.angleDeg;
  const courseTrueDeg = magToTrue(loc.courseMagDeg, loc.magVarEastDeg);
  const landing = rwy.displacedThreshold ?? {
    position: rwy.threshold,
    elevationFt: rwy.elevationFt,
  };
  const gpiDistNm = tchFt / Math.tan(angleDeg * DEG) / FT_PER_NM;
  return {
    gpi: destination(landing.position, courseTrueDeg, gpiDistNm),
    elevationFt: landing.elevationFt,
    angleDeg,
    courseTrueDeg,
  };
}

export function gsIndication(ac: AircraftFix, gp: GlidePath): GsIndication {
  const g = inverse(gp.gpi, ac.position);
  const distanceNm = g.distanceM / METRES_PER_NM;
  const dFt = distanceNm * FT_PER_NM;
  const h = heightAboveTangentFt(ac.altitudeFt, gp.elevationFt, distanceNm);
  const offsetDeg = gp.angleDeg - Math.atan2(h, dFt) / DEG;
  const verticalErrorFt = dFt * Math.tan(gp.angleDeg * DEG) - h;
  const lateral = Math.abs(signedAngleDiff(g.initialBearingDeg, gp.courseTrueDeg + 180));
  const flag = distanceNm > GS_RANGE_NM || lateral > GS_LATERAL_DEG;
  return {
    kind: 'GS',
    flag,
    deviationDeg: flag ? 0 : clamp(offsetDeg, -GS_FULL_SCALE_DEG, GS_FULL_SCALE_DEG),
    offsetDeg,
    verticalErrorFt,
    distanceNm,
  };
}
