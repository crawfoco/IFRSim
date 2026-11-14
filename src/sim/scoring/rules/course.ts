/**
 * Final approach tracking inside the FAF:
 * - course deviation within half scale (LOC ±1.25°, VOR ±5°);
 * - glideslope deviation within half scale (±0.35°), ILS with the glideslope in service.
 * Measured geometrically from the FAF until the missed approach or the end (the
 * glideslope only above the DA; a VOR course not within 1 NM of the station).
 */
import { activeMinimums } from '../../scenario/scenario';
import { GS_FULL_SCALE_DEG, gsIndication } from '../../nav/gs';
import { LOC_FULL_SCALE_DEG } from '../../nav/loc';
import { VOR_FULL_SCALE_DEG } from '../../nav/vor';
import { coursePosition } from '../geometry';
import { clock, type Rule, type ScoreItem } from './types';

interface DevState {
  maxDeg: number;
  maxTick: number;
  samples: number;
}

/** VOR finals: angular deviation is not judged this close to the station. */
const NEAR_STATION_NM = 1.0;

const inFinalSegment = (fafTick: number | null, missedTick: number | null) =>
  fafTick !== null && missedTick === null;

export const finalCourse: Rule<DevState & { isLoc: boolean }> = {
  init: (sc) => ({ maxDeg: 0, maxTick: 0, samples: 0, isLoc: 'loc' in sc.final.course }),
  step(s, { seq, scenario, state }) {
    if (!inFinalSegment(seq.fafTick, seq.missedTick)) return s;
    const ac = { position: state.aircraft.position, altitudeFt: state.aircraft.altitudeFt };
    const pos = coursePosition(scenario.final.course, ac, scenario.world.navdata);
    // Over a VOR (KAKO's FAF is the station) the angle means nothing: skip the first NM.
    if (!s.isLoc && pos.distanceNm < NEAR_STATION_NM) return s;
    const d = Math.abs(pos.offsetDeg);
    return d > s.maxDeg
      ? { ...s, maxDeg: d, maxTick: state.tick, samples: s.samples + 1 }
      : { ...s, samples: s.samples + 1 };
  },
  finish(s): ScoreItem[] {
    if (s.samples === 0) return [];
    const half = (s.isLoc ? LOC_FULL_SCALE_DEG : VOR_FULL_SCALE_DEG) / 2;
    const dots = (s.maxDeg / half).toFixed(1);
    const fail = s.maxDeg > half;
    return [
      {
        id: 'final-course',
        title: `${s.isLoc ? 'Localizer' : 'Final course'} within half scale inside the FAF`,
        status: fail ? 'fail' : 'pass',
        measured: `Largest deviation ${dots} dot${dots === '1.0' ? '' : 's'} (${s.maxDeg.toFixed(2)}°) at ${clock(s.maxTick)}`,
        ...(fail ? { tick: s.maxTick } : {}),
      },
    ];
  },
};

export const glideslope: Rule<DevState & { applies: boolean }> = {
  init: (sc) => ({
    maxDeg: 0,
    maxTick: 0,
    samples: 0,
    applies: !!sc.final.glideslope && !sc.options.gsOutOfService,
  }),
  step(s, { seq, scenario, state }) {
    if (!s.applies || !inFinalSegment(seq.fafTick, seq.missedTick)) return s;
    if (!('loc' in scenario.final.course)) return s;
    const gp = scenario.world.glidePaths[scenario.final.course.loc];
    if (!gp) return s;
    const da = activeMinimums(scenario.procedure, false, state.panel.iasCmdKt).altFt;
    if (state.aircraft.altitudeFt < da) return s;
    const ind = gsIndication(
      { position: state.aircraft.position, altitudeFt: state.aircraft.altitudeFt },
      gp,
    );
    const d = Math.abs(ind.offsetDeg);
    return d > s.maxDeg
      ? { ...s, maxDeg: d, maxTick: state.tick, samples: s.samples + 1 }
      : { ...s, samples: s.samples + 1 };
  },
  finish(s): ScoreItem[] {
    if (!s.applies || s.samples === 0) return [];
    const half = GS_FULL_SCALE_DEG / 2;
    const fail = s.maxDeg > half;
    return [
      {
        id: 'glideslope',
        title: 'Glideslope within half scale inside the FAF',
        status: fail ? 'fail' : 'pass',
        measured: `Largest deviation ${(s.maxDeg / half).toFixed(1)} dots (${s.maxDeg.toFixed(2)}°) at ${clock(s.maxTick)}`,
        ...(fail ? { tick: s.maxTick } : {}),
      },
    ];
  },
};
