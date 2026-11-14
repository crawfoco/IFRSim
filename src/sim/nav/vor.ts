/** VOR receiver: radial, CDI deviation, TO/FROM and flag, as a real receiver shows them. */
import { clamp, DEG, normalize360, signedAngleDiff, trueToMag } from '../geo/angles';
import { FT_PER_NM, type AircraftFix } from './common';
import { inverse, METRES_PER_NM } from '../geo/geodesy';
import type { Navaid, ServiceVolume } from '../navdata/types';

export const VOR_FULL_SCALE_DEG = 10;
/** Half-width of the to/from ambiguity band abeam the station. */
const AMBIGUITY_DEG = 1;
/** Above this elevation angle (a 50° half-angle cone) the aircraft is in the cone of confusion. */
const CONE_DEG = 40;

export interface VorIndication {
  kind: 'VOR';
  /** True when the needle is unusable (out of range, overhead, abeam). */
  flag: boolean;
  toFrom: 'TO' | 'FROM' | 'OFF';
  /** Displayed needle, ±10°; + = course is to the right. 0 when flagged. */
  deviationDeg: number;
  /** Unclamped angular offset (same sign as deviation), for the autopilot. */
  offsetDeg: number;
  /** Magnetic radial the aircraft is on (station declination). */
  radialMagDeg: number;
  /** Ground distance from the VOR. */
  distanceNm: number;
  /**
   * How far the radial's local direction at the aircraft has turned from its direction at
   * the station (meridian convergence along the geodesic). Add to a course to get the
   * direction of the course line where the aircraft is.
   */
  convergenceDeg: number;
}

/** FAA standard service volume (AIM 1-1-8), simplified to the altitudes V1 flies. */
export function vorServiceRangeNm(sv: ServiceVolume, aglFt: number): number {
  switch (sv) {
    case 'T':
      return 25;
    case 'L':
      return 40;
    case 'H':
      return aglFt < 14_500 ? 40 : 100;
  }
}

export function vorIndication(ac: AircraftFix, station: Navaid, obsDegMag: number): VorIndication {
  const g = inverse(station.position, ac.position);
  const distanceNm = g.distanceM / METRES_PER_NM;
  const radialMagDeg = trueToMag(g.initialBearingDeg, station.declinationEastDeg);
  const convergenceDeg =
    distanceNm > 0 ? signedAngleDiff(g.finalBearingDeg, g.initialBearingDeg) : 0;

  const diff = signedAngleDiff(radialMagDeg, obsDegMag); // + = clockwise of the course
  const toFrom = Math.abs(diff) > 90 ? 'TO' : 'FROM';
  // FROM: clockwise of the course → course lies left → needle left (−).
  // TO:   clockwise of the reciprocal → course lies right → needle right (+).
  const offsetDeg =
    toFrom === 'FROM' ? -diff : signedAngleDiff(normalize360(radialMagDeg + 180), obsDegMag);

  const aglFt = ac.altitudeFt - station.elevationFt;
  const elevationAngle = Math.atan2(aglFt, distanceNm * FT_PER_NM) / DEG;
  const flag =
    distanceNm > vorServiceRangeNm(station.serviceVolume, aglFt) ||
    elevationAngle > CONE_DEG ||
    Math.abs(Math.abs(diff) - 90) < AMBIGUITY_DEG;

  return {
    kind: 'VOR',
    flag,
    toFrom: flag ? 'OFF' : toFrom,
    deviationDeg: flag ? 0 : clamp(offsetDeg, -VOR_FULL_SCALE_DEG, VOR_FULL_SCALE_DEG),
    offsetDeg,
    radialMagDeg,
    distanceNm,
    convergenceDeg,
  };
}
