/**
 * Geometry for scoring: where the aircraft is relative to procedure courses and fixes,
 * computed from the aircraft position (not from what the learner has tuned).
 */
import type { CourseRef } from '../../procedures/schema';
import { DEG, magToTrue, normalize360, signedAngleDiff } from '../geo/angles';
import { distanceNm, initialBearingTrueDeg, type LatLon } from '../geo/geodesy';
import type { NavData } from '../navdata/types';
import type { AircraftFix } from '../nav/common';
import { locIndication } from '../nav/loc';
import { vorIndication } from '../nav/vor';

export interface CoursePosition {
  /** + = the course is to the right of the aircraft (flying the course direction). */
  offsetDeg: number;
  /** Cross-track distance, same sign as offsetDeg. */
  xtkNm: number;
  /** Ground distance from the course's station. */
  distanceNm: number;
  /** Direction of the course line where the aircraft is, true. */
  courseTrueHereDeg: number;
}

/** Position relative to a procedure course (a VOR radial in its direction, or the LOC). */
export function coursePosition(ref: CourseRef, ac: AircraftFix, nav: NavData): CoursePosition {
  if ('loc' in ref) {
    const loc = nav.localizers[ref.loc]!;
    const ind = locIndication(ac, loc);
    return {
      offsetDeg: ind.offsetDeg,
      xtkNm: ind.distanceNm * Math.sin(ind.offsetDeg * DEG),
      distanceNm: ind.distanceNm,
      courseTrueHereDeg: normalize360(
        magToTrue(loc.courseMagDeg, loc.magVarEastDeg) + ind.convergenceDeg,
      ),
    };
  }
  const vor = nav.navaids[ref.navaid]!;
  // Ignore the service volume: geometry, not reception.
  const ind = vorIndication(ac, vor, ref.courseMag, Infinity);
  return {
    offsetDeg: ind.offsetDeg,
    xtkNm: ind.distanceNm * Math.sin(ind.offsetDeg * DEG),
    distanceNm: ind.distanceNm,
    courseTrueHereDeg: normalize360(
      magToTrue(ref.courseMag, vor.declinationEastDeg) + ind.convergenceDeg,
    ),
  };
}

/** True when flying along a course: close to it and heading roughly its way. */
export function established(
  pos: CoursePosition,
  headingTrueDeg: number,
  maxXtkNm = 0.5,
  maxHeadingDeg = 30,
): boolean {
  return (
    Math.abs(pos.xtkNm) <= maxXtkNm &&
    Math.abs(signedAngleDiff(headingTrueDeg, pos.courseTrueHereDeg)) <= maxHeadingDeg
  );
}

/** Magnetic variation used for a course reference's bearings. */
export function courseVariation(ref: CourseRef, nav: NavData): number {
  return 'loc' in ref
    ? nav.localizers[ref.loc]!.magVarEastDeg
    : nav.navaids[ref.navaid]!.declinationEastDeg;
}

/**
 * Distance before a fix along an inbound course: + while still approaching the fix along
 * the course, − once past it. Independent of how close the aircraft came to the fix, so a
 * 1-minute hold or an offset crossing still registers.
 */
export function alongTrackBeforeFixNm(fix: LatLon, inboundTrueDeg: number, p: LatLon): number {
  const d = distanceNm(fix, p);
  if (d === 0) return 0;
  const brg = initialBearingTrueDeg(fix, p);
  return d * Math.cos(signedAngleDiff(brg, normalize360(inboundTrueDeg + 180)) * DEG);
}

/** Inbound course direction (true) at a fix, for a course reference. */
export function inboundTrueAtFix(ref: CourseRef, fix: LatLon, nav: NavData): number {
  return coursePosition(ref, { position: fix, altitudeFt: 0 }, nav).courseTrueHereDeg;
}

/**
 * Crossed `fix` inbound on `ref` between two positions: along-track sign change, close to
 * the course line and heading roughly inbound.
 */
export function crossedInbound(
  ref: CourseRef,
  fix: LatLon,
  prev: LatLon,
  now: LatLon,
  headingTrueDeg: number,
  nav: NavData,
  maxXtkNm = 1.0,
  maxHeadingDeg = 45,
): boolean {
  const inbound = inboundTrueAtFix(ref, fix, nav);
  const a0 = alongTrackBeforeFixNm(fix, inbound, prev);
  const a1 = alongTrackBeforeFixNm(fix, inbound, now);
  if (!(a0 > 0 && a1 <= 0)) return false;
  const off = Math.abs(Math.sqrt(Math.max(0, distanceNm(fix, now) ** 2 - a1 * a1)));
  return off <= maxXtkNm && Math.abs(signedAngleDiff(headingTrueDeg, inbound)) <= maxHeadingDeg;
}
