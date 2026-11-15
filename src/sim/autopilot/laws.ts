/**
 * Autopilot control laws. Lateral laws output a bank command; vertical laws output a
 * vertical-speed command. The aircraft model applies its own limits (standard rate,
 * −1500…+1000 fpm), so the laws only shape the response.
 */
import { clamp, DEG, signedAngleDiff } from '../geo/angles';
import type { GsIndication } from '../nav/gs';
import type { LocIndication } from '../nav/loc';
import type { VorIndication } from '../nav/vor';
import { LOC_FULL_SCALE_DEG } from '../nav/loc';
import { VOR_FULL_SCALE_DEG } from '../nav/vor';

export const GAINS = {
  /** Degrees of bank per degree of heading error. */
  headingBankPerDeg: 1.2,
  /** Degrees of intercept angle per NM of cross-track error. */
  interceptDegPerNm: 100,
  maxInterceptDeg: 45,
  /** fpm per foot of altitude error in ALT. */
  altFpmPerFt: 5,
  /** fpm per foot of glide path error in GS. */
  gsFpmPerFt: 4,
} as const;

const FT_PER_NM = 6076.115;
/** Parallel capture: heading within this of the course direction (not the reciprocal). */
const PARALLEL_CAPTURE_MAX_DEG = 45;

/** Bank command to turn the shorter way onto a heading (exactly 180° turns right). */
export function headingBank(headingTrueDeg: number, targetTrueDeg: number): number {
  return GAINS.headingBankPerDeg * signedAngleDiff(targetTrueDeg, headingTrueDeg);
}

type NavInd = VorIndication | LocIndication;

/** Signed cross-track distance: + = the course lies to the right. */
export function crossTrackNm(ind: NavInd): number {
  return ind.distanceNm * Math.sin(ind.offsetDeg * DEG);
}

/** Direction of the course line where the aircraft is (course plus meridian convergence). */
export function localCourseTrue(ind: NavInd, courseTrueDeg: number): number {
  return courseTrueDeg + ind.convergenceDeg;
}

/** Track to fly: the course, plus an intercept angle proportional to cross-track (max 45°). */
export function trackCommand(ind: NavInd, courseTrueDeg: number): number {
  const intercept = clamp(
    GAINS.interceptDegPerNm * crossTrackNm(ind),
    -GAINS.maxInterceptDeg,
    GAINS.maxInterceptDeg,
  );
  return localCourseTrue(ind, courseTrueDeg) + intercept;
}

/**
 * Capture when the needle is alive and the tracking law would ask for no more intercept
 * than the aircraft already has (plus a small margin), so the turn-on starts on time.
 * Flying parallel to the course, or converging slowly or diverging, the turn-on point never
 * comes: then capture once the needle is within half scale and the heading is within 45° of
 * the course, and let the tracking law turn in (at most a 45° intercept).
 */
export function lateralCaptureReady(
  ind: NavInd,
  headingTrueDeg: number,
  courseTrueDeg: number,
): boolean {
  if (ind.flag) return false;
  const fullScale = ind.kind === 'LOC' ? LOC_FULL_SCALE_DEG : VOR_FULL_SCALE_DEG;
  if (Math.abs(ind.offsetDeg) >= fullScale) return false;
  const xtk = crossTrackNm(ind);
  const angle =
    signedAngleDiff(headingTrueDeg, localCourseTrue(ind, courseTrueDeg)) * Math.sign(xtk);
  // Closure rate goes as sin(angle): a heading nearly opposite the course closes as slowly
  // as one nearly parallel to it, so fold angles past 90° back (180° closes at zero).
  const closing = Math.abs(angle) > 90 ? Math.sign(angle) * (180 - Math.abs(angle)) : angle;
  const alongCourse = Math.abs(angle) <= PARALLEL_CAPTURE_MAX_DEG;
  if (alongCourse && closing < 10 && Math.abs(ind.offsetDeg) <= fullScale / 2) return true;
  return GAINS.interceptDegPerNm * Math.abs(xtk) <= Math.max(closing, 0) + 5;
}

/** VS to hold (or level off at) an altitude. */
export function altitudeVs(targetFt: number, altitudeFt: number): number {
  return GAINS.altFpmPerFt * (targetFt - altitudeFt);
}

/** Start the level-off once the ALT law would ask for no more than the current VS. */
export function altCaptureReady(targetFt: number, altitudeFt: number, vsFpm: number): boolean {
  const toGo = targetFt - altitudeFt;
  if (vsFpm === 0 || Math.sign(toGo) !== Math.sign(vsFpm)) return Math.abs(toGo) < 20;
  return Math.abs(altitudeVs(targetFt, altitudeFt)) <= Math.abs(vsFpm);
}

/** Descent rate that follows a glide path at this ground speed (positive number). */
export function nominalDescentFpm(angleDeg: number, groundSpeedKt: number): number {
  return groundSpeedKt * (FT_PER_NM / 60) * Math.tan(angleDeg * DEG);
}

/** VS command on the glideslope: nominal descent plus a correction toward the beam. */
export function glideslopeVs(gs: GsIndication, angleDeg: number, groundSpeedKt: number): number {
  return -nominalDescentFpm(angleDeg, groundSpeedKt) + GAINS.gsFpmPerFt * gs.verticalErrorFt;
}

/**
 * Capture from below once the GS law would no longer ask for a climb and the aircraft is
 * within half a dot of the beam (either side), so a late capture never starts a dot low.
 */
export function gsCaptureReady(gs: GsIndication, angleDeg: number, groundSpeedKt: number): boolean {
  if (gs.flag) return false;
  return glideslopeVs(gs, angleDeg, groundSpeedKt) <= 0 && Math.abs(gs.offsetDeg) < 0.175;
}
