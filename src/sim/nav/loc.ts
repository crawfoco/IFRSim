/** Localizer receiver: angular deviation from the front course, coverage and back-course flag. */
import { clamp, magToTrue, normalize360, signedAngleDiff } from '../geo/angles';
import { inverse, METRES_PER_NM } from '../geo/geodesy';
import type { Localizer } from '../navdata/types';
import type { AircraftFix } from './common';

export const LOC_FULL_SCALE_DEG = 2.5;

export interface LocIndication {
  kind: 'LOC';
  flag: boolean;
  /** Aircraft is behind the antenna (back course). V1 does not fly back courses. */
  backCourse: boolean;
  /** Displayed needle, ±2.5°; + = course is to the right. 0 when flagged. */
  deviationDeg: number;
  /** Unclamped angular offset, for the autopilot. */
  offsetDeg: number;
  /** Ground distance from the localizer antenna. */
  distanceNm: number;
  /** Meridian convergence between the antenna and the aircraft (see VorIndication). */
  convergenceDeg: number;
}

/** Standard service volume: ±10° to 18 NM, ±35° to 10 NM (AIM 1-1-9). */
function inCoverage(offsetDeg: number, distanceNm: number, rangeNm = 18): boolean {
  const a = Math.abs(offsetDeg);
  return (a <= 10 && distanceNm <= Math.max(18, rangeNm)) || (a <= 35 && distanceNm <= 10);
}

export function locIndication(
  ac: AircraftFix,
  loc: Localizer,
  /** Expanded service volume along the course (charted procedures beyond 18 NM), NM. */
  rangeOverrideNm?: number,
): LocIndication {
  const g = inverse(loc.position, ac.position);
  const distanceNm = g.distanceM / METRES_PER_NM;
  const outboundTrue = magToTrue(normalize360(loc.courseMagDeg + 180), loc.magVarEastDeg);
  // Seen from the antenna looking out along the approach, clockwise is the inbound pilot's
  // left, so a clockwise offset means the course lies to the pilot's right (+).
  const offsetDeg = signedAngleDiff(g.initialBearingDeg, outboundTrue);
  const backCourse = Math.abs(offsetDeg) > 90;
  const flag = backCourse || !inCoverage(offsetDeg, distanceNm, rangeOverrideNm);
  return {
    kind: 'LOC',
    flag,
    backCourse,
    deviationDeg: flag ? 0 : clamp(offsetDeg, -LOC_FULL_SCALE_DEG, LOC_FULL_SCALE_DEG),
    offsetDeg,
    distanceNm,
    convergenceDeg: distanceNm > 0 ? signedAngleDiff(g.finalBearingDeg, g.initialBearingDeg) : 0,
  };
}
