/**
 * TAA rules (V3, KOGA):
 * - taa-altitude: never more than 100 ft below the minimum altitude of the TAA area and ring
 *   the aircraft is in, until the IAF;
 * - taa-reversal: arriving from a course-reversal area, the hold-in-lieu at the IAF is flown;
 *   from a straight-in (NoPT) area a reversal is the existing `nopt-reversal` note.
 * The area of the arrival is where the aircraft first is inside the TAA.
 */
import { activePlan } from '../../gps/receiver';
import { taaPosition } from '../../scenario/taa';
import { clock, fmtFt, type Rule, type ScoreItem } from './types';

const TOLERANCE_FT = 100;

interface TaaState {
  /** Area of the arrival (the first area the aircraft is in). */
  arrivalArea: string | null;
  arrivalNoPT: boolean;
  /** The IAF was reached (the TAA altitudes no longer apply). */
  atIaf: boolean;
  worst: { belowFt: number; tick: number; altFt: number; minFt: number; area: string } | null;
  /** The GPS flew the hold-in-lieu at the IAF. */
  holdFlown: boolean;
}

export const taaRules: Rule<TaaState> = {
  init: () => ({
    arrivalArea: null,
    arrivalNoPT: true,
    atIaf: false,
    worst: null,
    holdFlown: false,
  }),
  step(s, { scenario, state, seq }) {
    const taa = scenario.procedure.taa;
    if (!taa) return s;
    const iafPos = scenario.fixes[taa.iaf];
    if (!iafPos) return s;
    let out = s;
    if (!out.holdFlown && state.gps.hold) {
      const leg = activePlan(state.gps, scenario.world.gps)?.legs[state.gps.leg];
      if (leg?.kind === 'hold' && leg.inLieu && leg.fix === taa.iaf)
        out = { ...out, holdFlown: true };
    }
    if (out.atIaf) return out;
    if (seq.passages.some((p) => p.fix === taa.iaf)) return { ...out, atIaf: true };
    const mv = scenario.world.gps?.db.magVarEastDeg ?? scenario.world.magVarEastDeg;
    const pos = taaPosition(taa, iafPos, mv, state.aircraft.position);
    if (!pos) return out;
    if (out.arrivalArea === null)
      out = { ...out, arrivalArea: pos.area.name, arrivalNoPT: pos.area.noPT };
    const below = pos.ring.minAltFt - state.aircraft.altitudeFt;
    if (below > TOLERANCE_FT && (!out.worst || below > out.worst.belowFt))
      out = {
        ...out,
        worst: {
          belowFt: below,
          tick: state.tick,
          altFt: state.aircraft.altitudeFt,
          minFt: pos.ring.minAltFt,
          area: pos.area.name,
        },
      };
    return out;
  },
  finish(s, last): ScoreItem[] {
    const taa = last.scenario.procedure.taa;
    if (!taa || s.arrivalArea === null) return [];
    const items: ScoreItem[] = [
      {
        id: 'taa-altitude',
        title: `TAA altitudes until ${taa.iaf}`,
        status: s.worst ? 'fail' : 'pass',
        measured: s.worst
          ? `${fmtFt(s.worst.altFt)} in the ${s.worst.area} (minimum ${fmtFt(s.worst.minFt)}) at ${clock(s.worst.tick)}`
          : `At or above the TAA altitudes (arrived in the ${s.arrivalArea})`,
        ...(s.worst ? { tick: s.worst.tick } : {}),
      },
    ];
    if (!s.arrivalNoPT)
      items.push({
        id: 'taa-reversal',
        title: `Course reversal (hold) at ${taa.iaf} when arriving from the ${s.arrivalArea}`,
        status: s.holdFlown ? 'pass' : 'fail',
        measured: s.holdFlown
          ? `The hold-in-lieu at ${taa.iaf} was flown.`
          : `No hold at ${taa.iaf}: from this area the approach needs the course reversal (load the IAF with "Hold at ${taa.iaf}").`,
      });
    return items;
  },
};
