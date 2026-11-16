/**
 * Procedure drawing for the plan view: each route leg as a polyline in lat/lon (arcs
 * sampled, holds as racetracks, procedure turns as outbound leg + barb). Approximate on
 * purpose: it shows the shape the learner should have flown, not a TERPS template.
 */
import { resolveFixDef } from '../../procedures/resolve';
import type { CourseRef, Leg } from '../../procedures/schema';
import { courseVariation } from '../../sim/scoring/geometry';
import { magToTrue, normalize360 } from '../../sim/geo/angles';
import { destination, type LatLon } from '../../sim/geo/geodesy';
import type { Scenario } from '../../sim/scenario/scenario';
import type { RouteLeg } from '../../sim/scoring/sequencer';

export interface DrawnLeg {
  index: number;
  phase: RouteLeg['phase'];
  points: LatLon[];
  /** The start's lead-in (start position to the start fix), not a procedure leg. */
  leadIn?: boolean;
}

/** One minute at a typical 100-knot approach speed. */
const HOLD_NM_PER_MIN = 100 / 60;
const TURN_DIAMETER_NM = 1.1;

function holdRacetrack(fix: LatLon, inboundTrue: number, turn: 'L' | 'R', legNm: number): LatLon[] {
  const side = normalize360(inboundTrue + (turn === 'R' ? 90 : -90));
  const back = normalize360(inboundTrue + 180);
  const p0 = destination(fix, back, legNm); // start of the inbound leg
  const centreNear = destination(fix, side, TURN_DIAMETER_NM / 2);
  const centreFar = destination(p0, side, TURN_DIAMETER_NM / 2);
  const pts: LatLon[] = [p0, fix];
  // Turn at the fix end: from the inbound course around to outbound.
  for (let a = 0; a <= 180; a += 15) {
    const brg = normalize360(side + 180 + (turn === 'R' ? a : -a));
    pts.push(destination(centreNear, brg, TURN_DIAMETER_NM / 2));
  }
  for (let a = 0; a <= 180; a += 15) {
    const brg = normalize360(side + (turn === 'R' ? a : -a));
    pts.push(destination(centreFar, brg, TURN_DIAMETER_NM / 2));
  }
  return pts;
}

function trueCourse(ref: CourseRef, courseMag: number, sc: Scenario): number {
  return magToTrue(courseMag, courseVariation(ref, sc.world.navdata));
}

export function drawRoute(route: RouteLeg[], sc: Scenario): DrawnLeg[] {
  const nav = sc.world.navdata;
  const fix = (name: string) => sc.fixes[name]!;
  const out: DrawnLeg[] = [];
  let prev: LatLon = sc.initial.aircraft.position;
  // A start with a lead-in begins short of its fix: the route itself starts at that fix (e.g.
  // FQF, then the R-045 feeder), and the lead-in is drawn on its own.
  if (sc.start.leadInNm) {
    const startFix = resolveFixDef(sc.start.position, { navdata: nav, procedure: sc.procedure });
    out.push({ index: -1, phase: 'transition', points: [prev, startFix], leadIn: true });
    prev = startFix;
  }
  for (const r of route) {
    const L: Leg = r.leg;
    let pts: LatLon[] = [];
    switch (L.type) {
      case 'track':
      case 'direct':
        pts = [prev, fix(L.to)];
        prev = fix(L.to);
        break;
      case 'arc': {
        const v = nav.navaids[L.navaid]!;
        const from = L.fromRadialMag;
        const span =
          L.turn === 'R' ? normalize360(L.toRadialMag - from) : -normalize360(from - L.toRadialMag);
        const n = Math.max(2, Math.ceil(Math.abs(span) / 3));
        for (let i = 0; i <= n; i++)
          pts.push(
            destination(
              v.position,
              magToTrue(from + (span * i) / n, v.declinationEastDeg),
              L.radiusNm,
            ),
          );
        pts = [prev, ...pts];
        prev = fix(L.to);
        break;
      }
      case 'hold': {
        const legNm = L.legNm ?? (L.legMinutes ?? 1) * HOLD_NM_PER_MIN;
        pts = holdRacetrack(
          fix(L.fix),
          trueCourse(L.course, L.inboundCourseMag, sc),
          L.turn,
          legNm,
        );
        prev = fix(L.fix);
        break;
      }
      case 'procedureTurn': {
        const f = fix(L.fix);
        const outbound = trueCourse(L.course, L.outboundCourseMag, sc);
        const a = destination(f, outbound, 4);
        const b = destination(a, trueCourse(L.course, L.barbHeadingMag, sc), 2);
        pts = [prev, f, a, b];
        prev = f;
        break;
      }
      case 'final': {
        const faf = fix(L.faf);
        const thr = sc.fixes[L.map.fix]!;
        // Radar vectors (the final is the first leg): no line from the start position.
        pts = r.index === 0 ? [faf, thr] : [prev, faf, thr];
        prev = thr;
        break;
      }
      case 'heading':
      case 'climb':
        break;
    }
    if (pts.length > 1) out.push({ index: r.index, phase: r.phase, points: pts });
  }
  return out;
}
