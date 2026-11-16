/**
 * RNAV leg geometry: cross-track and along-track to a great-circle track between two points,
 * and RNAV course references resolved to such a track. Pure.
 *
 * Bearings and distances come from the ellipsoidal inverse at the leg's start point, where
 * the great circle is a straight line in the azimuthal-equidistant sense; within 60 NM the
 * cross-track error of this is under 0.001 NM.
 */
import type { CourseRef, RnavCourseRef } from '../../procedures/schema';
import { DEG, magToTrue, normalize360, signedAngleDiff } from '../geo/angles';
import { destination, distanceNm, initialBearingTrueDeg, type LatLon } from '../geo/geodesy';
import { rnavWaypoint } from '../navdata/rnav';
import type { NavData } from '../navdata/types';

export interface TrackLine {
  from: LatLon;
  to: LatLon;
}

export interface TrackPosition {
  /** + = the track is to the right of the aircraft (the aircraft is left of it). */
  xtkNm: number;
  /** Distance along the track from `from` (negative before it). */
  alongNm: number;
  /** Distance along the track still to go to `to` (negative once past it). */
  toGoNm: number;
  /** Length of the leg. */
  legNm: number;
  /** Desired track (true) at the aircraft's abeam point. */
  courseTrueHereDeg: number;
  /** Direct distance to `to`. */
  distanceToNm: number;
}

export function trackPosition(line: TrackLine, p: LatLon): TrackPosition {
  const legNm = distanceNm(line.from, line.to);
  const crs = initialBearingTrueDeg(line.from, line.to);
  const d = distanceNm(line.from, p);
  const brg = d === 0 ? crs : initialBearingTrueDeg(line.from, p);
  const diff = signedAngleDiff(brg, crs) * DEG; // + = aircraft right of the track
  const alongNm = d * Math.cos(diff);
  const xtkNm = -d * Math.sin(diff);
  let courseTrueHereDeg: number;
  if (alongNm < legNm - 0.01) {
    const abeam = destination(line.from, crs, alongNm);
    courseTrueHereDeg = initialBearingTrueDeg(abeam, line.to);
  } else {
    courseTrueHereDeg = normalize360(initialBearingTrueDeg(line.to, line.from) + 180);
  }
  return {
    xtkNm,
    alongNm,
    toGoNm: legNm - alongNm,
    legNm,
    courseTrueHereDeg,
    distanceToNm: distanceNm(p, line.to),
  };
}

/** True course of an RNAV course-through-a-fix reference. */
export function rnavCourseTrueDeg(ref: { rnavFix: string; courseMag: number }, nav: NavData) {
  const wp = rnavWaypoint(nav, ref.rnavFix);
  return magToTrue(ref.courseMag, wp.magVarEastDeg);
}

/** How far back the virtual start of a course-through-a-fix line is placed. */
const COURSE_LINE_NM = 60;

/** An RNAV course reference as a great-circle line ending at its fix. */
export function rnavLine(ref: RnavCourseRef, nav: NavData): TrackLine {
  if ('rnavFrom' in ref)
    return {
      from: rnavWaypoint(nav, ref.rnavFrom).position,
      to: rnavWaypoint(nav, ref.rnavTo).position,
    };
  const to = rnavWaypoint(nav, ref.rnavFix).position;
  const crs = rnavCourseTrueDeg(ref, nav);
  return { from: destination(to, normalize360(crs + 180), COURSE_LINE_NM), to };
}

/** The fix an RNAV reference is flown to. */
export const rnavRefFix = (ref: RnavCourseRef) => ('rnavFrom' in ref ? ref.rnavTo : ref.rnavFix);

/** Magnetic variation for an RNAV reference: its fix's CIFP variation. */
export function rnavVariation(ref: RnavCourseRef, nav: NavData): number {
  return rnavWaypoint(nav, rnavRefFix(ref)).magVarEastDeg;
}

export type { CourseRef };
