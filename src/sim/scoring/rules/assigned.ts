/**
 * assigned-altitude (V3): the altitude ATC assigns in the start's clearance ("descend and
 * maintain N", "maintain N until established") is kept until the aircraft is on a published
 * segment: past the cleared fix (`assigned.until`), or, without one, established on the route's
 * first leg (on the arc, on the feeder course, on the final for vectors), or, in a TAA area,
 * once down to it (the TAA altitudes take over). Fails when the
 * aircraft went below it before then, or was still well above it by then (not descended).
 */
import { distanceNm } from '../../geo/geodesy';
import { taaPosition } from '../../scenario/taa';
import { coursePosition, established } from '../geometry';
import { currentLeg, PASSAGE_NM } from '../sequencer';
import { clock, fmtFt, type Rule, type ScoreItem, type StepContext } from './types';

/** Below the assigned altitude by more than this: descended early. */
const BELOW_FT = 100;
/** Still above it by more than this at the end: did not descend. */
const ABOVE_FT = 200;

interface AssignedState {
  /** Tick the aircraft reached a published segment (the assignment ended). */
  endTick: number | null;
  endAltFt: number;
  lowestFt: number;
  lowestTick: number;
}

/** On a published segment: past the cleared fix, or established on the route's first leg. */
function onSegment(ctx: StepContext): boolean {
  const { seq, scenario: sc, state } = ctx;
  if (seq.index > 0 || seq.fafTick !== null || seq.missedTick !== null) return true;
  const ac = { position: state.aircraft.position, altitudeFt: state.aircraft.altitudeFt };
  // In a TAA area, cleared for the approach: once down to the assigned altitude, the TAA
  // altitudes apply (`taa-altitude`), so a descent to the area's ring altitude is allowed.
  const taa = sc.procedure.taa;
  const iaf = taa && sc.fixes[taa.iaf];
  if (taa && iaf && ac.altitudeFt <= sc.start.assigned.altFt + ABOVE_FT) {
    const mv = sc.world.gps?.db.magVarEastDeg ?? sc.world.magVarEastDeg;
    if (taaPosition(taa, iaf, mv, ac.position)) return true;
  }
  const until = sc.start.assigned.until;
  if (until) {
    const fix = sc.fixes[until];
    return !!fix && distanceNm(fix, ac.position) <= PASSAGE_NM;
  }
  const leg = currentLeg(seq).leg;
  const nav = sc.world.navdata;
  switch (leg.type) {
    case 'track':
    case 'final':
      return established(coursePosition(leg.course, ac, nav), state.aircraft.headingTrueDeg, 1.0);
    case 'arc': {
      const v = nav.navaids[leg.navaid];
      return !!v && Math.abs(distanceNm(v.position, ac.position) - leg.radiusNm) <= 1.0;
    }
    default:
      return false;
  }
}

export const assignedAltitude: Rule<AssignedState> = {
  init: (sc) => ({
    endTick: null,
    endAltFt: 0,
    lowestFt: sc.initial.aircraft.altitudeFt,
    lowestTick: sc.initial.tick,
  }),
  step(s, ctx) {
    if (s.endTick !== null) return s;
    const alt = ctx.state.aircraft.altitudeFt;
    const low = alt < s.lowestFt ? { lowestFt: alt, lowestTick: ctx.state.tick } : {};
    if (onSegment(ctx)) return { ...s, ...low, endTick: ctx.state.tick, endAltFt: alt };
    return Object.keys(low).length ? { ...s, ...low } : s;
  },
  finish(s, last): ScoreItem[] {
    const { altFt, until } = last.scenario.start.assigned;
    const where = until ?? 'established on the approach';
    const title = `Assigned altitude ${fmtFt(altFt)} until ${where}`;
    if (s.endTick === null) return [];
    if (s.lowestFt < altFt - BELOW_FT)
      return [
        {
          id: 'assigned-altitude',
          title,
          status: 'fail',
          measured: `Descended to ${fmtFt(s.lowestFt)} at ${clock(s.lowestTick)}, below the assigned ${fmtFt(altFt)}, before ${until ? `reaching ${until}` : 'being established on the approach'}.`,
          tick: s.lowestTick,
        },
      ];
    if (s.endAltFt > altFt + ABOVE_FT)
      return [
        {
          id: 'assigned-altitude',
          title,
          status: 'fail',
          measured: `Still at ${fmtFt(s.endAltFt)} ${until ? `at ${until}` : 'when established'} (${clock(s.endTick)}): not down to the assigned ${fmtFt(altFt)}.`,
          tick: s.endTick,
        },
      ];
    return [
      {
        id: 'assigned-altitude',
        title,
        status: 'pass',
        measured: `${fmtFt(s.endAltFt)} ${until ? `at ${until}` : 'when established'} (${clock(s.endTick)}), lowest before then ${fmtFt(s.lowestFt)}.`,
        tick: s.endTick,
      },
    ];
  },
};
