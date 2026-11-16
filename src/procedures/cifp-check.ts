/**
 * Cross-check a hand-encoded RNAV procedure against its FAA CIFP coding (ARINC 424 legs):
 * fix order, leg types, altitudes, holds, the glidepath and the minimums lines. The procedure
 * JSON is encoded from the plate; this catches transcription errors the schema can't.
 */
import type { CifpApproach, CifpLeg, NavData } from '../sim/navdata/types';
import type { CourseRef, Leg, Procedure } from './schema';

export interface CifpIssue {
  path: string;
  message: string;
}

/** The RNAV fix a course reference starts from, if it names one. */
const refFrom = (c: CourseRef) => ('rnavFrom' in c ? c.rnavFrom : null);

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Altitude a CIFP leg requires at or above (ARINC "+", or "V" for an LNAV-only step-down). */
function cifpMinAlt(l: CifpLeg): number | null {
  return l.altDesc === '+' || l.altDesc === 'V' || l.altDesc === null || l.altDesc === '@'
    ? l.alt1Ft
    : l.altDesc === 'B'
      ? l.alt2Ft
      : null;
}

export function checkAgainstCifp(p: Procedure, nav: NavData): CifpIssue[] {
  const issues: CifpIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (!p.rnav) return [{ path: 'rnav', message: 'not an RNAV procedure' }];
  const apch: CifpApproach | undefined = nav.cifp?.approaches[p.rnav.cifp];
  if (!apch) return [{ path: 'rnav.cifp', message: `${p.rnav.cifp} not in the CIFP extract` }];

  const checkTrack = (leg: Leg, c: CifpLeg, prevFix: string | null, path: string) => {
    if (c.pathTerminator !== 'TF') return add(path, `CIFP has ${c.pathTerminator} ${c.fix}`);
    if (leg.type !== 'track' || leg.to !== c.fix)
      return add(path, `expected a track to ${c.fix} (CIFP TF)`);
    if (refFrom(leg.course) !== prevFix || !('rnavTo' in leg.course) || leg.course.rnavTo !== c.fix)
      add(`${path}.course`, `expected rnavFrom ${prevFix} → rnavTo ${c.fix}`);
    const alt = cifpMinAlt(c);
    if (alt !== null && leg.minAltFt !== alt)
      add(`${path}.minAltFt`, `CIFP ${c.fix} at or above ${alt}, encoded ${leg.minAltFt}`);
  };

  const checkHold = (leg: Leg | undefined, c: CifpLeg, path: string) => {
    if (!leg || leg.type !== 'hold' || leg.fix !== c.fix)
      return add(path, `expected a hold at ${c.fix} (CIFP ${c.pathTerminator})`);
    if (c.turn && leg.turn !== c.turn) add(`${path}.turn`, `CIFP turn ${c.turn}`);
    if (c.distanceNm !== null && leg.legNm !== c.distanceNm)
      add(`${path}.legNm`, `CIFP ${c.distanceNm} NM`);
    if (c.holdMinutes !== null && leg.legMinutes !== c.holdMinutes)
      add(`${path}.legMinutes`, `CIFP ${c.holdMinutes} min`);
    if (c.courseMagDeg !== null) {
      if (angleDiff(leg.inboundCourseMag, c.courseMagDeg) > 1)
        add(`${path}.inboundCourseMag`, `CIFP inbound ${c.courseMagDeg}°`);
      if ('rnavFix' in leg.course && angleDiff(leg.course.courseMag, c.courseMagDeg) > 0.05)
        add(`${path}.course`, `CIFP course ${c.courseMagDeg}°`);
    }
    const alt = cifpMinAlt(c);
    if (alt !== null && leg.minAltFt !== alt) add(`${path}.minAltFt`, `CIFP ${alt}`);
  };

  // ---- Transitions ----
  for (const r of apch.routes.filter((x) => x.routeType === 'A')) {
    const t = p.transitions.find((tr) => {
      const first = tr.legs[0];
      if (!first) return false;
      if (r.legs[0]?.pathTerminator === 'IF')
        return first.type === 'track' && refFrom(first.course) === r.transition;
      return first.type === 'hold' && first.fix === r.transition;
    });
    if (!t) {
      add('transitions', `no transition for CIFP ${r.transition}`);
      continue;
    }
    const base = `transitions.${t.id}`;
    let prev: string | null = null;
    let i = 0;
    for (const c of r.legs) {
      if (c.pathTerminator === 'IF') {
        prev = c.fix;
        continue;
      }
      const leg = t.legs[i];
      if (c.pathTerminator === 'HF') checkHold(leg, c, `${base}.legs[${i}]`);
      else if (leg) checkTrack(leg, c, prev, `${base}.legs[${i}]`);
      else add(`${base}.legs[${i}]`, `missing; CIFP ${c.pathTerminator} ${c.fix}`);
      prev = c.fix;
      i++;
    }
    if (i < t.legs.length) add(`${base}.legs`, `${t.legs.length - i} more legs than the CIFP`);
  }

  // ---- Final route: approach legs to the MAP, then the missed approach ----
  const finalRoute = apch.routes.find((x) => x.routeType !== 'A');
  if (!finalRoute) return [...issues, { path: 'approach', message: 'no CIFP final route' }];
  const mapIdx = finalRoute.legs.findIndex((l) => l.role === 'MAP');
  const toMap = finalRoute.legs.slice(0, mapIdx + 1);
  const missed = finalRoute.legs.slice(mapIdx + 1);
  const fafIdx = toMap.findIndex((l) => l.role === 'FAF');
  const final = p.approach.find((l) => l.type === 'final');
  if (!final || final.type !== 'final')
    return [...issues, { path: 'approach', message: 'no final' }];

  // Intermediate legs (IF → FAF) are track legs in `approach` before the final.
  let prev: string | null = null;
  let ai = 0;
  for (const c of toMap.slice(0, fafIdx + 1)) {
    if (c.pathTerminator === 'IF') {
      prev = c.fix;
      continue;
    }
    const leg = p.approach[ai];
    if (leg) checkTrack(leg, c, prev, `approach[${ai}]`);
    else add(`approach[${ai}]`, `missing; CIFP ${c.pathTerminator} ${c.fix}`);
    prev = c.fix;
    ai++;
  }
  if (p.approach[ai]?.type !== 'final') add(`approach[${ai}]`, 'expected the final after the FAF');
  const faf = toMap[fafIdx]!;
  if (final.faf !== faf.fix) add('final.faf', `CIFP FAF ${faf.fix}`);
  if (final.fafAltFt !== cifpMinAlt(faf)) add('final.fafAltFt', `CIFP ${cifpMinAlt(faf)}`);
  const map = toMap[mapIdx]!;
  if (final.map.fix !== map.fix) add('final.map.fix', `CIFP MAP ${map.fix}`);
  if (!('rnavFrom' in final.course) || final.course.rnavTo !== map.fix)
    add('final.course', `expected an RNAV track to ${map.fix}`);
  // Step-downs between the FAF and the MAP.
  const steps = toMap.slice(fafIdx + 1, mapIdx);
  if (steps.length !== final.stepDowns.length)
    add('final.stepDowns', `CIFP has ${steps.length} step-downs (${steps.map((s) => s.fix)})`);
  steps.forEach((c, j) => {
    const s = final.stepDowns[j];
    if (!s) return;
    if (s.fix !== c.fix) add(`final.stepDowns[${j}].fix`, `CIFP ${c.fix}`);
    if (s.minAltFt !== cifpMinAlt(c))
      add(`final.stepDowns[${j}].minAltFt`, `CIFP ${cifpMinAlt(c)}`);
    if ((c.altDesc === 'V') !== !!s.lnavOnly)
      add(`final.stepDowns[${j}].lnavOnly`, `CIFP altitude description "${c.altDesc}"`);
  });
  // Glidepath: the vertical angle on the MAP leg and the path point.
  const angle = map.verticalAngleDeg === null ? null : Math.abs(map.verticalAngleDeg);
  const gp = final.gp ?? final.descentAngle;
  if (angle !== null && (!gp || Math.abs(gp.angleDeg - angle) > 0.005))
    add('final.gp', `CIFP vertical angle ${angle}°`);
  const pp = apch.pathPoint;
  if (pp) {
    if (!final.gp && apch.minimumsLines.some((l) => l === 'LPV' || l === 'LNAV/VNAV'))
      add('final.gp', 'CIFP has an LPV or LNAV/VNAV glidepath');
    if (gp && Math.abs(gp.angleDeg - pp.gpaDeg) > 0.005)
      add('final.gp.angleDeg', `FAS ${pp.gpaDeg}°`);
    if (gp && Math.abs(gp.tchFt - pp.tchFt) > 1) add('final.gp.tchFt', `FAS TCH ${pp.tchFt} ft`);
  }

  // ---- Missed approach ----
  let mi = 0;
  prev = map.fix;
  for (const c of missed) {
    const leg = p.missed[mi];
    const path = `missed[${mi}]`;
    switch (c.pathTerminator) {
      case 'CA':
        if (leg?.type !== 'climb') add(path, 'expected a climb (CIFP CA)');
        else if (c.alt1Ft !== null && leg.toAltFt !== c.alt1Ft)
          add(`${path}.toAltFt`, `CIFP ${c.alt1Ft}`);
        break;
      case 'DF':
        if (leg?.type !== 'direct' || leg.to !== c.fix)
          add(path, `expected direct ${c.fix} (CIFP DF)`);
        else {
          if (c.turn && leg.turn !== c.turn) add(`${path}.turn`, `CIFP turn ${c.turn}`);
          if (c.alt1Ft !== null && leg.climbToFt !== c.alt1Ft)
            add(`${path}.climbToFt`, `CIFP ${c.alt1Ft}`);
          if (c.flyOver !== !!leg.flyOver) add(`${path}.flyOver`, `CIFP fly-over ${c.flyOver}`);
        }
        break;
      case 'TF':
        if (leg) checkTrack(leg, c, prev, path);
        else add(path, `missing; CIFP TF ${c.fix}`);
        break;
      case 'HM':
      case 'HA':
      case 'HF':
        checkHold(leg, c, path);
        break;
      default:
        add(path, `CIFP leg ${c.pathTerminator} is not supported`);
    }
    prev = c.fix ?? prev;
    mi++;
  }
  if (mi !== p.missed.length) add('missed', `${p.missed.length} legs encoded, CIFP has ${mi}`);

  // ---- Minimums lines ----
  const encoded = p.minimums
    .map((m) => m.kind)
    .filter((k) => k !== 'ILS' && k !== 'LOC' && k !== 'VOR');
  const want = apch.minimumsLines.filter((l) => l !== 'N');
  if ([...encoded].sort().join() !== [...want].sort().join())
    add('minimums', `CIFP lines ${want.join(', ')}; encoded ${encoded.join(', ')}`);

  return issues;
}
