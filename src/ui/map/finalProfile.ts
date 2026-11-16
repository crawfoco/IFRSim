/**
 * Geometry for the debrief's final-approach profile: distances measured along the final
 * course to the landing threshold, the charted fixes with their minimum altitudes, the
 * glidepath (glideslope or charted descent angle) and the flown altitude on the final.
 */
import { distanceNm, initialBearingTrueDeg, type LatLon } from '../../sim/geo/geodesy';
import type { ActiveMinimums, Scenario } from '../../sim/scenario/scenario';
import type { DebriefSample } from '../../sim/scoring/analyze';
import type { RouteLeg } from '../../sim/scoring/sequencer';

const FT_PER_NM = 1852 / 0.3048;
/** Samples farther than this off the final course are not drawn on the profile. */
const MAX_CROSS_TRACK_NM = 2;
/** The profile starts this far outside the FAF. */
export const OUTSIDE_FAF_NM = 1;

/**
 * Along-track (positive before the threshold) and cross-track distance of `p` from the
 * threshold, measured on the final course (true).
 */
export function toThreshold(
  p: LatLon,
  threshold: LatLon,
  courseTrueDeg: number,
): { alongNm: number; crossNm: number } {
  const d = distanceNm(p, threshold);
  if (d < 1e-9) return { alongNm: 0, crossNm: 0 };
  // Measured at the threshold, where the final course is defined (no meridian convergence).
  const rel = ((initialBearingTrueDeg(threshold, p) - courseTrueDeg - 180) * Math.PI) / 180;
  return { alongNm: d * Math.cos(rel), crossNm: -d * Math.sin(rel) };
}

/** Altitude (MSL) of a glidepath at `distNm` from the threshold. */
export function glidepathAltFt(
  thresholdElevFt: number,
  tchFt: number,
  angleDeg: number,
  distNm: number,
): number {
  return thresholdElevFt + tchFt + distNm * FT_PER_NM * Math.tan((angleDeg * Math.PI) / 180);
}

/** Distance from the threshold at which a glidepath reaches `altFt`. */
export function glidepathDistNm(
  thresholdElevFt: number,
  tchFt: number,
  angleDeg: number,
  altFt: number,
): number {
  return (altFt - thresholdElevFt - tchFt) / (FT_PER_NM * Math.tan((angleDeg * Math.PI) / 180));
}

export interface ProfileFix {
  name: string;
  role: 'FAF' | 'step' | 'VDP' | 'MAP';
  distNm: number;
  minAltFt: number | null;
}

export interface FinalProfileData {
  /** Right-to-left extent: from `maxNm` (outside the FAF) to 0 (threshold). */
  maxNm: number;
  thresholdElevFt: number;
  fixes: ProfileFix[];
  path: { angleDeg: number; tchFt: number; kind: 'GS' | 'VDA' } | null;
  /** Flown altitude, split where the aircraft left the final (sample index kept). */
  flown: { i: number; distNm: number; altFt: number }[][];
}

export function finalProfile(
  sc: Scenario,
  mins: ActiveMinimums,
  route: readonly RouteLeg[],
  samples: readonly DebriefSample[],
): FinalProfileData {
  const thr = sc.runway.threshold;
  const course = sc.finalCourseTrueDeg;
  const dist = (name: string) => {
    const p = sc.fixes[name];
    return p ? toThreshold(p, thr, course).alongNm : null;
  };
  const f = sc.final;
  const precision = mins.kind === 'DA';
  const fixes: ProfileFix[] = [];
  const add = (name: string, role: ProfileFix['role'], minAltFt: number | null) => {
    const d = dist(name);
    if (d !== null) fixes.push({ name, role, distNm: d, minAltFt });
  };
  add(f.faf, 'FAF', f.fafAltFt);
  for (const s of f.stepDowns)
    if (!(precision && (s.locOnly || s.lnavOnly))) add(s.fix, 'step', s.minAltFt);
  if (!precision) {
    if (f.vdp) add(f.vdp, 'VDP', null);
    add(f.map.fix, 'MAP', null);
  }

  // RNAV: the GPS glidepath (LPV, LNAV/VNAV), or drawn as the advisory angle on the LNAV/LP lines.
  const gp = precision
    ? (f.glideslope ?? f.gp ?? f.descentAngle ?? null)
    : (f.descentAngle ?? f.gp ?? null);
  const path = gp
    ? { angleDeg: gp.angleDeg, tchFt: gp.tchFt, kind: (precision ? 'GS' : 'VDA') as 'GS' | 'VDA' }
    : null;

  // With the glideslope the missed approach point is where the glidepath meets the DA.
  if (precision && path)
    fixes.push({
      name: 'DA',
      role: 'MAP',
      distNm: glidepathDistNm(sc.thresholdElevationFt, path.tchFt, path.angleDeg, mins.altFt),
      minAltFt: null,
    });

  const fafNm = fixes[0]?.distNm ?? 5;
  const maxNm = Math.max(1, Math.ceil(fafNm + OUTSIDE_FAF_NM));

  const flown: FinalProfileData['flown'] = [];
  let run: FinalProfileData['flown'][number] = [];
  samples.forEach((s, i) => {
    const onApproach = route[s.legIndex]?.phase !== 'missed';
    const { alongNm, crossNm } = toThreshold({ latDeg: s.latDeg, lonDeg: s.lonDeg }, thr, course);
    if (onApproach && alongNm >= 0 && alongNm <= maxNm && Math.abs(crossNm) <= MAX_CROSS_TRACK_NM)
      run.push({ i, distNm: alongNm, altFt: s.altitudeFt });
    else if (run.length) {
      flown.push(run);
      run = [];
    }
  });
  if (run.length) flown.push(run);

  return { maxNm, thresholdElevFt: sc.thresholdElevationFt, fixes, path, flown };
}
